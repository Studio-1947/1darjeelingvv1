import { describe, it, expect } from 'vitest';
import { apiError, dayDate, fitDays, planCosts, planDate, rupees, stopsOf, type PlanListing } from './plans';

const listing = (price: number): PlanListing => ({ id: 'l', title: 'L', type: 'homestay', location: 'Lava', price, image: '' });

describe('trip plan helpers', () => {
  it('writes dates the way the cards do', () => {
    expect(planDate('2026-12-12')).toBe('12 Dec');
    expect(planDate(null)).toBe('');
    expect(dayDate('2026-12-12', 1)).toBe('Sun, 13 Dec');
    expect(dayDate(null, 1)).toBe('');
  });

  it('formats rupees and server errors', () => {
    expect(rupees(5100)).toBe('₹5,100');
    expect(rupees(-3)).toBe('₹0');
    expect(apiError({ response: { data: { detail: 'This trip is full' } } }, 'x')).toBe('This trip is full');
    expect(apiError(new Error('net'), 'fallback')).toBe('fallback');
  });

  it('keeps one day per night plus one, each starting where the last ended', () => {
    const days = fitDays([{ place: 'Kalimpong', text: '' }], 2);
    expect(days).toEqual([{ place: 'Kalimpong', text: '' }, { place: 'Kalimpong', text: '' }, { place: 'Kalimpong', text: '' }]);
    expect(fitDays(days, 1)).toHaveLength(2);
  });

  it('makes the route from the days, each place once and in order', () => {
    expect(stopsOf([{ place: 'Kalimpong', text: '' }, { place: 'Lava', text: '' }, { place: 'Lava', text: '' }, { place: '', text: '' }, { place: 'Rishyap', text: '' }]))
      .toEqual(['Kalimpong', 'Lava', 'Rishyap']);
  });

  it('estimates the cost per person from listed prices, and typed numbers win', () => {
    const base = { nights: 2, seats: 3, stay: listing(1800), driver: listing(1800), adj: {}, extra: [] };
    // Stay 1800 x 2 nights; car 1800 x 3 days shared by 3.
    expect(planCosts(base).total).toBe(3600 + 1800);
    expect(planCosts({ ...base, extra: [{ name: 'Bonfire', amt: '300' }] }).total).toBe(5700);
    expect(planCosts({ ...base, adj: { stay: '1000', guide: '500' } }).total).toBe(1000 + 1800 + 500);
    expect(planCosts({ ...base, adj: { stay: '' } }).val.stay).toBe(3600);
    expect(planCosts({ ...base, stay: null, driver: null }).total).toBe(0);
  });
});
