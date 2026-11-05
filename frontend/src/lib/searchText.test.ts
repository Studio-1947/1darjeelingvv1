import { describe, it, expect } from 'vitest';
import { describeSearch } from './searchText';

const t = (key: string, opts?: any) => (key === 'search.under' ? `under ${opts.price}` : key);

describe('what the search understood', () => {
  it('names the kind of place, the budget and the order', () => {
    expect(describeSearch({ type: 'homestay', max_price: 2000, cheapest_first: true, terms: [], corrected: null }, undefined, t))
      .toEqual(['categories.homestay', 'under \u20b92,000', 'search.cheapest_first']);
  });
  it('does not repeat the kind of place the page is already on', () => {
    expect(describeSearch({ type: 'homestay', max_price: null, terms: ['ghum'], corrected: null }, 'homestay', t)).toEqual([]);
  });
});
