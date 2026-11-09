import { describe, it, expect } from 'vitest';
import { routesCoverTrip, tripMatch, type RouteFare } from './routeFares';

const fare = (route: string): RouteFare => ({ route, price: 0, unit: 'trip' });

describe('tripMatch (audit 2026-11-08: drivers with no routes were hidden from trip search)', () => {
  const runs = [fare('Bagdogra Airport (IXB) ↔ Darjeeling'), fare('Darjeeling ↔ Gangtok')];

  it('covers a trip on one of the routes, either direction', () => {
    expect(tripMatch(runs, 'Bagdogra', 'Darjeeling')).toBe('covers');
    expect(tripMatch(runs, 'Darjeeling', 'Bagdogra Airport (IXB)')).toBe('covers');
  });

  it('does not join two routes into a third trip', () => {
    expect(tripMatch(runs, 'Gangtok', 'Bagdogra')).toBe('no');
  });

  it('says unlisted for a driver with no routes, instead of hiding them', () => {
    expect(routesCoverTrip([], 'NJP', 'Darjeeling')).toBe(false);
    expect(tripMatch([], 'NJP', 'Darjeeling')).toBe('unlisted');
  });

  it('treats an empty search as covering everyone', () => {
    expect(tripMatch([], '', '')).toBe('covers');
  });
});
