import { describe, it, expect } from 'vitest';
import { bookingGrossAmount } from '../src/lib/bookingAmount';

describe('bookingGrossAmount', () => {
  it('prices a homestay per person per night', () => {
    expect(
      bookingGrossAmount({ listingType: 'homestay', price: 1800, guests: 2, checkIn: '2026-11-04', checkOut: '2026-11-06' })
    ).toBe(7200);
    expect(
      bookingGrossAmount({ listingType: 'homestay', price: 1500, guests: 4, checkIn: '2026-12-01', checkOut: '2026-12-04' })
    ).toBe(18000);
  });

  it('counts a homestay with no usable dates as one night', () => {
    expect(bookingGrossAmount({ listingType: 'homestay', price: 1000, guests: 3 })).toBe(3000);
    expect(
      bookingGrossAmount({ listingType: 'homestay', price: 1000, guests: 1, checkIn: '2026-11-06', checkOut: '2026-11-04' })
    ).toBe(1000);
  });

  it('never prices a homestay for fewer than one guest', () => {
    expect(
      bookingGrossAmount({ listingType: 'homestay', price: 1000, guests: 0, checkIn: '2026-11-04', checkOut: '2026-11-05' })
    ).toBe(1000);
  });

  it('is the flat rate for a driver, whatever the guest count', () => {
    expect(bookingGrossAmount({ listingType: 'driver', price: 450, guests: 4 })).toBe(450);
  });

  it('is zero for an unpriced listing', () => {
    expect(bookingGrossAmount({ listingType: 'homestay', price: 0, guests: 2 })).toBe(0);
    expect(bookingGrossAmount({ listingType: 'driver', price: NaN })).toBe(0);
  });
});
