import { eq, sql } from 'drizzle-orm';
import { HOST_PLAN_DAYS } from '../config';
import { db, schema } from '../db';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A host's yearly plan: ₹1 for the first year (`provider_registration`), ₹499 for each year after
 * (`provider_renewal`). `providers.plan_expires_at` is when the current year ends; once it has
 * passed, the host's listings leave the public feed and stop taking bookings until they renew.
 *
 * Hosts who were already active when this model arrived were given a year from that day by the
 * migration that added the column, so nobody was cut off by the change.
 */

export interface HostPlanRow {
  status: string;
  planExpiresAt?: string | null;
}

/**
 * Monotonic by construction: the expiry can only move forward.
 *
 * Two consequences that are both deliberate. Renewing early extends the remaining year rather
 * than truncating it, so nobody is punished for paying ahead of time. And a payment settled twice
 * (the webhook and the browser callback race by design) can never shorten a host's year, even if
 * settlePaymentOnce's guard were ever bypassed.
 */
export function computeHostPlanExpiry(
  existing: string | null | undefined,
  now: Date = new Date()
): string {
  const nowMs = now.getTime();
  const existingMs = existing ? Date.parse(existing) : NaN;
  const base = Number.isNaN(existingMs) || existingMs < nowMs ? nowMs : existingMs;
  return new Date(base + HOST_PLAN_DAYS * DAY_MS).toISOString();
}

/** True when the plan has an expiry and it has passed. A missing or unparseable value is not "lapsed". */
export function isHostPlanLapsed(row: HostPlanRow, now: Date = new Date()): boolean {
  if (!row.planExpiresAt) return false;
  const expiry = Date.parse(row.planExpiresAt);
  if (Number.isNaN(expiry)) return false;
  return expiry <= now.getTime();
}

/** Active, paid up and inside the current year. */
export function isHostPlanLive(row: HostPlanRow, now: Date = new Date()): boolean {
  return row.status === 'active' && !!row.planExpiresAt && !isHostPlanLapsed(row, now);
}

/**
 * The public-feed predicate: a listing is hidden while its host's plan has lapsed.
 *
 * Written as NOT EXISTS so listings with no provider row at all stay visible. Tourist spots and
 * listings an admin created on someone's behalf carry a user id in `provider_id`, and they have no
 * plan to lapse. Stored expiries are ISO-8601 UTC strings in one fixed format, so comparing them as
 * text orders them correctly.
 */
export function hostPlanVisibility(now: Date = new Date()) {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${schema.providers}
    WHERE ${schema.providers.id} = ${schema.listings.providerId}
      AND ${schema.providers.planExpiresAt} IS NOT NULL
      AND ${schema.providers.planExpiresAt} <= ${now.toISOString()}
  )`;
}

/**
 * Whether a listing's host has let their plan lapse. Listings with no provider row (spots,
 * admin-authored listings) never do.
 */
export async function isListingHostLapsed(providerId: string, now: Date = new Date()): Promise<boolean> {
  const [row] = await db.select({ status: schema.providers.status, planExpiresAt: schema.providers.planExpiresAt })
    .from(schema.providers)
    .where(eq(schema.providers.id, providerId))
    .limit(1);
  return !!row && isHostPlanLapsed(row, now);
}
