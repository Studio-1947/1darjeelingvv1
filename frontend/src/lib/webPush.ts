import api, { API_BASE } from './api';

/**
 * Notifications on the website: this browser's Web Push subscription, kept in step with the
 * signed-in account. The server side is backend/src/lib/webPush.ts; the worker that shows them is
 * src/service-worker.ts.
 *
 * The service worker is only registered in production builds, so in development every state here
 * is 'unsupported' and the Notifications page offers nothing. On an iPhone, Safari only has push
 * for a site added to the Home Screen (iOS 16.4+), so a plain Safari tab is 'unsupported' too.
 */

export type PushState = 'unsupported' | 'denied' | 'off' | 'on';

const supported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/** The worker this page is running under, or null (none registered, as in development). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  return reg ?? null;
}

let keyPromise: Promise<string | null> | null = null;
/** The server's public key, or null when the website does not send notifications. */
function serverKey(): Promise<string | null> {
  if (!keyPromise) {
    keyPromise = api.get('/notifications/web-push/key')
      .then(({ data }) => (typeof data?.key === 'string' && data.key ? data.key : null))
      .catch(() => { keyPromise = null; return null; });
  }
  return keyPromise;
}

const toBytes = (b64url: string) => {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

/** Where this browser stands. */
export async function pushState(): Promise<PushState> {
  const reg = await registration();
  if (!reg || !(await serverKey())) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await reg.pushManager.getSubscription().catch(() => null);
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Asks the browser (it shows its own prompt the first time) and registers it with the server. */
export async function turnOnPush(): Promise<PushState> {
  const reg = await registration();
  const key = await serverKey();
  if (!reg || !key) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'off';
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another key (the server's pair changed) can never be delivered to.
  const current = sub?.options?.applicationServerKey;
  if (sub && current && !sameKey(new Uint8Array(current), toBytes(key))) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) });
  await api.post('/notifications/web-push', sub.toJSON());
  return 'on';
}

const sameKey = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Stops them in this browser, here and on the server. */
export async function turnOffPush(): Promise<PushState> {
  await forgetPush();
  return (await pushState()) === 'denied' ? 'denied' : 'off';
}

/**
 * Re-registers an existing subscription under whoever is signed in now. Run after sign-in and on
 * each load, so a browser that changed hands, or whose subscription the push service renewed,
 * keeps reaching the right person. Does nothing (and never prompts) if they are not on.
 */
export async function syncPush(): Promise<void> {
  try {
    if (!supported() || Notification.permission !== 'granted') return;
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub && (await serverKey())) await api.post('/notifications/web-push', sub.toJSON());
  } catch {
    // A courtesy; the next load tries again.
  }
}

/**
 * On sign-out: the next person on this browser must not get the last one's notifications. Sent
 * with a plain fetch and keepalive, because sign-out clears the session at once and may navigate.
 */
export async function forgetPush(): Promise<void> {
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const { endpoint } = sub;
    await sub.unsubscribe().catch(() => {});
    await fetch(`${API_BASE}/notifications/web-push`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
      keepalive: true,
    });
  } catch {
    // Nothing to undo; a gone subscription is also dropped by the server on its next send.
  }
}
