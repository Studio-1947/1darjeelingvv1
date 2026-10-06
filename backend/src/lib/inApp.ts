import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { log } from '../config';

/**
 * Writes one row to a user's in-app activity feed.
 *
 * Like the WhatsApp senders in notifications.ts this never throws: it runs after the booking has
 * already changed, and a failed feed write must not turn a successful request into a 500.
 */
export async function addInAppNotification(
  userId: string | null | undefined,
  n: { kind: string; title: string; body: string; refId?: string | null }
): Promise<void> {
  if (!userId) return;
  try {
    await db.insert(schema.notifications).values({
      id: uuidv4(),
      userId,
      kind: n.kind,
      title: n.title.slice(0, 200),
      body: n.body.slice(0, 500),
      refId: n.refId ?? null,
      readAt: null,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    log.error(`[inapp] could not record "${n.kind}" for user ${userId}: ${(err as Error)?.message || err}`);
  }
}

/**
 * The user who should hear about a booking on a listing. `listings.provider_id` is either a
 * provider row's id or, on admin-authored and older listings, a user id directly, so both are tried.
 */
export async function resolveHostUserId(listingProviderId: string | null | undefined): Promise<string | null> {
  if (!listingProviderId) return null;
  try {
    const [prov] = await db.select({ userId: schema.providers.userId })
      .from(schema.providers).where(eq(schema.providers.id, listingProviderId)).limit(1);
    if (prov) return prov.userId;
    const [user] = await db.select({ id: schema.users.id })
      .from(schema.users).where(eq(schema.users.id, listingProviderId)).limit(1);
    return user?.id ?? null;
  } catch {
    return null;
  }
}
