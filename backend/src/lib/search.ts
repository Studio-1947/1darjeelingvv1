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
 *   - a near miss still matches ("darjeling", "kanchanjunga"), and the query is corrected; a typo
 *     of a kind word ("homstay") still picks the kind
 *   - common Hindi, Nepali and Bengali words are read too ("दार्जिलिंग में होमस्टे")
 *   - when a kind of place was understood but no listing matches the words, that kind is listed
 *     instead of nothing ("taxi to tiger hill" lists the drivers), flagged as a fallback
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
  /**
   * True when no listing matched the words, so every listing of the kind asked for is shown
   * instead ("taxi to tiger hill" with no driver naming Tiger Hill lists the drivers).
   */
  fallback: boolean;
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
  'some', 'any', 'place', 'places', 'please', 'is', 'are', 'that', 'this', 'one', 'by',
]);

/**
 * The district itself. Searched on its own ("Darjeeling") it finds the listings that name it; next
 * to anything else ("homestay in darjeeling", "cafe darjeeling") it only lifts the listings that
 * name it, since a stay in Ghum is still a stay in Darjeeling.
 */
const REGION = new Set(['darjeeling']);

/** Local spellings and short forms, folded to one word each before matching. */
const ALIASES: Record<string, string> = {
  ghoom: 'ghum', darjiling: 'darjeeling', darjling: 'darjeeling',
  kangchenjunga: 'kanchenjunga', khangchendzonga: 'kanchenjunga', kanchanjunga: 'kanchenjunga', kanchenjanga: 'kanchenjunga',
  njp: 'jalpaiguri', ixb: 'bagdogra', airport: 'bagdogra', chowrasta: 'chowrasta', chaurasta: 'chowrasta',
  chowk: 'chauk', bazaar: 'bazar', monastry: 'monastery', mirick: 'mirik', kurseong: 'kurseong', karsiyang: 'kurseong',
  batasia: 'batasia', tigerhill: 'tiger', sandakphu: 'sandakphu', tea: 'tea', momos: 'momo',
};

/** Aliases that are misspellings rather than local spellings: these are shown as "Did you mean". */
const MISSPELLINGS = new Set(['darjiling', 'darjling', 'kanchanjunga', 'kanchenjanga', 'monastry', 'mirick']);

/** Words that ask for the cheaper end. */
const CHEAP = new Set(['cheap', 'budget', 'affordable', 'cheapest', 'low', 'lowcost', 'inexpensive']);

/**
 * Hindi, Nepali (Devanagari) and Bengali words a traveller (or voice search in those languages)
 * uses, turned into the Latin words the directory is written in. Applied before normalising,
 * which keeps only a-z and 0-9, so any native word not listed here is simply dropped.
 */
