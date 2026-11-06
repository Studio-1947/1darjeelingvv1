import { describe, it, expect } from 'vitest';
import { addDays, checkBookingRequest, isIsoDate, maxGuestsFor, todayInIndia } from '../src/lib/bookingRules';

// 6 Nov 2026, 20:00 UTC = 7 Nov 01:30 in India: "today" must be the Indian date.
const NOW = new Date('2026-11-06T20:00:00Z');
const TODAY = '2026-11-07';
const homestay = { type: 'homestay', extras: { capacity: 4 } };
const driver = { type: 'driver', extras: { seats: 5 } };
const check = (listing: any, body: any) => checkBookingRequest(listing, body, NOW);

describe('booking rules', () => {
  it('works out today in India time', () => {
    expect(todayInIndia(NOW)).toBe(TODAY);
  });

  it('only takes real YYYY-MM-DD dates', () => {
    expect(isIsoDate('2026-12-31')).toBe(true);
    for (const bad of ['2026-02-30', 'abc', '2026-1-5', '31-12-2026', 20261231, null]) expect(isIsoDate(bad)).toBe(false);
  });

  it('accepts a normal homestay request and cleans the values', () => {
    const r = check(homestay, { check_in: TODAY, check_out: addDays(TODAY, 2), guests: 3, notes: '  late arrival  ' });
    expect(r).toEqual({ ok: true, value: { checkIn: TODAY, checkOut: addDays(TODAY, 2), guests: 3, notes: 'late arrival' } });
  });

  it.each([
    [{}, 'dates_required'],
    [{ check_in: TODAY }, 'dates_required'],
    [{ check_in: 'abc', check_out: addDays(TODAY, 1) }, 'bad_date'],
    [{ check_in: '2020-01-01', check_out: '2020-01-03' }, 'date_in_past'],
    [{ check_in: addDays(TODAY, -1), check_out: addDays(TODAY, 1) }, 'date_in_past'],
    [{ check_in: addDays(TODAY, 366), check_out: addDays(TODAY, 367) }, 'too_far_ahead'],
    [{ check_in: addDays(TODAY, 3), check_out: addDays(TODAY, 3) }, 'dates_order'],
    [{ check_in: addDays(TODAY, 3), check_out: addDays(TODAY, 2) }, 'dates_order'],
    [{ check_in: TODAY, check_out: addDays(TODAY, 31) }, 'stay_too_long'],
  ])('refuses homestay dates %j (%s)', (body, code) => {
    const r = check(homestay, body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(code);
  });

  it.each([0, -5, 5, 9999, 2.5, 'two', '3x', true])('refuses %j guests for a 4-guest homestay', (guests) => {
    const r = check(homestay, { check_in: TODAY, check_out: addDays(TODAY, 1), guests });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('bad_guests');
  });

  it('takes a guest count sent as a numeric string', () => {
    const r = check(homestay, { check_in: TODAY, check_out: addDays(TODAY, 1), guests: '4' });
    expect(r.ok && r.value.guests).toBe(4);
  });

  it('limits guests by seats for a driver and by capacity otherwise, with defaults', () => {
    expect(maxGuestsFor(driver)).toBe(5);
    expect(maxGuestsFor({ type: 'driver', extras: {} })).toBe(6);
    expect(maxGuestsFor({ type: 'homestay', extras: { capacity: 12 } })).toBe(12);
    expect(maxGuestsFor({ type: 'guide', extras: null })).toBe(10);
    expect(check(driver, { check_in: TODAY, guests: 6 }).ok).toBe(false);
  });

  it('lets a driver or guide go without dates, or on one day, but not in the past', () => {
    expect(check(driver, {}).ok).toBe(true);
    expect(check(driver, { check_in: TODAY, check_out: TODAY }).ok).toBe(true);
    const past = check({ type: 'guide', extras: {} }, { check_in: '2025-01-01' });
    expect(!past.ok && past.code).toBe('date_in_past');
  });

  it('refuses notes that are not text or too long', () => {
    expect(check(driver, { notes: { a: 1 } }).ok).toBe(false);
    expect(check(driver, { notes: 'x'.repeat(1001) }).ok).toBe(false);
  });
});
