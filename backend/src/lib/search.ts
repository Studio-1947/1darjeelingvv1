/**
 * Smart search over listings.
 *
 * The old search matched the whole query as one substring, so "homestay near tiger hill" found
 * nothing (no listing contains that sentence), "taxi" never found a driver, tags and a host's
 * routes, rooms and menu were never searched, and one typo meant zero results. This reads a query
 * the way a traveller writes it:
 *
 *   - intent words pick the kind of place ("taxi", "cab" -> drivers; "stay", "room" -> homestays)
 *   - a budget is read out of it ("under 2000", "below ₹1500", "cheap")
 *   - every other word is matched on its own, in the title, place, tags, profile and description
 *   - local spellings are folded together (Ghum/Ghoom, NJP/New Jalpaiguri, Kanchenjunga...)
 *   - a near miss still matches ("darjeling", "kanchanjunga"), and the query is corrected
 *   - results come back best match first
 *
 * The directory is a few hundred rows for one district, so scoring happens in memory over the
 * visible listings. If it grows into the tens of thousands, move this into Postgres (pg_trgm).
 */

export type SearchType = 'spot' | 'homestay' | 'driver' | 'guide' | 'shop' | 'cafe' | 'event' | 'biodiversity';

export interface SearchableListing {
  id: string;
  title: string;
  type: string;
  description: string | null;
  location: string | null;
  price: number | null;
  tags: string[] | null;
  extras: Record<string, unknown> | null;
}

export interface Interpretation {
  /** The kind of place the words asked for, when the caller did not fix one. */
  type: SearchType | null;
  /** Budget in rupees ("under 2000", "below ₹1,500"). */
  max_price: number | null;
  /** "cheap", "budget": the matches are listed cheapest first instead of being cut off. */
  cheapest_first: boolean;
  /** The words that were matched against listings, after spelling fixes. */
  terms: string[];
  /** The query with typos fixed, when any word was corrected; null otherwise. */
  corrected: string | null;
}

/** Words that say what kind of place someone wants. Matched after normalising. */
const TYPE_WORDS: Record<string, SearchType> = {
  stay: 'homestay', stays: 'homestay', homestay: 'homestay', homestays: 'homestay', hotel: 'homestay',
  hotels: 'homestay', room: 'homestay', rooms: 'homestay', lodge: 'homestay', guesthouse: 'homestay',
  bnb: 'homestay', accommodation: 'homestay', sleep: 'homestay',
  taxi: 'driver', taxis: 'driver', cab: 'driver', cabs: 'driver', driver: 'driver', drivers: 'driver',
  car: 'driver', jeep: 'driver', sumo: 'driver', ride: 'driver', rides: 'driver', transfer: 'driver',
  pickup: 'driver', drop: 'driver',
  guide: 'guide', guides: 'guide', trek: 'guide', trekking: 'guide', hike: 'guide', hiking: 'guide',
  tour: 'guide', tours: 'guide',
  cafe: 'cafe', cafes: 'cafe', coffee: 'cafe', restaurant: 'cafe', restaurants: 'cafe', eat: 'cafe',
  food: 'cafe', momo: 'cafe', momos: 'cafe', bakery: 'cafe', breakfast: 'cafe', lunch: 'cafe', dinner: 'cafe',
  shop: 'shop', shops: 'shop', shopping: 'shop', buy: 'shop', souvenir: 'shop', souvenirs: 'shop',
  handicraft: 'shop', handicrafts: 'shop', crafts: 'shop',
  event: 'event', events: 'event', festival: 'event', festivals: 'event',
  viewpoint: 'spot', sightseeing: 'spot', attraction: 'spot', attractions: 'spot',
  wildlife: 'biodiversity', birds: 'biodiversity', birding: 'biodiversity', nature: 'biodiversity',
};

/** Words that carry no meaning for matching. */
const STOP = new Set([
  'a', 'an', 'the', 'in', 'at', 'near', 'nearby', 'around', 'to', 'for', 'with', 'and', 'or', 'of', 'on',
  'from', 'me', 'my', 'i', 'want', 'need', 'looking', 'find', 'show', 'best', 'good', 'nice', 'top',
  'some', 'any', 'place', 'places', 'please', 'darjeeling', 'is', 'are', 'that', 'this', 'one', 'by',
]);

