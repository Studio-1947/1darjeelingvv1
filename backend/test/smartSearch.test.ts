import { describe, it, expect } from 'vitest';
import { DEMO_BUSINESSES, SEED_LISTINGS } from '../src/seed_data';
import { editDistance, interpret, rank, type SearchableListing } from '../src/lib/search';

/**
 * How a traveller actually types, against the real sample directory plus two host listings.
 * The old search matched the whole query as one substring, so most of these found nothing.
 */
const listings: SearchableListing[] = [
  ...[...SEED_LISTINGS, ...DEMO_BUSINESSES].map((l, i) => ({
    id: `seed-${i}`, title: l.title, type: l.type, description: l.description, location: l.location,
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
const titles = (q: string, type?: string) => rank(listings, q, { type }).results.map((r) => r.item.title);

describe('a word for another kind on a fixed-type search', () => {
  it('is kept as a term (momo on homestays), while the same kind\'s word is dropped', () => {
    expect(interpret('momo', 'homestay').terms).toEqual(['momo']);
    expect(interpret('homestay in ghoom', 'homestay').terms).toEqual(['ghum']);
    // So a homestay search for momo is not every homestay.
    const stays = rank(listings, 'momo', { type: 'homestay' }).results;
    expect(stays.length).toBeLessThan(listings.filter((l) => l.type === 'homestay').length);
  });
});

describe('smart search', () => {
  it('reads intent words as the kind of place', () => {
    expect(interpret('taxi to tiger hill')).toMatchObject({ type: 'driver', terms: ['tiger', 'hill'] });
    expect(interpret('cheap stay in ghoom')).toMatchObject({ type: 'homestay', max_price: null, cheapest_first: true, terms: ['ghum'] });
    expect(interpret('homestay under 2000')).toMatchObject({ type: 'homestay', max_price: 2000 });
    expect(interpret('rooms below ₹2.5k').max_price).toBe(2500);
    expect(interpret('stay under ₹2,000').max_price).toBe(2000);
    expect(interpret('stay less than 2500').max_price).toBe(2500);
  });

  it('finds a driver by the route in their profile, not only by their name', () => {
    expect(titles('taxi to tiger hill')).toEqual(['Pemba Rides']);
  });

  it('finds every driver for a plain "cab"', () => {
    const drivers = titles('cab');
    expect(drivers).toContain('Tenzing - Local Taxi Driver');
    expect(drivers).toContain('Pemba Rides');
    expect(drivers.length).toBe(4);
  });

  it('matches words separately, so a sentence still finds the place', () => {
    expect(titles('homestay near happy valley')).toEqual(['Teahouse by the Garden']);
  });

  it('folds local spellings: Ghoom is Ghum', () => {
    const ghum = titles('stay in ghum');
    expect(ghum).toContain('Prayer Flag Cottage');
    expect(ghum).toContain('Cloud Nine Homestay');
  });

  it('forgives typos and says what it corrected', () => {
    const r = rank(listings, 'kanchenjunga veiw retreet');
    expect(r.results[0].item.title).toBe('Kanchenjunga View Retreat');
    expect(r.interpretation.corrected).toBe('kanchenjunga view retreat');
    expect(titles('monastry')).toContain('Ghum Monastery (Yiga Choeling)');
    expect(rank(listings, 'kanchanjunga veiw retreet').interpretation.corrected).toBe('kanchenjunga view retreat');
    // A local spelling is not a mistake, so no "Did you mean" for it.
    expect(rank(listings, 'stay in ghoom').interpretation.corrected).toBeNull();
  });

  it('reads a budget and keeps only listings within it', () => {
    const cheap = rank(listings, 'homestay under 2000').results.map((r) => r.item.price);
    expect(cheap.length).toBeGreaterThan(0);
    expect(cheap.every((p) => (p as number) <= 2000)).toBe(true);
  });

  it('"cheap" lists the matches cheapest first instead of hiding any', () => {
    const prices = rank(listings, 'cheap homestay').results.map((r) => r.item.price as number);
    expect(prices.length).toBe(5);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it('searches rooms and menus a host listed', () => {
    expect(titles('thukpa')).toEqual(['Cloud Nine Homestay']);
  });

  it('never searches phone numbers', () => {
    expect(titles('9800000000')).toEqual([]);
  });

  it('puts a name match above a description match', () => {
    expect(titles('red panda')[0]).toBe('Red Panda');
  });

  it('on a category page, a bare category word lists that category', () => {
    expect(titles('rooms', 'homestay').length).toBe(5);
  });

  it('respects a type the page already fixed', () => {
    expect(titles('tea', 'shop')).toEqual(['Nathmulls Tea House']);
  });

  it('falls back to the closest matches when no listing has every word', () => {
    const r = rank(listings, 'mirik lake sunset boating');
    expect(r.results[0].item.title).toBe('Mirik Lake (Sumendu Lake)');
  });

  it('"Darjeeling" on its own finds the listings in and around Darjeeling', () => {
    for (const q of ['Darjeeling', 'darjeeling', 'DARJEELING', 'darjiling']) {
      const found = titles(q);
      expect(found).toContain('Tiger Hill Sunrise');
      expect(found).toContain('Pemba Rides');
      // Only the ones that name it: the Ghoom stay does not.
      expect(found).not.toContain('Cloud Nine Homestay');
    }
    expect(interpret('Darjeeling').terms).toEqual(['darjeeling']);
  });

  it('"Darjeeling" next to a kind or another word does not narrow it', () => {
    const stays = titles('homestay in darjeeling');
    expect(stays.length).toBe(5);
    // A stay that names Darjeeling comes before the one that does not.
    expect(stays[stays.length - 1]).toBe('Cloud Nine Homestay');
    const cafes = listings.filter((l) => l.type === 'cafe').length;
    expect(titles('cafe darjeeling').length).toBe(cafes);
    expect(titles('darjeeling cafe').length).toBe(cafes);
    expect(titles('darjeeling tea', 'shop')).toEqual(['Nathmulls Tea House']);
    expect(titles('stay in darjeeling under 2000')).toEqual(['Mist & Pine Homestay']);
    expect(rank(listings, 'homestay in darjeeling').interpretation.fallback).toBe(false);
  });

  it('measures typos with transpositions', () => {
    expect(editDistance('veiw', 'view')).toBe(1);
    expect(editDistance('darjeling', 'darjeeling')).toBe(1);
    expect(editDistance('abc', 'xyz', 1)).toBe(2);
  });
});

describe('Hindi, Nepali and Bengali queries', () => {
  it('reads places in Devanagari and Bengali script, with their spelling variants', () => {
    for (const q of ['दार्जिलिंग', 'दार्जीलिंग', 'दार्जिलिङ', 'দার্জিলিং']) {
      expect(interpret(q).terms).toEqual(['darjeeling']);
    }
    for (const q of ['कर्सियांग', 'खरसाङ', 'কার্শিয়াং']) expect(interpret(q).terms).toEqual(['kurseong']);
    expect(interpret('घूम').terms).toEqual(['ghum']);
    expect(interpret('टाइगर हिल').terms).toEqual(['tiger', 'hill']);
    expect(titles('মিরিক')).toContain('Mirik Lake (Sumendu Lake)');
    expect(titles('मिरिक झील')[0]).toBe('Mirik Lake (Sumendu Lake)');
  });

  it('reads kinds of place, budget words and a Bengali case ending', () => {
    expect(interpret('दार्जिलिंग में होमस्टे')).toMatchObject({ type: 'homestay', terms: ['darjeeling'] });
    expect(interpret('দার্জিলিংয়ে হোমস্টে')).toMatchObject({ type: 'homestay', terms: ['darjeeling'] });
    expect(interpret('घूम में सस्ता होमस्टे')).toMatchObject({ type: 'homestay', cheapest_first: true, terms: ['ghum'] });
    for (const q of ['टैक्सी', 'गाड़ी', 'गाडी', 'ট্যাক্সি', 'ड्राइवर']) expect(interpret(q).type).toBe('driver');
    for (const q of ['कैफे', 'ক্যাফে', 'रेस्टोरेंट', 'मोमो']) expect(interpret(q).type).toBe('cafe');
    for (const q of ['दुकान', 'पसल', 'দোকান']) expect(interpret(q).type).toBe('shop');
    expect(interpret('गाइड').type).toBe('guide');
    expect(interpret('गुम्बा').terms).toEqual(['monastery']);
    expect(titles('घूम गुम्बा')).toContain('Ghum Monastery (Yiga Choeling)');
    expect(titles('चाय की दुकान')).toContain('Nathmulls Tea House');
    expect(titles('घूम में होमस्टे')).toEqual(expect.arrayContaining(['Prayer Flag Cottage', 'Cloud Nine Homestay']));
  });

  it('ignores native words it does not know, as before', () => {
    expect(interpret('नमस्ते').terms).toEqual([]);
    expect(titles('नमस्ते')).toEqual([]);
    expect(interpret('नमस्ते मिरिक').terms).toEqual(['mirik']);
  });
});

describe('no dead ends when the kind of place was understood', () => {
  const noRoute = listings.filter((l) => l.id !== 'host-driver');
  const noGhumStay = listings.filter((l) => !['Prayer Flag Cottage', 'Cloud Nine Homestay'].includes(l.title));

  it('lists the drivers when no driver names the place', () => {
    const r = rank(noRoute, 'taxi to tiger hill');
    expect(r.results.map((x) => x.item.type)).toEqual(['driver', 'driver', 'driver']);
    expect(r.interpretation).toMatchObject({ type: 'driver', terms: ['tiger', 'hill'], fallback: true });
    expect(r.results.every((x) => x.score === 1)).toBe(true);
  });

  it('keeps cheapest first and the budget in the fallback', () => {
    const r = rank(noGhumStay, 'cheap stay in ghoom');
    const prices = r.results.map((x) => x.item.price as number);
    expect(r.interpretation.fallback).toBe(true);
    expect(r.results.every((x) => x.item.type === 'homestay')).toBe(true);
    expect(prices.length).toBe(3);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    expect(rank(noGhumStay, 'stay in ghoom under 2000').results.map((x) => x.item.title)).toEqual(['Mist & Pine Homestay']);
  });

  it('falls back only when the query itself named the kind, even on a page with a fixed type', () => {
    // A nonsense search on the homestays page finds nothing, as before.
    const none = rank(listings, 'zzzz-nothing', { type: 'homestay' });
    expect(none.results).toEqual([]);
    expect(none.interpretation.fallback).toBe(false);
    expect(rank(listings, 'thukpa', { type: 'cafe' }).results).toEqual([]);
    // The kind named in the words, on its own page or not, still falls back.
    const cafe = rank(listings, 'cafe thukpa', { type: 'cafe' });
    expect(cafe.interpretation.fallback).toBe(true);
    expect(cafe.results.length).toBe(listings.filter((l) => l.type === 'cafe').length);
    const ride = rank(noRoute, 'taxi to tiger hill', { type: 'driver' });
    expect(ride.interpretation.fallback).toBe(true);
    expect(ride.results.length).toBe(3);
  });

  it('does not change results when something matches, or when no kind was understood', () => {
    const r = rank(listings, 'taxi to tiger hill');
    expect(r.results.map((x) => x.item.title)).toEqual(['Pemba Rides']);
    expect(r.interpretation.fallback).toBe(false);
    expect(rank(listings, 'zzqxw').results).toEqual([]);
    expect(rank(listings, 'zzqxw').interpretation.fallback).toBe(false);
  });
});

describe('a typo of a kind word', () => {
  it('still picks the kind', () => {
    expect(interpret('homstay')).toMatchObject({ type: 'homestay', terms: [] });
    expect(interpret('homstay in ghoom')).toMatchObject({ type: 'homestay', terms: ['ghum'] });
    expect(interpret('resturant').type).toBe('cafe');
    expect(interpret('drivr').type).toBe('driver');
    const r = rank(listings, 'homstay');
    expect(r.results.length).toBe(5);
    expect(r.interpretation.corrected).toBe('homestay');
  });

  it('on a page of that kind, adds nothing; on another kind, is matched as that word', () => {
    expect(interpret('homstay', 'homestay').terms).toEqual([]);
    expect(titles('homstay', 'homestay').length).toBe(5);
    expect(interpret('homstay', 'cafe').terms).toEqual(['homestay']);
  });

  it('leaves real words alone', () => {
    expect(interpret('natural lake').type).toBeNull();
    expect(rank(listings, 'natural lake').interpretation.type).toBeNull();
    expect(interpret('sunrise ridgee').type).toBeNull();
  });
});
