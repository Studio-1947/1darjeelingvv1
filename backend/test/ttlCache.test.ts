import { describe, it, expect } from 'vitest';
import { TtlCache } from '../src/lib/ttlCache';

describe('TtlCache', () => {
  it('loads once while fresh, shared by callers meanwhile, and again once stale', async () => {
    let now = 0;
    let loads = 0;
    const cache = new TtlCache<number>(1000, 10, () => now);
    const load = () => Promise.resolve(++loads);
    const [a, b] = await Promise.all([cache.get('k', load), cache.get('k', load)]);
    expect([a, b, loads]).toEqual([1, 1, 1]);
    now = 999;
    expect(await cache.get('k', load)).toBe(1);
    now = 1000;
    expect(await cache.get('k', load)).toBe(2);
  });

  it('does not keep a failed load', async () => {
    const cache = new TtlCache<number>(1000, 10, () => 0);
    await expect(cache.get('k', () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    await Promise.resolve();
    expect(await cache.get('k', () => Promise.resolve(7))).toBe(7);
  });

  it('drops the oldest key past its size, and clears', async () => {
    const cache = new TtlCache<string>(1000, 2, () => 0);
    await cache.get('a', async () => 'a');
    await cache.get('b', async () => 'b');
    await cache.get('c', async () => 'c');
    expect(cache.size).toBe(2);
    expect(await cache.get('a', async () => 'a2')).toBe('a2');
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