/** Local spellings and short forms, folded to one word each before matching. */
const ALIASES: Record<string, string> = {
  ghoom: 'ghum', darjiling: 'darjeeling', darjling: 'darjeeling',
  kangchenjunga: 'kanchenjunga', khangchendzonga: 'kanchenjunga', kanchanjunga: 'kanchenjunga', kanchenjanga: 'kanchenjunga',
  njp: 'jalpaiguri', ixb: 'bagdogra', airport: 'bagdogra', chowrasta: 'chowrasta', chaurasta: 'chowrasta',
  chowk: 'chauk', bazaar: 'bazar', monastry: 'monastery', mirick: 'mirik', kurseong: 'kurseong', karsiyang: 'kurseong',
  batasia: 'batasia', tigerhill: 'tiger', sandakphu: 'sandakphu', tea: 'tea', momos: 'momo',
};

/** Words that ask for the cheaper end. */
const CHEAP = new Set(['cheap', 'budget', 'affordable', 'cheapest', 'low', 'lowcost', 'inexpensive']);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/₹/g, ' ')
    .replace(/(\d)[.,](\d)/g, '$1d$2') // keep "2.5k" and "2,000" as one number
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const fold = (w: string) => ALIASES[w] ?? w;

/** Plain words, folded, with a trailing plural "s" kept as is (handled in matching). */
export function words(text: string | null | undefined): string[] {
  if (!text) return [];
  return normalize(text).split(' ').filter(Boolean).map(fold);
}

/** Optimal-string-alignment distance, capped: returns cap + 1 as soon as it is exceeded. */
export function editDistance(a: string, b: string, cap = 2): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const prev2: number[] = new Array(b.length + 1).fill(0);
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

/** How far a word may be from a listing word and still count, by its length. */
const allowedTypos = (w: string) => (w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0);

/**
 * How well one query word matches a listing word: 1 exact (or plural), 0.8 prefix, 0.6 typo, 0 none.
 */
function wordMatch(q: string, w: string): number {
  if (q === w || q + 's' === w || q === w + 's') return 1;
  if (q.length >= 3 && w.startsWith(q)) return 0.8;
  const typos = allowedTypos(q);
  if (typos && Math.abs(q.length - w.length) <= typos && editDistance(q, w, typos) <= typos) return 0.6;
  return 0;
}

/** Strings worth searching in a listing's profile: routes, rooms, menu, services, amenities... */
function extrasText(extras: Record<string, unknown> | null | undefined): string {
  if (!extras) return '';
  const out: string[] = [];
  const skip = /phone|whatsapp|mobile|image|photo|video|avatar|upi|url|social|vehicle_number|license|location_verif/i;
  const walk = (v: unknown, depth: number) => {
    if (depth > 3 || v == null) return;
    if (typeof v === 'string') { if (!/^https?:\/\//i.test(v) && v.length < 200) out.push(v); return; }
    if (Array.isArray(v)) { v.slice(0, 50).forEach((x) => walk(x, depth + 1)); return; }
    if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (!skip.test(k)) walk(x, depth + 1);
    }
  };
  walk(extras, 0);
  return out.join(' ');
}

/** Field weights: a word in the name counts most, in the description least. */
const FIELDS = [
  { key: 'title', weight: 5 },
  { key: 'location', weight: 3 },
  { key: 'tags', weight: 3 },
  { key: 'extras', weight: 2 },
  { key: 'description', weight: 1 },
] as const;

type Indexed<T extends SearchableListing = SearchableListing> = { listing: T; fields: Record<(typeof FIELDS)[number]['key'], string[]> };

export function index<T extends SearchableListing>(listing: T): Indexed<T> {
  return {
    listing,
    fields: {
      title: words(listing.title),
      location: words(listing.location),
      tags: (listing.tags || []).flatMap((t) => words(t)),
      extras: words(extrasText(listing.extras)),
      description: words(listing.description),
    },
  };
}

/** "2000", "2d000" (2,000), "2d5k" (2.5k), "3k" -> rupees; NaN otherwise. */
function readAmount(token: string | undefined): number {
  const m = /^(\d+)(?:d(\d+))?(k)?$/.exec(token ?? '');
  if (!m) return NaN;
  const value = m[3] ? Number(`${m[1]}.${m[2] ?? 0}`) * 1000 : Number(`${m[1]}${m[2] ?? ''}`);
  return Math.round(value);
}

/** Reads the query: kind of place, budget, and the words to match. */
export function interpret(query: string, fixedType?: string | null): Omit<Interpretation, 'corrected'> {
  const raw = normalize(query).split(' ').filter(Boolean);
  let type: SearchType | null = null;
  let maxPrice: number | null = null;
  let cheapestFirst = false;
  const terms: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i];
    // "under 2000", "below 1500", "upto 3000", "max 2500", "less than 2000"
    if (['under', 'below', 'upto', 'max', 'within', 'less'].includes(w)) {
      const j = raw[i + 1] === 'than' ? i + 2 : i + 1;
      const n = readAmount(raw[j]);
      if (Number.isFinite(n) && n > 0) { maxPrice = n; i = j; continue; }
    }
    if (CHEAP.has(w)) { cheapestFirst = true; continue; }
    if (!fixedType && TYPE_WORDS[w] && !type) { type = TYPE_WORDS[w]; continue; }
    if (TYPE_WORDS[w]) continue; // "stays" in a homestay-only search adds nothing
    if (STOP.has(w) || /^\d/.test(w)) continue;
    terms.push(fold(w));
  }
  return { type, max_price: maxPrice, cheapest_first: cheapestFirst, terms };
}

