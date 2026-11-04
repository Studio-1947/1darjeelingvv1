import { describe, expect, it } from 'vitest';
import { distanceTo, kmLabel, placeFor } from './places';

const chowrasta = { lat: 27.0425, lng: 88.2663 };

describe('Near me without a map pin', () => {
  it('finds the place a listing names, most specific first', () => {
    expect(placeFor('Ghum, Darjeeling')).toEqual({ lat: 27.0087, lng: 88.253 });
    expect(placeFor('NJP Railway Station')?.lat).toBeCloseTo(26.68, 1);
    expect(placeFor('Darjeeling Town')).toEqual({ lat: 27.041, lng: 88.2663 });
    expect(placeFor('asdasd')).toBeNull();
    expect(placeFor('D')).toBeNull();
  });

  it('prefers the pin, and marks a place estimate as approximate', () => {
    const pinned = distanceTo(chowrasta, { latitude: 27.0425, longitude: 88.2663, location: 'Mirik' })!;
    expect(pinned.approx).toBe(false);
    expect(pinned.km).toBeLessThan(0.1);
    const driver = distanceTo(chowrasta, { latitude: null, longitude: null, location: 'Mirik' })!;
    expect(driver.approx).toBe(true);
    expect(driver.km).toBeGreaterThan(15);
    expect(kmLabel(driver)).toMatch(/^≈ \d+ km$/);
    expect(distanceTo(chowrasta, { location: 'asdasd' })).toBeNull();
  });
});
