import { describe, it, expect } from 'vitest';
import { formatTripDates } from './dates';
import { tripBuckets } from '@/components/TripStats';

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
};

describe('trip card dates', () => {
  it('shows a stay inside one month as a short range with the year', () => {
    expect(formatTripDates('2026-08-20', '2026-08-22')).toBe('20 - 22 Aug 2026');
  });
  it('spans months', () => {
    expect(formatTripDates('2026-08-28', '2026-09-02')).toMatch(/^28 Aug - 2 Sept? 2026$/);
  });
  it('shows a single day (rides, guides) and ignores the time part of a timestamp', () => {
    expect(formatTripDates('2026-11-04T00:00:00.000Z')).toBe('4 Nov 2026');
    expect(formatTripDates('2026-11-04', '2026-11-04')).toBe('4 Nov 2026');
  });
  it('falls back to the raw value when it cannot read it', () => {
    expect(formatTripDates('soon')).toBe('soon');
    expect(formatTripDates(null)).toBe('');
  });
});

describe('My Trips cards', () => {
  it('counts a stay as completed only after check-out, like the server', () => {
    const ongoing = { id: 'a', status: 'confirmed', check_in: iso(-2), check_out: iso(2) };
    const done = { id: 'b', status: 'confirmed', check_in: iso(-5), check_out: iso(-3) };
    const undated = { id: 'c', status: 'confirmed', check_in: null, check_out: null };
    const request = { id: 'd', status: 'pending_payment', check_in: iso(-1), check_out: null };
    const accepted = { id: 'e', status: 'accepted', check_in: iso(3), check_out: null };
    const cancelled = { id: 'f', status: 'cancelled', check_in: iso(-1), check_out: null };
    const all = [ongoing, done, undated, request, accepted, cancelled];
    const b = tripBuckets(all);
    expect(b.completed.map((x) => x.id).sort()).toEqual(['b', 'c']);
    expect(b.upcoming.map((x) => x.id).sort()).toEqual(['a', 'd', 'e']);
    expect(b.cancelled.map((x) => x.id)).toEqual(['f']);
    // The three cards add up to the total.
    expect(b.completed.length + b.upcoming.length + b.cancelled.length).toBe(all.length);
  });
});
