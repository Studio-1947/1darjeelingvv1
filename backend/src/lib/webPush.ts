import { inArray } from 'drizzle-orm';
import webpush from 'web-push';

import { db, schema } from '../db';
import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT, WEB_PUSH_ENABLED, log } from '../config';
import type { PushContent, PushResult } from './push';

/**
 * Notifications to the website, for browsers that turned them on (the Notifications page).
 *
 * The same messages lib/push.ts sends to phones through Expo, sent instead with the Web Push
 * standard: the browser gives us an endpoint on its vendor's push service (Google for Chrome and
 * Edge on Android, Mozilla, Apple, Microsoft), and we post an encrypted message there signed with
 * our VAPID key. The service worker (frontend/src/service-worker.ts) shows it. Never throws.
 */

export type WebSubscription = { endpoint: string; p256dh: string; auth: string };

const TIMEOUT_MS = 10_000;
/** How long a push service keeps trying a browser that is offline. Booking requests last a day. */
const TTL_SECONDS = 24 * 60 * 60;
/** How many browsers are posted to at once. */
const PARALLEL = 25;

/**
 * The push services browsers actually use. The server posts to whatever endpoint a subscription
 * names, so an endpoint anywhere else (an internal address, someone's server) is refused when it
 * is registered rather than fetched.
 */
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];
export function isPushServiceUrl(endpoint: string): boolean {
  let url: URL;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** A subscription as the browser's PushSubscription.toJSON() gives it, or the reason it is refused. */
export function parseSubscription(raw: unknown): { ok: true; value: WebSubscription } | { ok: false; error: string } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof r.endpoint === 'string' ? r.endpoint.trim() : '';
  const p256dh = typeof r.keys?.p256dh === 'string' ? r.keys.p256dh.trim() : '';
  const auth = typeof r.keys?.auth === 'string' ? r.keys.auth.trim() : '';
  if (!endpoint || endpoint.length > 1000 || !isPushServiceUrl(endpoint)) return { ok: false, error: 'Not a browser push subscription' };
  // p256dh is a 65-byte public key (87 characters), auth a 16-byte secret (22).
  if (!B64URL.test(p256dh) || p256dh.length < 80 || p256dh.length > 100) return { ok: false, error: 'Not a browser push subscription' };
  if (!B64URL.test(auth) || auth.length < 16 || auth.length > 50) return { ok: false, error: 'Not a browser push subscription' };
  return { ok: true, value: { endpoint, p256dh, auth } };
}

/** The browsers these users turned notifications on in. */
export async function webSubscriptionsFor(userIds: string[]): Promise<(WebSubscription & { userId: string })[]> {
  if (!userIds.length) return [];
  const out: (WebSubscription & { userId: string })[] = [];
  for (let i = 0; i < userIds.length; i += 1000) {
    const rows = await db
      .select({
        userId: schema.webPushSubscriptions.userId,
        endpoint: schema.webPushSubscriptions.endpoint,
        p256dh: schema.webPushSubscriptions.p256dh,
        auth: schema.webPushSubscriptions.auth,
      })
      .from(schema.webPushSubscriptions)
      .where(inArray(schema.webPushSubscriptions.userId, userIds.slice(i, i + 1000)));
    out.push(...rows);
  }
  return out;
}

type Sender = (sub: WebSubscription, payload: string) => Promise<{ statusCode: number }>;

const defaultSender: Sender = (sub, payload) =>
  webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    payload,
    {
      TTL: TTL_SECONDS,
      urgency: 'high',
      timeout: TIMEOUT_MS,
      vapidDetails: { subject: VAPID_SUBJECT, publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY },
    }
  );

/**
 * Sends each message to its browser. A browser the push service says is gone (404/410: the person
 * cleared site data, turned notifications off, or the subscription expired) is forgotten.
 * `send` is for tests; `force` lets them run with the keys unset.
 */
export async function sendWebPushMessages(
  messages: { to: WebSubscription; content: PushContent }[],
  label: string,
  opts: { send?: Sender; force?: boolean } = {}
): Promise<PushResult> {
  const result: PushResult = { devices: messages.length, ok: 0, failed: 0 };
  if ((!WEB_PUSH_ENABLED && !opts.force) || !messages.length) return result;
  const send = opts.send ?? defaultSender;
  const dead: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < messages.length; i += PARALLEL) {
    const batch = messages.slice(i, i + PARALLEL);
    const settled = await Promise.allSettled(
      batch.map(({ to, content }) =>
        send(to, JSON.stringify({ title: content.title, body: content.body, data: content.data ?? {} }))
      )
    );
    settled.forEach((s, j) => {
      if (s.status === 'fulfilled') {
        result.ok += 1;
        return;
      }
      result.failed += 1;
      const code = (s.reason as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) dead.push(batch[j].to.endpoint);
      else errors.push(`${code ?? ''} ${(s.reason as Error)?.message || s.reason}`.trim());
    });
  }

  if (dead.length) {
    try {
      await db.delete(schema.webPushSubscriptions).where(inArray(schema.webPushSubscriptions.endpoint, dead));
    } catch (err) {
      log.error(`[webpush] could not forget ${dead.length} gone browser(s): ${(err as Error)?.message || err}`);
    }
  }
  if (errors.length) log.error(`[webpush] ${errors.length} push(es) for ${label} failed: ${errors.join('; ').slice(0, 300)}`);
  return result;
}

/** One notification to every browser this person turned notifications on in. */
export async function sendWebPushToUser(userId: string, n: PushContent): Promise<void> {
  if (!WEB_PUSH_ENABLED || !userId) return;
  try {
    const subs = await webSubscriptionsFor([userId]);
    await sendWebPushMessages(subs.map((to) => ({ to, content: n })), `user ${userId}`);
  } catch (err) {
    log.error(`[webpush] could not send to user ${userId}: ${(err as Error)?.message || err}`);
  }
}