export interface ScoredListing<T> { item: T; score: number }

/**
 * Ranks listings for a query. Every word must match somewhere for a full match; when nothing
 * matches every word, listings matching most of them are returned instead, so a long query still
 * finds something useful. Returns the interpretation too, for "Showing ..." and "Did you mean".
 */
export function rank<T extends SearchableListing>(
  listings: T[],
  query: string,
  opts: { type?: string | null; boost?: (item: T) => number } = {},
): { results: ScoredListing<T>[]; interpretation: Interpretation } {
  const base = interpret(query, opts.type ?? null);
  const wanted = opts.type || base.type;
  const pool = listings
    .filter((l) => !wanted || l.type === wanted)
    .filter((l) => base.max_price == null || (l.price != null && l.price > 0 && l.price <= base.max_price));
  const indexed = pool.map(index);

  // A word that matches nothing exactly but is close to a known word is corrected, for the
  // "Did you mean" line and so the correction is what gets matched.
  const vocab = new Set<string>();
  for (const ix of indexed) for (const f of FIELDS) for (const w of ix.fields[f.key]) vocab.add(w);
  const fixes = new Map<string, string>();
  const terms = base.terms.map((t) => {
    if (vocab.has(t) || vocab.has(t + 's') || [...vocab].some((w) => w.startsWith(t) && t.length >= 3)) return t;
    const typos = allowedTypos(t);
    if (!typos) return t;
    let best: string | null = null;
    let bestD = typos + 1;
    for (const w of vocab) {
      if (Math.abs(w.length - t.length) > typos) continue;
      const d = editDistance(t, w, typos);
      if (d < bestD) { best = w; bestD = d; }
    }
    if (best) { fixes.set(t, best); return best; }
    return t;
  });

  const scored: { item: T; score: number; matched: number }[] = [];
  for (const ix of indexed) {
    let score = 0;
    let matched = 0;
    for (const t of terms) {
      let best = 0;
      for (const f of FIELDS) {
        for (const w of ix.fields[f.key]) {
          const m = wordMatch(t, w);
          if (m) best = Math.max(best, m * f.weight);
        }
      }
      if (best) { matched++; score += best; }
    }
    // Two-word places ("tiger hill", "mall road") count extra when the words sit together.
    if (terms.length >= 2) {
      const phrase = terms.join(' ');
      const hay = `${ix.fields.title.join(' ')} ${ix.fields.location.join(' ')} ${ix.fields.extras.join(' ')}`;
      if (hay.includes(phrase)) score += 4;
    }
    if (terms.length === 0) score = 1; // only a type and/or budget was asked for
    score += opts.boost?.(ix.listing) ?? 0;
    scored.push({ item: ix.listing, score, matched });
  }

  const need = terms.length;
  // Nothing to match, no kind of place and no budget (a phone number, a lone "the"): no results.
  if (need === 0 && !wanted && base.max_price == null && !base.cheapest_first) {
    return { results: [], interpretation: { type: null, max_price: null, cheapest_first: false, terms, corrected: null } };
  }
  let hits = scored.filter((s) => s.matched === need && (need === 0 || s.score > 0));
  if (!hits.length && need > 1) {
    const most = Math.max(0, ...scored.map((s) => s.matched));
    if (most > 0) hits = scored.filter((s) => s.matched === most);
  }
  const price = (x: T) => (x.price && x.price > 0 ? x.price : Number.MAX_SAFE_INTEGER);
  hits.sort(base.cheapest_first
    ? (a, b) => price(a.item) - price(b.item) || b.score - a.score
    : (a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));

  return {
    results: hits.map(({ item, score }) => ({ item, score })),
    interpretation: {
      type: base.type,
      max_price: base.max_price,
      cheapest_first: base.cheapest_first,
      terms,
      // The guest's own words, with only the misspelled ones swapped.
      corrected: fixes.size
        ? normalize(query).split(' ').filter(Boolean).map((w) => fixes.get(fold(w)) ?? w).join(' ')
        : null,
    },
  };
}
