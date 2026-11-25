/**
 * The search log behind the admin Search insights (routes/searchEvents.ts): what travellers search
 * for, what found nothing, and what they opened. Kept anonymous and short-lived, as the Privacy
 * Policy (sections 1.5 and 6) says:
 *
 *   - no user id, phone or IP; only a random code for one browser visit (`session`)
 *   - numbers of 5+ digits (phones, PINs, booking codes) and email addresses removed from the words
 *   - deleted after SEARCH_LOG_DAYS (180 by default) by the sweep below
 */
import { lt, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { log } from '../config';
import { words } from './search';

/** How long a search is kept. The Privacy Policy states this number: change both together. */
export const SEARCH_LOG_DAYS = (() => {
  const n = Number(process.env.SEARCH_LOG_DAYS);
  return Number.isFinite(n) && n >= 1 && n <= 365 ? Math.floor(n) : 180;
})();

export const SEARCH_Q_MAX = 120;

/** The words as kept: no email addresses, no long numbers, trimmed. Empty when nothing is left. */
export function scrubQuery(q: string): string {
  return String(q || '')
    .replace(/[^\s@]+@[^\s@]+/g, ' ')
    // 5 or more digits, with spaces, dots or dashes between them ("98000 12345", "+91-98000-12345").
    .replace(/\+?\d(?:[\s.-]?\d){4,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SEARCH_Q_MAX);
}

/** For counting: "Ghoom Monastery!" and "ghum monastery" are one search (local spellings folded). */
export function normQuery(q: string): string {
  return words(q).join(' ').slice(0, SEARCH_Q_MAX);
}

export async function sweepSearchEvents(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - SEARCH_LOG_DAYS * 86_400_000).toISOString();
  const gone = await db.delete(schema.searchEvents).where(lt(schema.searchEvents.createdAt, cutoff)).returning({ id: schema.searchEvents.id });
  return gone.length;
}

export function startSearchEventSweep(): NodeJS.Timeout {
  const run = () => sweepSearchEvents()
    .then((n) => { if (n) log.info(`[search-log] deleted ${n} searches older than ${SEARCH_LOG_DAYS} days`); })
    .catch((err) => log.warn(`[search-log] sweep failed: ${(err as Error).message}`));
  void run();
  const timer = setInterval(run, 6 * 60 * 60 * 1000);
  timer.unref();
  return timer;
}

/** The admin Search insights for the last `days` days, optionally for one category. */
export async function searchInsights(days: number, type?: string | null) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const where = type
    ? sql`created_at >= ${since} and type = ${type}`
    : sql`created_at >= ${since}`;
  const [totals] = (await db.execute(sql`
    select count(*)::int as searches,
           count(distinct session)::int as sessions,
           count(*) filter (where results = 0)::int as zero,
           count(*) filter (where fallback)::int as fallback,
           count(*) filter (where opened_listing_id is not null)::int as opened,
           count(*) filter (where source = 'voice')::int as voice
    from ${schema.searchEvents} where ${where}`)).rows as any[];
  const top = (await db.execute(sql`
    select q_norm as q, count(*)::int as n, round(avg(results))::int as avg_results,
           count(*) filter (where opened_listing_id is not null)::int as opened
    from ${schema.searchEvents} where ${where} and q_norm <> ''
    group by q_norm order by n desc, q_norm limit 25`)).rows;
  // Searches that found nothing (or only the fallback): the places and things to list next.
  const missing = (await db.execute(sql`
    select q_norm as q, count(*)::int as n, coalesce(max(type), '') as type,
           bool_or(fallback) as fallback, max(created_at) as last_at
    from ${schema.searchEvents} where ${where} and q_norm <> '' and (results = 0 or fallback)
    group by q_norm order by n desc, q_norm limit 25`)).rows;
  const byType = (await db.execute(sql`
    select coalesce(type, '') as type, count(*)::int as n,
           count(*) filter (where results = 0 or fallback)::int as missing
    from ${schema.searchEvents} where ${where}
    group by coalesce(type, '') order by n desc`)).rows;
  return { days, type: type || null, keep_days: SEARCH_LOG_DAYS, totals, top, missing, by_type: byType };
}
