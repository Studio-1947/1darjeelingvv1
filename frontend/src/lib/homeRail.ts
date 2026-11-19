/*
 * Which listings a Home rail shows. The rail keeps the feed's own order, but a business that went
 * live in the last two weeks is always given a place in it, so a newly approved shop can be found
 * from Home and not only from its category page. The rail stays the same length.
 */

/** How long a listing counts as new, in days. */
export const NEW_DAYS = 14;

type Railable = { id: string | number; created_at?: string | number | Date | null };

const createdMs = (it: Railable): number => {
  const v = it.created_at;
  if (v === undefined || v === null || v === '') return NaN;
  return new Date(v).getTime();
};

/** Whether the listing went live within the last `days` days. */
export function isNewListing(it: Railable, now: number = Date.now(), days: number = NEW_DAYS): boolean {
  const ms = createdMs(it);
  return Number.isFinite(ms) && ms <= now && now - ms < days * 86_400_000;
}

/**
 * The `n` listings a rail shows: up to `reserve` of the newest listings created in the last `days`
 * days first (newest first), then the rest in the order given. Default reserve: a third of the rail,
 * at least one. Returns the picked items and the ids of the new ones (for the "New" tag).
 */
export function pickRail<T extends Railable>(
  items: T[],
  n: number,
  { now = Date.now(), days = NEW_DAYS, reserve }: { now?: number; days?: number; reserve?: number } = {},
): { items: T[]; fresh: Set<T['id']> } {
  const slots = Math.max(0, Math.min(n, reserve ?? Math.max(1, Math.ceil(n / 3))));
  const fresh = items
    .filter((it) => isNewListing(it, now, days))
    .sort((a, b) => createdMs(b) - createdMs(a))
    .slice(0, slots);
  const freshIds = new Set<T['id']>(fresh.map((it) => it.id));
  const rest = items.filter((it) => !freshIds.has(it.id));
  return { items: [...fresh, ...rest].slice(0, Math.max(0, n)), fresh: freshIds };
}