const NATIVE: Record<string, string> = {
  // Places
  'दार्जिलिंग': 'darjeeling', 'दार्जीलिंग': 'darjeeling', 'दार्जिलिङ': 'darjeeling', 'दार्जीलिङ': 'darjeeling',
  'दार्जलिंग': 'darjeeling', 'দার্জিলিং': 'darjeeling', 'দার্জিলিঙ': 'darjeeling',
  'মিরিক': 'mirik', 'मिरिक': 'mirik',
  'कर्सियांग': 'kurseong', 'कर्सियाँग': 'kurseong', 'कार्सियांग': 'kurseong', 'खरसाङ': 'kurseong', 'खर्साङ': 'kurseong',
  'खरसांग': 'kurseong', 'কার্শিয়াং': 'kurseong', 'কার্সিয়াং': 'kurseong', 'খরসাং': 'kurseong',
  'कलिम्पोंग': 'kalimpong', 'कालिम्पोंग': 'kalimpong', 'कालिम्पोङ': 'kalimpong', 'कालेबुङ': 'kalimpong',
  'কালিম্পং': 'kalimpong', 'কালিংপং': 'kalimpong',
  'घूम': 'ghum', 'घुम': 'ghum', 'ঘুম': 'ghum',
  'सित्तोंग': 'sittong', 'सिटोंग': 'sittong', 'सित्तोङ': 'sittong', 'সিটং': 'sittong', 'সিত্তং': 'sittong',
  'सिलीगुड़ी': 'siliguri', 'सिलिगुड़ी': 'siliguri', 'सिलीगुडी': 'siliguri', 'सिलगढी': 'siliguri', 'শিলিগুড়ি': 'siliguri',
  'লাভা': 'lava', 'लावा': 'lava', 'लाभा': 'lava',
  'टाइगर': 'tiger', 'টাইগার': 'tiger', 'हिल': 'hill', 'হিল': 'hill',
  'बतासिया': 'batasia', 'बताशिया': 'batasia', 'বাতাসিয়া': 'batasia',
  'लामाहाट्टा': 'lamahatta', 'लामाहट्टा': 'lamahatta', 'লামাহাট্টা': 'lamahatta',
  'सुखिया': 'sukhia', 'सुखियापोखरी': 'sukhia pokhri', 'पोखरी': 'pokhri', 'সুখিয়া': 'sukhia', 'সুখিয়াপোখরি': 'sukhia pokhri',
  'পোখরি': 'pokhri',
  'पेलिंग': 'pelling', 'पेलिङ': 'pelling', 'পেলিং': 'pelling',
  'गंगटोक': 'gangtok', 'गान्तोक': 'gangtok', 'গ্যাংটক': 'gangtok',
  'सिक्किम': 'sikkim', 'সিকিম': 'sikkim',
  'लेप्चाजगत': 'lepchajagat', 'লেপচাজগৎ': 'lepchajagat',
  'तकदह': 'takdah', 'तक्दह': 'takdah', 'তাকদাহ': 'takdah',
  'बागडोगरा': 'bagdogra', 'বাগডোগরা': 'bagdogra',
  'एनजेपी': 'njp', 'এনজেপি': 'njp', 'जलपाईगुड़ी': 'jalpaiguri', 'জলপাইগুড়ি': 'jalpaiguri',
  // Kinds of place
  'होमस्टे': 'homestay', 'হোমস্টে': 'homestay',
  'होटल': 'hotel', 'হোটেল': 'hotel',
  'कमरा': 'room', 'कोठा': 'room', 'রুম': 'room', 'ঘর': 'room',
  'टैक्सी': 'taxi', 'ट्याक्सी': 'taxi', 'गाड़ी': 'taxi', 'गाडी': 'taxi', 'ট্যাক্সি': 'taxi', 'গাড়ি': 'taxi',
  'ड्राइवर': 'driver', 'ड्राइभर': 'driver', 'ড্রাইভার': 'driver',
  'गाइड': 'guide', 'গাইড': 'guide',
  'कैफे': 'cafe', 'कैफ़े': 'cafe', 'क्याफे': 'cafe', 'ক্যাফে': 'cafe',
  'रेस्टोरेंट': 'restaurant', 'रेस्टुरेन्ट': 'restaurant', 'रेस्तरां': 'restaurant', 'রেস্টুরেন্ট': 'restaurant',
  'রেস্তোরাঁ': 'restaurant',
  'दुकान': 'shop', 'पसल': 'shop', 'দোকান': 'shop',
  'मोमो': 'momo', 'মোমো': 'momo',
  'चाय': 'tea', 'चिया': 'tea', 'চা': 'tea',
  'गुम्बा': 'monastery', 'गोम्पा': 'monastery', 'मठ': 'monastery', 'মঠ': 'monastery', 'গুম্ফা': 'monastery',
  'झील': 'lake', 'ताल': 'lake', 'লেক': 'lake', 'হ্রদ': 'lake',
  'सस्ता': 'cheap', 'सस्ती': 'cheap', 'सस्तो': 'cheap', 'সস্তা': 'cheap',
};
const NATIVE_WORDS = new Map(Object.entries(NATIVE).map(([k, v]) => [k.normalize('NFC'), v]));
/** Longer native words also match with a case ending attached ("দার্জিলিংয়ে", in Darjeeling). */
const NATIVE_STEMS = [...NATIVE_WORDS.keys()].filter((k) => k.length >= 4).sort((a, b) => b.length - a.length);
const NATIVE_SCRIPT = /[ऀ-৿]/;

/** Swaps known Devanagari and Bengali words for their Latin search words; leaves the rest as is. */
export function fromNativeScript(text: string): string {
  if (!NATIVE_SCRIPT.test(text)) return text;
  return text
    .normalize('NFC')
    .replace(/[​-‍]/g, '')
    .replace(/[\p{L}\p{M}\p{N}]+/gu, (token) => {
      if (!NATIVE_SCRIPT.test(token)) return token;
      const latin = NATIVE_WORDS.get(token) ?? NATIVE_WORDS.get(NATIVE_STEMS.find((s) => token.startsWith(s)) ?? '');
      return latin ? ` ${latin} ` : token;
    });
}

