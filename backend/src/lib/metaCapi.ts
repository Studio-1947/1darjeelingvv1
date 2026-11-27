/**
 * Meta Conversions API: tells Meta, from the server, about the conversions the Meta Pixel on the
 * website cannot see reliably (ad blockers, Safari's tracking limits, a payment finished by the
 * Razorpay webhook after the tab was closed). Meta uses them to measure our Facebook and Instagram
 * ads.
 *
 * Sent:
 *   CompleteRegistration  a new account signs up (routes/auth.ts, googleAuth.ts, appleAuth.ts)
 *   Purchase              a real payment is settled, once per order (routes/payments.ts)
 *
 * Website only. An event is sent only when the request that caused it came from a page on
 * aanganerp.in (its Referer). The mobile apps call the same routes, and sharing app users' data
 * with Meta would need Apple's tracking permission (ATT) and its own disclosure, so app sign-ups and
 * payments are never sent. A payment settled only by the Razorpay webhook has no page behind it
 * and is skipped too; most are still caught by /verify or the browser's order-status poll.
 *
 * The browser pixel sends only PageView, so these events have no browser twin to de-duplicate
 * against. Each still carries a stable event_id (the user id, the order id), so a retry inside
 * Meta's 48-hour window is counted once.
 *
 * Off unless META_CAPI_TOKEN is set, and never outside production: local runs and tests must not
 * reach the ad account. Sending never throws and is never awaited by a caller, so Meta being slow
 * or down cannot cost anyone a sign-up or a payment.
 *
 * What leaves us (Privacy Policy 1.5 and 4 say so): the phone number and email, each SHA-256
 * hashed as Meta requires, a hash of our user id, the IP address and browser of the request, and
 * Meta's own _fbp/_fbc cookies. For a purchase, also the amount and what was bought.
 */
import crypto from 'crypto';
import type { Request } from 'express';
import { IS_PROD, META_CAPI_TEST_CODE, META_CAPI_TOKEN, META_PIXEL_ID, log } from '../config';
import { phoneKey } from './phone';

const GRAPH_VERSION = 'v21.0';
const SEND_TIMEOUT_MS = 5000;

export function metaCapiEnabled(): boolean {
  return IS_PROD && !!META_CAPI_TOKEN && !!META_PIXEL_ID;
}

/** What the request that caused the event tells us about the browser behind it. */
export interface MetaRequestContext {
  ip?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
  /** The page the person was on: the Referer of the API call, as the API is same-origin. */
  sourceUrl?: string;
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim();
      try { return decodeURIComponent(value) || undefined; } catch { return value || undefined; }
    }
  }
  return undefined;
}

/** Only a page on our own site counts as the source URL; anything else is dropped. */
function ownPage(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    const u = new URL(referer);
    if (u.protocol === 'https:' && (u.hostname === 'aanganerp.in' || u.hostname === 'www.aanganerp.in')) {
      return `${u.origin}${u.pathname}`;
    }
  } catch { /* not a URL */ }
  return undefined;
}

export function metaContextFrom(req: Request): MetaRequestContext {
  const ua = req.headers['user-agent'];
  return {
    ip: req.ip || undefined,
    userAgent: typeof ua === 'string' ? ua : undefined,
    fbp: readCookie(req.headers.cookie, '_fbp'),
    fbc: readCookie(req.headers.cookie, '_fbc'),
    sourceUrl: ownPage(typeof req.headers.referer === 'string' ? req.headers.referer : undefined),
  };
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** Meta wants the phone as digits only, with the country code; null when it isn't a real number. */
export function hashedPhone(raw: unknown): string | null {
  const key = phoneKey(raw);
  return key ? sha256(key.replace(/^\+/, '')) : null;
}

export function hashedEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return e.includes('@') ? sha256(e) : null;
}

export interface MetaUser {
  id: string;
  phone?: string | null;
  email?: string | null;
}

export interface MetaEvent {
  name: 'CompleteRegistration' | 'Purchase';
  eventId: string;
  user: MetaUser;
  /** Absent when no browser caused it (the Razorpay webhook): sent as system_generated then. */
  ctx?: MetaRequestContext;
  customData?: Record<string, unknown>;
}

/** The event as Meta's /events endpoint takes it. Exported for the tests. */
export function buildMetaEvent(ev: MetaEvent, now = Date.now()) {
  const userData: Record<string, unknown> = { external_id: [sha256(ev.user.id)] };
  const ph = hashedPhone(ev.user.phone);
  if (ph) userData.ph = [ph];
  const em = hashedEmail(ev.user.email);
  if (em) userData.em = [em];
  if (ev.ctx?.ip) userData.client_ip_address = ev.ctx.ip;
  if (ev.ctx?.userAgent) userData.client_user_agent = ev.ctx.userAgent;
  if (ev.ctx?.fbp) userData.fbp = ev.ctx.fbp;
  if (ev.ctx?.fbc) userData.fbc = ev.ctx.fbc;

  // A "website" event must carry the browser's user agent; without one it is ours, not theirs.
  const fromBrowser = !!ev.ctx?.userAgent;
  return {
    event_name: ev.name,
    event_time: Math.floor(now / 1000),
    event_id: ev.eventId,
    action_source: fromBrowser ? 'website' : 'system_generated',
    ...(fromBrowser ? { event_source_url: ev.ctx?.sourceUrl || 'https://aanganerp.in/' } : {}),
    user_data: userData,
    ...(ev.customData ? { custom_data: ev.customData } : {}),
  };
}

/** Whether this event came from the website (see the note at the top). */
export function isFromWebsite(ev: MetaEvent): boolean {
  return !!ev.ctx?.sourceUrl && !!ev.ctx.userAgent;
}

/** Fire and forget. Never throws; a failure is logged and dropped. */
export function sendMetaEvent(ev: MetaEvent): void {
  if (!metaCapiEnabled() || !isFromWebsite(ev)) return;
  void (async () => {
    try {
      const body: Record<string, unknown> = { data: [buildMetaEvent(ev)] };
      if (META_CAPI_TEST_CODE) body.test_event_code = META_CAPI_TEST_CODE;
      const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${META_PIXEL_ID}/events`, {
        method: 'POST',
        // The token goes in a header, not the URL (?access_token=), so it never lands in a proxy
        // or access log.
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${META_CAPI_TOKEN}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!res.ok) {
        const text = (await res.text()).slice(0, 300);
        log.warn(`[meta-capi] ${ev.name} ${ev.eventId} refused: ${res.status} ${text}`);
      }
    } catch (err) {
      log.warn(`[meta-capi] ${ev.name} ${ev.eventId} not sent: ${(err as Error).message}`);
    }
  })();
}
