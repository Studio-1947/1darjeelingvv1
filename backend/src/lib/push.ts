import { eq, inArray } from 'drizzle-orm';

import { db, schema } from '../db';
import { EXPO_ACCESS_TOKEN, PUSH_ENABLED, log } from '../config';

/**
 * Phone notifications through Expo's push service.
 *
 * The app has registered push tokens (POST /users/me/push-token) for a long time, but nothing ever
 * sent to them, so a host only learnt about a booking by opening the app. Every in-app notification
 * now also goes out here. Never throws, for the same reason as the other senders.
 *
 * Android delivery additionally needs the app build to carry Firebase (FCM) credentials in EAS;
 * without them Expo answers with an error per token, which is logged and otherwise harmless.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const TIMEOUT_MS = 10_000;

type Ticket = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };

export async function sendPushToUser(
  userId: string,
  n: { title: string; body: string; data?: Record<string, unknown> }
): Promise<void> {
  if (!PUSH_ENABLED || !userId) return;
  try {
    const rows = await db
      .select({ token: schema.pushTokens.token })
      .from(schema.pushTokens)
      .where(eq(schema.pushTokens.userId, userId));
    const tokens = rows.map((r) => r.token).filter((t) => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));
    if (tokens.length === 0) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(
          // No channelId: Android drops a notification aimed at a channel the phone never created, and
          // the app only creates 'bookings' (lazily). Leaving it out lands on the channel Expo
          // always creates, on every app version.
          tokens.map((to) => ({ to, title: n.title, body: n.body, data: n.data ?? {}, sound: 'default' }))
        ),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const json = (await res.json().catch(() => null)) as { data?: Ticket[] } | null;
    if (!res.ok || !json?.data) {
      log.error(`[push] Expo answered ${res.status} for user ${userId}`);
      return;
    }

    // A token whose app was uninstalled will never work again; forget it so it is not retried forever.
    const dead = tokens.filter((_, i) => json.data![i]?.details?.error === 'DeviceNotRegistered');
    if (dead.length) {
      await db.delete(schema.pushTokens).where(inArray(schema.pushTokens.token, dead));
    }
    const failed = json.data.filter((t) => t.status === 'error' && t.details?.error !== 'DeviceNotRegistered');
    if (failed.length) {
      log.error(`[push] ${failed.length} push(es) to user ${userId} failed: ${failed.map((f) => f.message).join('; ').slice(0, 300)}`);
    }
  } catch (err) {
    log.error(`[push] could not send to user ${userId}: ${(err as Error)?.message || err}`);
  }
}
