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

describe('trip search knows the other names of a stop (persona test 2026-11-09)', () => {
  const fare = (route: string): RouteFare[] => [{ route, price: 2500, unit: 'trip' }];
  it('finds NJP under New Jalpaiguri, Siliguri and short forms', () => {
    for (const r of ['New Jalpaiguri → Darjeeling', 'Siliguri to Darjeeling', 'NJP Station - Darj', 'NJP-DJ']) {
      expect(tripMatch(fare(r), 'NJP', 'Darjeeling')).toBe('covers');
    }
  });
  it('finds Bagdogra under IXB and airport', () => {
    expect(tripMatch(fare('IXB drop to Darjeeling'), 'Bagdogra', 'Darjeeling')).toBe('covers');
    expect(tripMatch(fare('Airport - Darjeeling'), 'Bagdogra Airport (IXB)', 'Darjeeling')).toBe('covers');
  });
  it('keeps different places apart', () => {
    expect(tripMatch(fare('Bagdogra airport drop to Darjeeling'), 'NJP', 'Darjeeling')).toBe('no');
    expect(tripMatch(fare('Full-day Darjeeling sightseeing'), 'NJP', 'Darjeeling')).toBe('no');
    // "dj" is a whole word only, not part of another word.
    expect(tripMatch(fare('Djamboree to Kalimpong'), 'Darjeeling', 'Kalimpong')).toBe('no');
  });
});
