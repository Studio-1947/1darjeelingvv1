/**
 * Smart search through the database index.
 *
 * lib/search.ts reads a query and ranks listings in memory. Doing that over every listing on every
 * request meant loading the whole table and re-reading every description and profile into words,
 * each time: fine for one district, not for listings across India. Here each listing is read into
 * words once (listing_search, migration 0043) and a search:
 *
 *   1. reads the query against the words listings use (cached for a moment),
 *   2. corrects it and works out which listing words each query word matches (lib/search.ts
 *      planSearch), against the words of the listings of the kind and budget asked for,
 *   3. fetches only the listings holding one of those words (GIN index on listing_search.words),
 *   4. scores them with the same code as the in-memory ranking (lib/search.ts scoreSearch).
 *
 * A listing that holds none of the matched words scores nothing, so the results are the same as
 * ranking every listing. Two kinds of search still read the whole pool: a kind or budget alone
 * ("homestays under 2000") and a search that falls back to listing the whole kind.
 *
 * A listing's words are read again when it changes: a trigger marks it (listings.search_stale) and
 * the next search reads the marked ones first, so no write path has to remember.
 */
import { and, eq, gt, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '../db';
import {
  SEARCH_INDEX_VERSION, allWords, emptyInterpretation, indexFields, planSearch, readSearch, scoreSearch,
  type Indexed, type Interpretation, type ScoredListing, type SearchFields,
} from './search';
import { TtlCache } from './ttlCache';
import { log } from '../config';

type Listing = typeof schema.listings.$inferSelect;

const BATCH = 500;

/** How long a list of the words listings use is reused. Only spelling correction reads it. */
const VOCAB_TTL_MS = 30_000;
const vocabCache = new TtlCache<string[]>(VOCAB_TTL_MS, 50);

let versionChecked = false;

/**
 * Reads into words every listing marked as changed (and, once per process, every listing read by
 * an older version of the reading). Safe to run from several requests at once: each batch locks
 * its rows and skips rows another request is already reading.
 */
export async function refreshSearchIndex(): Promise<number> {
  if (!versionChecked) {
    await db.execute(sql`
      update ${schema.listings} set search_stale = true
      where not search_stale and not exists (
        select 1 from ${schema.listingSearch} ls
        where ls.listing_id = ${schema.listings.id} and ls.v = ${SEARCH_INDEX_VERSION}
      )`);
    versionChecked = true;
  }
  let done = 0;
  // The usual case, nothing changed: one index lookup (listings_search_stale_idx), no transaction.
  const any = await db.select({ id: schema.listings.id }).from(schema.listings).where(sql`${schema.listings.searchStale}`).limit(1);
  if (!any.length) return 0;
  for (;;) {
    const n = await db.transaction(async (tx) => {
      const rows = await tx.select({
        id: schema.listings.id, title: schema.listings.title, type: schema.listings.type,
        description: schema.listings.description, location: schema.listings.location, price: schema.listings.price,
        tags: schema.listings.tags, extras: schema.listings.extras,
      })
        .from(schema.listings)
        .where(sql`${schema.listings.searchStale}`)
        .limit(BATCH)
        .for('update', { skipLocked: true });
      if (!rows.length) return 0;
      const values = rows.map((r) => {
        const fields = indexFields(r);
        return { listingId: r.id, words: allWords(fields), fields, v: SEARCH_INDEX_VERSION };
      });
      await tx.insert(schema.listingSearch).values(values).onConflictDoUpdate({
        target: schema.listingSearch.listingId,
        set: { words: sql`excluded.words`, fields: sql`excluded.fields`, v: sql`excluded.v` },
      });
      await tx.update(schema.listings).set({ searchStale: false }).where(inArray(schema.listings.id, rows.map((r) => r.id)));
      return rows.length;
    });
    done += n;
    if (n < BATCH) break;
  }
  // New words: the next search must see them.
  if (done) vocabCache.clear();
  return done;
}

/** Every distinct word of the listings matching `where`. */
function vocabulary(key: string, where: SQL | undefined): Promise<string[]> {
  // Tests truncate tables between cases; a cached list would outlive them.
  if (process.env.APP_ENV === 'test') return readVocabulary(where);
  return vocabCache.get(key, () => readVocabulary(where));
}
async function readVocabulary(where: SQL | undefined): Promise<string[]> {
  const rows = await db.selectDistinct({ w: sql<string>`unnest(${schema.listingSearch.words})` })
    .from(schema.listingSearch)
    .innerJoin(schema.listings, eq(schema.listings.id, schema.listingSearch.listingId))
    .where(where);
  return rows.map((r) => r.w);
}

export async function searchListings(opts: {
  term: string;
  type: string | null;
  /** The route's filters: visibility, kind, day. */
  conditions: (SQL | undefined)[];
  /** Names those filters for the vocabulary cache (e.g. "homestay|2026-12-01"). */
  cacheKey: string;
  /** A small lift per listing (verified hosts), worked out for the listings found. */
  boostFor?: (rows: Listing[]) => Promise<(l: Listing) => number>;
}): Promise<{ results: ScoredListing<Listing>[]; interpretation: Interpretation }> {
  // Never fails a search: on an error the listings already read are searched, and the next search
  // tries again.
  await refreshSearchIndex().catch((e) => log.error(`Search index refresh failed: ${e?.message || e}`));
  const where = and(...opts.conditions);

  const every = new Set(await vocabulary(opts.cacheKey, where));
  const reading = readSearch(opts.term, opts.type, (w) => every.has(w) || every.has(w + 's'));

  // The pool: the kind and budget asked for, as lib/search.ts inPool reads them.
  const { wanted, base } = reading;
  const poolConditions = [...opts.conditions];
  if (wanted) poolConditions.push(eq(schema.listings.type, wanted));
  if (base.max_price != null) poolConditions.push(gt(schema.listings.price, 0), lte(schema.listings.price, base.max_price));
  const poolWhere = and(...poolConditions);
  const poolVocab = wanted || base.max_price != null
    ? await vocabulary(`${opts.cacheKey}|${wanted || ''}|${base.max_price ?? ''}`, poolWhere)
    : [...every];

  const plan = planSearch(reading, poolVocab);
  if (plan.empty) return { results: [], interpretation: emptyInterpretation(plan) };

  const fetch = async (whole: boolean): Promise<Indexed<Listing>[]> => {
    let filter = poolWhere;
    if (!whole) {
      if (!plan.matchWords.size) return [];
      // One array parameter, however many words a short prefix or typo matches.
      filter = and(poolWhere, sql`${schema.listingSearch.words} && ${sql.param([...plan.matchWords])}::text[]`);
    }
    const rows = await db.select({ l: schema.listings, f: schema.listingSearch.fields })
      .from(schema.listings)
      .innerJoin(schema.listingSearch, eq(schema.listingSearch.listingId, schema.listings.id))
      .where(filter);
    return rows.map((r) => ({ listing: r.l, fields: r.f as SearchFields }));
  };
  const score = async (indexed: Indexed<Listing>[]) => {
    const boost = opts.boostFor ? await opts.boostFor(indexed.map((x) => x.listing)) : undefined;
    return scoreSearch(plan, opts.term, indexed, boost);
  };

  let out = await score(await fetch(plan.wholePool));
  // Nothing held the words, but the query named a kind of place: list that kind instead.
  if (!out.results.length && !plan.wholePool && plan.mayFallBack) out = await score(await fetch(true));
  return out;
}

/** For tests: forget the cached vocabularies and the version check. */
export function resetSearchIndexState() {
  vocabCache.clear();
  versionChecked = false;
}
