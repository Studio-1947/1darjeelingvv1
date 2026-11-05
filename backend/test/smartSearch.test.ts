import { describe, it, expect } from 'vitest';
import { SEED_LISTINGS } from '../src/seed_data';
import { editDistance, interpret, rank, type SearchableListing } from '../src/lib/search';

/**
 * How a traveller actually types, against the real sample directory plus two host listings.
 * The old search matched the whole query as one substring, so most of these found nothing.
 */
const listings: SearchableListing[] = [
  ...SEED_LISTINGS.map((l, i) => ({
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

  it('measures typos with transpositions', () => {
    expect(editDistance('veiw', 'view')).toBe(1);
    expect(editDistance('darjeling', 'darjeeling')).toBe(1);
    expect(editDistance('abc', 'xyz', 1)).toBe(2);
  });
});