export function normalize(text: string): string {
  return fromNativeScript(text)
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

/** A listing's words per field, as matching reads them. Stored by lib/searchIndex.ts. */
export type SearchFields = Record<(typeof FIELDS)[number]['key'], string[]>;
export type Indexed<T extends SearchableListing = SearchableListing> = { listing: T; fields: SearchFields };

/**
 * The version of how a listing is read into words. Bump it when normalize, the aliases, the
 * Hindi/Nepali/Bengali words or extrasText change: every stored reading is then made again.
 */
export const SEARCH_INDEX_VERSION = 1;

export function indexFields(listing: SearchableListing): SearchFields {
  return {
    title: words(listing.title),
    location: words(listing.location),
    tags: (listing.tags || []).flatMap((t) => words(t)),
    extras: words(extrasText(listing.extras)),
    description: words(listing.description),
  };
}

export function index<T extends SearchableListing>(listing: T): Indexed<T> {
  return { listing, fields: indexFields(listing) };
}

/** Every distinct word a listing holds, across its fields: what the GIN index looks up. */
export function allWords(fields: SearchFields): string[] {
  const out = new Set<string>();
  for (const f of FIELDS) for (const w of fields[f.key] || []) out.add(w);
  return [...out];
}

/** "2000", "2d000" (2,000), "2d5k" (2.5k), "3k" -> rupees; NaN otherwise. */
function readAmount(token: string | undefined): number {
  const m = /^(\d+)(?:d(\d+))?(k)?$/.exec(token ?? '');
  if (!m) return NaN;
  const value = m[3] ? Number(`${m[1]}.${m[2] ?? 0}`) * 1000 : Number(`${m[1]}${m[2] ?? ''}`);
  return Math.round(value);
}

/**
 * A typo of a kind word ("homstay", "resturant"): one letter off a TYPE_WORDS key, at least five
 * letters long, and not a word some listing actually uses ("natural" is not "nature").
 */
function kindTypo(w: string, known?: (w: string) => boolean): string | null {
  if (w.length < 5 || TYPE_WORDS[w] || STOP.has(w) || CHEAP.has(w) || ALIASES[w] || NOT_TYPOS.has(w) || /\d/.test(w)) return null;
  const key = Object.keys(TYPE_WORDS)
    .find((k) => k.length >= 5 && Math.abs(k.length - w.length) <= 1 && editDistance(w, k, 1) <= 1);
  return key && !known?.(w) ? key : null;
}

/** Real words one letter off a kind word, which mean something else. */
const NOT_TYPOS = new Set(['hours', 'bikes', 'pride', 'bride', 'steep', 'sheep', 'natural', 'shows', 'cards', 'mature']);

/** What `interpret` reads, plus the typo fixes and every kind the words themselves named. */
type Reading = Omit<Interpretation, 'corrected' | 'fallback'> & { fixes: Map<string, string>; kinds: Set<SearchType> };

function read(query: string, fixedType: string | null, known?: (w: string) => boolean): Reading {
  const raw = normalize(query).split(' ').filter(Boolean);
  let type: SearchType | null = null;
  let maxPrice: number | null = null;
  let cheapestFirst = false;
  const terms: string[] = [];
  const fixes = new Map<string, string>();
  const kinds = new Set<SearchType>();
  for (let i = 0; i < raw.length; i++) {
    let w = raw[i];
    // "under 2000", "below 1500", "upto 3000", "max 2500", "less than 2000"
    if (['under', 'below', 'upto', 'max', 'within', 'less'].includes(w)) {
      const j = raw[i + 1] === 'than' ? i + 2 : i + 1;
      const n = readAmount(raw[j]);
      if (Number.isFinite(n) && n > 0) { maxPrice = n; i = j; continue; }
    }
    if (CHEAP.has(w)) { cheapestFirst = true; continue; }
    const typo = kindTypo(w, known);
    if (typo) { fixes.set(w, typo); w = typo; }
    if (TYPE_WORDS[w]) kinds.add(TYPE_WORDS[w]);
    if (!fixedType && TYPE_WORDS[w] && !type) { type = TYPE_WORDS[w]; continue; }
    // "stays" in a homestay-only search adds nothing; a word for another kind ("momo" while
    // looking at homestays) is something to match, not something to drop.
    if (TYPE_WORDS[w]) { if (fixedType && TYPE_WORDS[w] !== fixedType) terms.push(fold(w)); continue; }
    if (STOP.has(w) || /^\d/.test(w)) continue;
    terms.push(fold(w));
  }
  return { type, max_price: maxPrice, cheapest_first: cheapestFirst, terms, fixes, kinds };
}

/** Reads the query: kind of place, budget, and the words to match. */
export function interpret(query: string, fixedType?: string | null): Omit<Interpretation, 'corrected' | 'fallback'> {
  const { fixes: _fixes, kinds: _kinds, ...reading } = read(query, fixedType ?? null);
  return reading;
}

export interface ScoredListing<T> { item: T; score: number }

/** Step 1 of a search: the kind of place, budget and words, read against the words listings use. */
export function readSearch(query: string, fixedType: string | null | undefined, known: (w: string) => boolean) {
  const base = read(query, fixedType ?? null, known);
  return { base, wanted: (fixedType || base.type) as string | null };
}
export type SearchReading = ReturnType<typeof readSearch>;

/**
 * Step 2: the words to match, corrected against the words of the listings in play (the pool: the
 * kind and budget asked for), and which listing words each one matches. Those are all a listing
 * can be found by, so the database fetches only the listings holding one (lib/searchIndex.ts) -
 * unless the search matches on kind or budget alone, or falls back to every listing of the kind.
 */
export function planSearch(reading: SearchReading, poolVocab: Iterable<string>) {
  const { base, wanted } = reading;
  // Alphabetical, so a correction with two equally close words picks the same one every time.
  const vocabList = [...new Set(poolVocab)].sort();
  const vocab = new Set(vocabList);

  // A word that matches nothing exactly but is close to a known word is corrected, for the
  // "Did you mean" line and so the correction is what gets matched.
  const fixes = new Map<string, string>(base.fixes);
  const terms = base.terms.map((t) => {
    if (REGION.has(t)) return t;
    // A plural of a known word ("tours" where listings say "tour") is known too, not a typo of another word.
    if (vocab.has(t) || vocab.has(t + 's') || (t.endsWith('s') && vocab.has(t.slice(0, -1)))
      || (t.length >= 3 && vocabList.some((w) => w.startsWith(t)))) return t;
    const typos = allowedTypos(t);
    if (!typos) return t;
    let best: string | null = null;
    let bestD = typos + 1;
    for (const w of vocabList) {
      if (Math.abs(w.length - t.length) > typos) continue;
      const d = editDistance(t, w, typos);
      if (d < bestD) { best = w; bestD = d; }
    }
    if (best) { fixes.set(t, best); return best; }
    return t;
  });

  // "Darjeeling" next to anything else only lifts the listings naming it; on its own it must match.
  const specific = terms.filter((t) => !REGION.has(t));
  const required = new Set(
    specific.length || wanted || base.max_price != null || base.cheapest_first ? specific : terms,
  );
  const need = terms.filter((t) => required.has(t)).length;

  // Every listing word some term matches: a listing holding none of them scores nothing.
  const matchWords = new Set<string>();
  for (const t of terms) for (const w of vocabList) if (wordMatch(t, w)) matchWords.add(w);

  return {
    reading, terms, fixes, required, need, matchWords,
    /** Kind and/or budget only: every listing in the pool is a result. */
    wholePool: required.size === 0,
    /** Nothing to match, no kind of place and no budget (a phone number, a lone "the"). */
    empty: need === 0 && !wanted && base.max_price == null && !base.cheapest_first,
    /** Whether a search with no hits lists the whole kind instead (see scoreSearch). */
    mayFallBack: need > 0 && !!wanted && base.kinds.has(wanted as SearchType) && !terms.some((t) => TYPE_WORDS[t]),
  };
}
export type SearchPlan = ReturnType<typeof planSearch>;

/** The interpretation of a search with no results at all (planSearch's `empty`). */
export function emptyInterpretation(plan: SearchPlan): Interpretation {
  return { type: null, max_price: null, cheapest_first: false, terms: plan.terms, corrected: null, fallback: false };
}

/**
 * Ranks listings for a query. Every word must match somewhere for a full match; when nothing
 * matches every word, listings matching most of them are returned instead, so a long query still
 * finds something useful. Returns the interpretation too, for "Showing ..." and "Did you mean".
 *
 * In memory, over the listings given. The listings route searches through the database index
 * instead (lib/searchIndex.ts), with the same three steps and so the same results.
 */
export function rank<T extends SearchableListing>(
  listings: T[],
  query: string,
  opts: { type?: string | null; boost?: (item: T) => number } = {},
): { results: ScoredListing<T>[]; interpretation: Interpretation } {
  const indexes = new Map<T, Indexed<T>>();
  const indexOf = (l: T) => {
    let ix = indexes.get(l);
    if (!ix) { ix = index(l); indexes.set(l, ix); }
    return ix;
  };
  // A word some listing uses is never read as a typo of a kind word ("natural" is not "nature").
  let everyWord: Set<string> | null = null;
  const known = (w: string) => {
    if (!everyWord) {
      everyWord = new Set();
      for (const l of listings) for (const f of FIELDS) for (const x of indexOf(l).fields[f.key]) everyWord.add(x);
    }
    return everyWord.has(w) || everyWord.has(w + 's');
  };
  const reading = readSearch(query, opts.type, known);
  const pool = listings.filter(inPool(reading)).map(indexOf);
  const vocab: string[] = [];
  for (const ix of pool) for (const f of FIELDS) vocab.push(...ix.fields[f.key]);
  const plan = planSearch(reading, vocab);
  if (plan.empty) return { results: [], interpretation: emptyInterpretation(plan) };
  return scoreSearch(plan, query, pool, opts.boost);
}

/** Whether a listing is of the kind and within the budget the search asked for. */
export function inPool(reading: SearchReading) {
  const { base, wanted } = reading;
  return (l: SearchableListing) => (!wanted || l.type === wanted)
    && (base.max_price == null || (l.price != null && l.price > 0 && l.price <= base.max_price));
}

/**
 * Step 3: scores and orders the listings given. Exact when they are the whole pool, and when they
 * are every pool listing holding one of `plan.matchWords` - unless the result is empty and
 * `plan.mayFallBack`, when the whole pool is needed to list the kind instead.
 */
export function scoreSearch<T extends SearchableListing>(
  plan: SearchPlan,
  query: string,
  indexed: Indexed<T>[],
  boost?: (item: T) => number,
): { results: ScoredListing<T>[]; interpretation: Interpretation } {
  const { reading: { base, wanted }, terms, fixes, required, need } = plan;
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
      if (best) { score += best; if (required.has(t)) matched++; }
    }
    // Two-word places ("tiger hill", "mall road") count extra when the words sit together.
    if (terms.length >= 2) {
      const phrase = terms.join(' ');
      const hay = `${ix.fields.title.join(' ')} ${ix.fields.location.join(' ')} ${ix.fields.extras.join(' ')}`;
      if (hay.includes(phrase)) score += 4;
    }
    if (!required.size) score += 1; // only a type and/or budget was asked for (plus "Darjeeling")
    scored.push({ item: ix.listing, score, matched });
  }
  const boosted = (s: { item: T; score: number; matched: number }) =>
    ({ ...s, score: s.score + (boost?.(s.item) ?? 0) });

  // Nothing to match, no kind of place and no budget (a phone number, a lone "the"): no results.
  if (plan.empty) return { results: [], interpretation: emptyInterpretation(plan) };
  let hits = scored.filter((s) => s.matched === need && (need === 0 || s.score > 0));
  if (!hits.length && need > 1) {
    const most = Math.max(0, ...scored.map((s) => s.matched));
    if (most > 0) hits = scored.filter((s) => s.matched === most);
  }
  // Nothing matched the words, but a kind of place was understood ("taxi to tiger hill" where no
  // driver names Tiger Hill): list that kind, within the budget, rather than a dead end. Only when
  // the query itself named the kind: a nonsense search on the homestays page (type fixed by the
  // page, no kind word) still finds nothing, and so does a word for another kind ("momo" there).
  let fallback = false;
  if (!hits.length && plan.mayFallBack) {
    hits = scored.map((s) => ({ ...s, score: 1 }));
    fallback = hits.length > 0;
  }
  hits = hits.map(boosted);
  const price = (x: T) => (x.price && x.price > 0 ? x.price : Number.MAX_SAFE_INTEGER);
  hits.sort(base.cheapest_first
    ? (a, b) => price(a.item) - price(b.item) || b.score - a.score || a.item.id.localeCompare(b.item.id)
    : (a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title) || a.item.id.localeCompare(b.item.id));

  return {
    results: hits.map(({ item, score }) => ({ item, score })),
    interpretation: {
      type: base.type,
      max_price: base.max_price,
      cheapest_first: base.cheapest_first,
      terms,
      // The guest's own words, with only the misspelled ones swapped.
      corrected: (() => {
        const raw = normalize(query).split(' ').filter(Boolean);
        if (!fixes.size && !raw.some((w) => MISSPELLINGS.has(w))) return null;
        return raw.map((w) => fixes.get(fold(w)) ?? (MISSPELLINGS.has(w) ? fold(w) : w)).join(' ');
      })(),
      fallback,
    },
  };
}
