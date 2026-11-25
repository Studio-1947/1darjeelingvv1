/**
 * A small in-memory cache of promises: one load per key while it is fresh, shared by every caller
 * that asks meanwhile (a burst of searches reads the database once). A failed load is not kept.
 * The oldest entry goes first once `max` keys are held.
 */
export class TtlCache<V> {
  private entries = new Map<string, { at: number; value: Promise<V> }>();

  constructor(private ttlMs: number, private max: number, private now: () => number = Date.now) {}

  get(key: string, load: () => Promise<V>): Promise<V> {
    const t = this.now();
    const hit = this.entries.get(key);
    if (hit && t - hit.at < this.ttlMs) return hit.value;
    if (hit) this.entries.delete(key);
    const value = load();
    this.entries.set(key, { at: t, value });
    value.catch(() => { if (this.entries.get(key)?.value === value) this.entries.delete(key); });
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
    return value;
  }

  clear() { this.entries.clear(); }

  get size() { return this.entries.size; }
}
