import { describe, expect, it } from 'vitest';
import {
  cleanAreas, driverQuality, driverRoutes, rankDrivers, readDriverQuery, servesPlace, tripMatch,
  type DriverQuery,
} from '../src/lib/driverMatch';
import { placeNamed } from '../src/lib/places';

const driver = (over: Partial<{ title: string; location: string; latitude: number | null; longitude: number | null; extras: any }> = {}) => ({
  title: 'Driver',
  location: 'Darjeeling',
  latitude: null as number | null,
  longitude: null as number | null,
  extras: {},
  ...over,
});
const query = (over: Partial<DriverQuery> = {}): DriverQuery => ({ from: '', to: '', place: '', near: null, within: null, ...over });

describe('driver routes', () => {
  it('leaves out the wizard\'s "Full day hire" placeholder, in every language', () => {
    for (const route of ['Full day hire', 'पूरे दिन की बुकिंग', 'সারাদিনের ভাড়া', 'पूरा दिनको भाडा']) {
      expect(driverRoutes(driver({ extras: { routes: [{ route, price: 2500, unit: 'day' }] } }))).toEqual([]);
    }
  });

  it('reads string and priced rows, and the seeded drivers\' editorial routes', () => {
    expect(driverRoutes(driver({ extras: { routes: ['NJP ↔ Darjeeling', { route: 'Mirik ↔ Siliguri', price: 900 }] } })))
      .toEqual(['NJP ↔ Darjeeling', 'Mirik ↔ Siliguri']);
    expect(driverRoutes(driver({ title: 'Prakash - Airport/NJP Transfer' }))).toContain('NJP Railway Station ↔ Darjeeling');
  });
});

describe('trip match', () => {
  const placeholderOnly = driver({ extras: { routes: [{ route: 'Full day hire', price: 2500, unit: 'day' }] } });

  it('a driver with only the placeholder route is unlisted, not "does not do this trip"', () => {
    expect(tripMatch(driver({ location: 'Gangtok', extras: { routes: [{ route: 'Full day hire' }] } }), 'Mirik', 'Kurseong')).toBe('unlisted');
  });

  it('covers when one route holds both ends, under any of their names', () => {
    const d = driver({ extras: { routes: ['New Jalpaiguri → Darjeeling'] } });
    expect(tripMatch(d, 'NJP Station', 'Darjeeling')).toBe('covers');
    expect(tripMatch(d, 'Siliguri', 'Darj')).toBe('covers');
  });

  it('serves when based at or serving the pickup', () => {
    expect(tripMatch(placeholderOnly, 'Darjeeling', 'Gangtok')).toBe('serves');
    const mirikArea = driver({ location: 'Siliguri', extras: { areas: [{ name: 'Mirik', lat: 26.887, lng: 88.187 }] } });
    expect(tripMatch(mirikArea, 'Mirik', 'Bagdogra')).toBe('serves');
  });

  it('other when what they list does not touch the trip', () => {
    const d = driver({ location: 'Gangtok', extras: { routes: ['Gangtok ↔ Lachung'] } });
    expect(tripMatch(d, 'Mirik', 'Kurseong')).toBe('other');
  });
});

describe('serving a place', () => {
  it('by base name, area name, route, or a base or area within 15 km', () => {
    expect(servesPlace(driver({ location: 'Ghum, Darjeeling' }), 'Ghum')).toBe(true);
    expect(servesPlace(driver({ location: 'Siliguri', extras: { areas: [{ name: 'Mirik Lake', lat: 26.887, lng: 88.187 }] } }), 'Mirik')).toBe(true);
    expect(servesPlace(driver({ location: 'Siliguri', extras: { routes: ['Siliguri ↔ Kalimpong'] } }), 'Kalimpong')).toBe(true);
    // Pinned in Jorebunglow, about 4 km from Darjeeling town.
    expect(servesPlace(driver({ location: 'Home', latitude: 27.006, longitude: 88.26 }), 'Darjeeling')).toBe(true);
    expect(servesPlace(driver({ location: 'Siliguri' }), 'Darjeeling')).toBe(false);
  });
});

