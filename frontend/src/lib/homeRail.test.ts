import { describe, expect, it } from 'vitest';
import { isNewListing, pickRail } from './homeRail';

const NOW = Date.parse('2026-11-19T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

describe('isNewListing', () => {
  it('counts the last 14 days only', () => {
    expect(isNewListing({ id: 1, created_at: daysAgo(1) }, NOW)).toBe(true);
    expect(isNewListing({ id: 1, created_at: daysAgo(13.9) }, NOW)).toBe(true);
    expect(isNewListing({ id: 1, created_at: daysAgo(15) }, NOW)).toBe(false);
    expect(isNewListing({ id: 1, created_at: null }, NOW)).toBe(false);
    expect(isNewListing({ id: 1, created_at: 'nonsense' }, NOW)).toBe(false);
  });
});

describe('pickRail', () => {
  // Twelve old shops in the feed's order, then one approved yesterday at the very end.
  const old = Array.from({ length: 12 }, (_, i) => ({ id: `old${i}`, created_at: daysAgo(60 + i) }));
  const newShop = { id: 'new', created_at: daysAgo(1) };

  it('gives a new listing beyond the first n a place, keeping the rail length', () => {
    const { items, fresh } = pickRail([...old, newShop], 9, { now: NOW });
    expect(items).toHaveLength(9);
    expect(items[0].id).toBe('new');
    expect(fresh.has('new')).toBe(true);
    // The rest keep the feed's order.
    expect(items.slice(1).map((x) => x.id)).toEqual(old.slice(0, 8).map((x) => x.id));
  });

  it('keeps the existing order when nothing is new', () => {
    const { items, fresh } = pickRail(old, 9, { now: NOW });
    expect(items.map((x) => x.id)).toEqual(old.slice(0, 9).map((x) => x.id));
    expect(fresh.size).toBe(0);
  });

  it('reserves at most a third of the rail for new listings, newest first', () => {
    const news = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, created_at: daysAgo(i + 1) }));
    const { items, fresh } = pickRail([...old, ...news], 9, { now: NOW });
    expect(items).toHaveLength(9);
    expect(items.slice(0, 3).map((x) => x.id)).toEqual(['n0', 'n1', 'n2']);
    expect([...fresh]).toEqual(['n0', 'n1', 'n2']);
    expect(items.slice(3).map((x) => x.id)).toEqual(old.slice(0, 6).map((x) => x.id));
  });

  it('does not repeat a new listing that is already in the first n', () => {
    const { items } = pickRail([newShop, ...old], 4, { now: NOW });
    expect(items.map((x) => x.id)).toEqual(['new', 'old0', 'old1', 'old2']);
  });

  it('handles a short feed', () => {
    expect(pickRail([newShop], 9, { now: NOW }).items).toEqual([newShop]);
    expect(pickRail([], 9, { now: NOW }).items).toEqual([]);
  });
});
