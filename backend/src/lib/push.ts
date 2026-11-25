import { eq, inArray } from 'drizzle-orm';

import { db, schema } from '../db';
import { EXPO_ACCESS_TOKEN, PUSH_ENABLED, log } from '../config';
import { sendWebPushToUser } from './webPush';

/**
 * Phone notifications through Expo's push service (and, through lib/webPush.ts, to browsers that
 * turned notifications on for the website).
 *
 * The app has registered push tokens (POST /users/me/push-token) for a long time, but nothing ever
 * sent to them, so a host only learnt about a booking by opening the app. Every in-app notification
 * now also goes out here, and so do the team's messages from the admin panel (lib/broadcast.ts).
 * Never throws, for the same reason as the other senders.
 *
 * Android delivery additionally needs the app build to carry Firebase (FCM) credentials in EAS;
 * without them Expo answers with an error per token, which is logged and otherwise harmless.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const TIMEOUT_MS = 10_000;
/** Expo takes at most 100 messages per request. */
const CHUNK = 100;

type Ticket = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };
export type PushContent = { title: string; body: string; data?: Record<string, unknown> };
export type PushResult = { devices: number; ok: number; failed: number };

const isExpoToken = (t: string) => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken[');

/** The registered tokens of these users, as { userId, token } pairs. */
export async function tokensFor(userIds: string[]): Promise<{ userId: string; token: string }[]> {
  if (!userIds.length) return [];
  const out: { userId: string; token: string }[] = [];
  for (let i = 0; i < userIds.length; i += 1000) {
    const rows = await db
      .select({ userId: schema.pushTokens.userId, token: schema.pushTokens.token })
      .from(schema.pushTokens)
      .where(inArray(schema.pushTokens.userId, userIds.slice(i, i + 1000)));
    out.push(...rows.filter((r) => isExpoToken(r.token)));
  }
  return out;
}

/**
 * Sends one message per token, 100 to a request. Each message can carry its own data (the
 * broadcast gives every person the id of their own in-app row). Tokens Expo says are gone are
 * forgotten. Returns how many devices were tried and how many Expo accepted.
 */
export async function sendPushMessages(messages: { to: string; content: PushContent }[], label: string): Promise<PushResult> {
  const result: PushResult = { devices: messages.length, ok: 0, failed: 0 };
  if (!PUSH_ENABLED || !messages.length) return result;
  for (let i = 0; i < messages.length; i += CHUNK) {
    const batch = messages.slice(i, i + CHUNK);
    try {
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
            batch.map(({ to, content: n }) => ({
              to, title: n.title, body: n.body, data: n.data ?? {}, sound: 'default', channelId: 'default', priority: 'high',
            }))
          ),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const json = (await res.json().catch(() => null)) as { data?: Ticket[] } | null;
      if (!res.ok || !json?.data) {
        result.failed += batch.length;
        log.error(`[push] Expo answered ${res.status} for ${label}`);
        continue;
      }

      // A token whose app was uninstalled will never work again; forget it so it is not retried forever.
      const dead = batch.filter((_, j) => json.data![j]?.details?.error === 'DeviceNotRegistered').map((m) => m.to);
      if (dead.length) {
        await db.delete(schema.pushTokens).where(inArray(schema.pushTokens.token, dead));
      }
      const ok = json.data.filter((t) => t.status === 'ok').length;
      result.ok += ok;
      result.failed += batch.length - ok;
      const failed = json.data.filter((t) => t.status === 'error' && t.details?.error !== 'DeviceNotRegistered');
      if (failed.length) {
        log.error(`[push] ${failed.length} push(es) for ${label} failed: ${failed.map((f) => f.message).join('; ').slice(0, 300)}`);
      }
    } catch (err) {
      result.failed += batch.length;
      log.error(`[push] could not send for ${label}: ${(err as Error)?.message || err}`);
    }
  }
  return result;
}

/** One notification to every phone this person signed in on, and every browser they turned notifications on in. */
export async function sendPushToUser(userId: string, n: PushContent): Promise<void> {
  if (!PUSH_ENABLED || !userId) return;
  await Promise.all([sendExpoToUser(userId, n), sendWebPushToUser(userId, n)]);
}

async function sendExpoToUser(userId: string, n: PushContent): Promise<void> {
  try {
    const rows = await db
      .select({ token: schema.pushTokens.token })
      .from(schema.pushTokens)
      .where(eq(schema.pushTokens.userId, userId));
    const tokens = rows.map((r) => r.token).filter(isExpoToken);
    await sendPushMessages(tokens.map((to) => ({ to, content: n })), `user ${userId}`);
  } catch (err) {
    log.error(`[push] could not send to user ${userId}: ${(err as Error)?.message || err}`);
  }
}