describe('ranking', () => {
  const near = { lat: 27.041, lng: 88.2663 }; // Darjeeling town
  const a = driver({ title: 'far', location: 'Siliguri' });
  const b = driver({ title: 'close', location: 'Ghum' });
  const c = driver({ title: 'covers', location: 'Kalimpong', extras: { routes: ['Darjeeling ↔ Gangtok'] } });

  it('trip coverers first, then by distance band from the pickup', () => {
    const out = rankDrivers([a, b, c], query({ from: 'Darjeeling', to: 'Gangtok' }), () => 0).map((h) => h.item.title);
    expect(out).toEqual(['covers', 'close', 'far']);
  });

  it('near me with a radius keeps only drivers within it, nearest band first', () => {
    // Ghum is about 4 km from town, Kalimpong about 20 (straight line), Siliguri about 37.
    expect(rankDrivers([a, b, c], query({ near, within: 25 }), () => 0).map((h) => h.item.title)).toEqual(['close', 'covers']);
    const out = rankDrivers([a, b, c], query({ near, within: 10 }), () => 0);
    expect(out.map((h) => h.item.title)).toEqual(['close']);
    expect(out[0].km).toBeLessThan(10);
  });

  it('within a band, the better driver leads; with no point, quality alone', () => {
    const good = driver({ title: 'good', location: 'Darjeeling' });
    const plain = driver({ title: 'plain', location: 'Darjeeling' });
    const q = (l: any) => (l.title === 'good' ? 3 : 0);
    expect(rankDrivers([plain, good], query({ near }), q).map((h) => h.item.title)).toEqual(['good', 'plain']);
    expect(rankDrivers([plain, good], query(), q).map((h) => h.item.title)).toEqual(['good', 'plain']);
  });

  it('keepOrder holds a typed search\'s text order inside each trip group', () => {
    const m = driver({ title: 'covers', location: 'Gangtok', extras: { routes: ['Mirik ↔ Kurseong'] } });
    const out = rankDrivers([a, m], query({ from: 'Mirik', to: 'Kurseong' }), () => 0, true).map((h) => h.item.title);
    expect(out).toEqual(['covers', 'far']);
    // With no trip, the text order stands even though "close" is nearer.
    expect(rankDrivers([a, b], query({ near }), () => 9, true).map((h) => h.item.title)).toEqual(['far', 'close']);
  });

  it('the place filter keeps only drivers who work there', () => {
    expect(rankDrivers([a, b, c], query({ place: 'Kalimpong' }), () => 0).map((h) => h.item.title)).toEqual(['covers']);
  });

  it('quality counts rating (full from five reviews), verified, and routes or areas filled in', () => {
    const d = driver({ extras: { routes: ['NJP ↔ Darjeeling'] } });
    expect(driverQuality(d, { average: 5, count: 5 }, true)).toBeCloseTo(3.3);
    expect(driverQuality(driver(), { average: 5, count: 1 }, false)).toBeCloseTo(0.4);
  });
});

describe('input', () => {
  it('cleans areas: named, positioned, no repeats, at most 12', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `Place ${i}`, lat: 27, lng: 88 }));
    expect(cleanAreas(many)).toHaveLength(12);
    expect(cleanAreas([{ name: ' Mirik ', lat: '26.887', lng: 88.187 }, { name: 'mirik', lat: 1, lng: 1 }, { name: 'x' }, { lat: 1, lng: 1 }]))
      .toEqual([{ name: 'Mirik', lat: 26.887, lng: 88.187 }]);
    expect(cleanAreas('Mirik')).toBeNull();
  });

  it('reads the query, refusing a bad position or radius', () => {
    expect(readDriverQuery({ from: ' NJP ', near_lat: '27.04', near_lng: '88.26', within: '10' }))
      .toEqual({ from: 'NJP', to: '', place: '', near: { lat: 27.04, lng: 88.26 }, within: 10 });
    expect(readDriverQuery({ near_lat: 'x', near_lng: '1' })).toHaveProperty('error');
    expect(readDriverQuery({ within: '-3' })).toHaveProperty('error');
  });

  it('place names match whole words only', () => {
    expect(placeNamed('Leh, Ladakh')?.name).toBe('Leh');
    expect(placeNamed('Kandali village')).toBeNull();
    expect(placeNamed('Ghum, Darjeeling')?.name).toBe('Ghum');
  });
});
