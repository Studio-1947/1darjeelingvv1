import { describe, it, expect, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../src/db';
import { DEMO_BUSINESSES, SEED_LISTINGS } from '../src/seed_data';
import { rank, type SearchableListing } from '../src/lib/search';
import { refreshSearchIndex, resetSearchIndexState, searchListings } from '../src/lib/searchIndex';

/**
 * The search index (lib/searchIndex.ts) must find exactly what ranking every listing in memory
 * finds (lib/search.ts rank): same listings, same order, same "Did you mean". Same directory as
 * test/smartSearch.test.ts.
 */
const fixtures: SearchableListing[] = [
  ...[...SEED_LISTINGS, ...DEMO_BUSINESSES].map((l, i) => ({
    id: `seed-${i}`, title: l.title, type: l.type, description: l.description || '', location: l.location,
    price: l.price ?? 0, tags: l.tags ?? [], extras: {},
  })),
  {
    id: 'host-driver', title: 'Pemba Rides', type: 'driver', description: 'Clean car, careful driver.',
    location: 'Darjeeling', price: 2200, tags: [],
    extras: { routes: [{ from: 'Darjeeling', to: 'Tiger Hill', price: 1800 }], phone: '9800000000' },
  },
  {
    id: 'host-stay', title: 'Cloud Nine Homestay', type: 'homestay', description: 'Wooden rooms and home food.',
    location: 'Ghoom', price: 3500, tags: [],
    extras: { rooms: [{ name: 'Deluxe room', price: 3500 }], meals: [{ name: 'Thukpa dinner', price: 250 }] },
  },
];

async function load(list: SearchableListing[]) {
  await db.insert(schema.listings).values(list.map((l) => ({
    id: l.id, title: l.title, type: l.type, description: l.description || '', location: l.location || '',
    price: l.price ?? 0, tags: l.tags ?? [], extras: (l.extras ?? {}) as Record<string, any>,
    providerId: 'p-test', createdAt: new Date().toISOString(),
  })));
}

const QUERIES: [string, string?][] = [
  ['taxi to tiger hill'], ['cheap stay in ghoom'], ['homestay near tiger hill'], ['momo'], ['momo', 'homestay'],
  ['cab'], ['ghum'], ['ghoom monastery'], ['darjeling'], ['kanchanjunga view'], ['homstay'], ['resturant'],
  ['stay under 2000'], ['homestay under 3k'], ['cheap homestay'], ['thukpa'], ['deluxe room'], ['9800000000'],
  ['the'], ['darjeeling'], ['darjeeling homestay'], ['darjeeling tea'], ['mall road'], ['batasia loop'],
  ['tiger hill', 'driver'], ['nonsense words here'], ['taxi to nowhereville'], ['cheap taxi to nowhereville'],
  ['natural'], ['दार्जिलिंग में होमस्टे'], ['ঘুম'], ['tea garden kurseong'], ['mirick lake'], ['rides'],
  ['homestays', 'homestay'], ['stays', 'driver'], ['peace pagoda'], ['ridge'], ['zoo'], ['pemba'],
];

describe('search through the index', () => {
  beforeEach(() => resetSearchIndexState());

  it('finds exactly what ranking every listing in memory finds', async () => {
    await load(fixtures);
    for (const [q, type] of QUERIES) {
      const want = rank(fixtures, q, { type });
      const got = await searchListings({ term: q, type: type ?? null, conditions: type ? [eq(schema.listings.type, type)] : [], cacheKey: type || '' });
      const label = `${q} [${type || 'any'}]`;
      expect(got.results.map((r) => r.item.id), label).toEqual(want.results.map((r) => r.item.id));
      expect(got.results.map((r) => r.score), label).toEqual(want.results.map((r) => r.score));
      expect(got.interpretation, label).toEqual(want.interpretation);
    }
  });

  it('reads a new listing, and a changed one again, before the next search', async () => {
    await load(fixtures.slice(0, 5));
    expect((await searchListings({ term: 'zzyzx', type: null, conditions: [], cacheKey: '' })).results).toHaveLength(0);

    await load([{ id: 'new-1', title: 'Zzyzx Homestay', type: 'homestay', description: 'x', location: 'Mirik', price: 900, tags: [], extras: {} }]);
    const found = await searchListings({ term: 'zzyzx', type: null, conditions: [], cacheKey: '' });
    expect(found.results.map((r) => r.item.id)).toEqual(['new-1']);

    // A changed name: the trigger marks it, the next search reads it again.
    await db.update(schema.listings).set({ title: 'Quokka Homestay' }).where(eq(schema.listings.id, 'new-1'));
    const [row] = await db.select({ stale: schema.listings.searchStale }).from(schema.listings).where(eq(schema.listings.id, 'new-1'));
    expect(row.stale).toBe(true);
    expect((await searchListings({ term: 'zzyzx', type: null, conditions: [], cacheKey: '' })).results).toHaveLength(0);
    expect((await searchListings({ term: 'quokka', type: null, conditions: [], cacheKey: '' })).results.map((r) => r.item.id)).toEqual(['new-1']);

    // A change that is not a word (the price) does not mark it.
    await db.update(schema.listings).set({ price: 950 }).where(eq(schema.listings.id, 'new-1'));
    const [after] = await db.select({ stale: schema.listings.searchStale }).from(schema.listings).where(eq(schema.listings.id, 'new-1'));
    expect(after.stale).toBe(false);
  });

  it('reads listings again when the reading changes version, and drops a deleted one', async () => {
    await load(fixtures.slice(0, 3));
    expect(await refreshSearchIndex()).toBe(3);
    expect(await refreshSearchIndex()).toBe(0);
    // A reading made by an older version is made again once per process.
    await db.execute(sql`update listing_search set v = 0 where listing_id = ${fixtures[0].id}`);
    resetSearchIndexState();
    expect(await refreshSearchIndex()).toBe(1);

    await db.delete(schema.listings).where(eq(schema.listings.id, fixtures[0].id));
    const left = await db.select({ id: schema.listingSearch.listingId }).from(schema.listingSearch);
    expect(left.map((r) => r.id).sort()).toEqual([fixtures[1].id, fixtures[2].id].sort());
  });

  it('reads a plural of a word listings use as that word, not a typo of another', () => {
    const list: SearchableListing[] = [
      { id: 'a', title: 'Heritage Tour', type: 'guide', description: 'x', location: 'Darjeeling', price: 0, tags: [], extras: {} },
      { id: 'b', title: 'Opening Hours Cafe', type: 'cafe', description: 'x', location: 'Darjeeling', price: 0, tags: [], extras: {} },
    ];
    const out = rank(list, 'tours');
    expect(out.results.map((r) => r.item.id)).toEqual(['a']);
    expect(out.interpretation.corrected).toBeNull();
  });
});
