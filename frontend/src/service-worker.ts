/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

/**
 * Take over as soon as this worker is installed, rather than waiting for every
 * tab of the site to close first.
 *
 * The pair matters, and so does the fact that the decision lives *here* rather
 * than in the page:
 *
 *   skipWaiting  - a new worker otherwise sits in `waiting` indefinitely. On a
 *                  phone, tabs are effectively never all closed, so a returning
 *                  visitor kept running the index.html and bundle precached on
 *                  their first visit. Nothing about that is visible from the
 *                  server, which serves the new build correctly throughout.
 *   clientsClaim - activation alone does not re-point already-open pages; this
 *                  does, and is what makes the reload in
 *                  serviceWorkerRegistration.ts land on the new precache.
 *
 * It has to be the worker's own call because the page asking for it can only
 * ever be the OLD page: the code that would post SKIP_WAITING ships inside the
 * bundle the stale worker is still serving. A browser stuck on an old version
 * therefore cannot be talked out of it from the page side - it can only be told
 * by the incoming worker, which is what this is.
 *
 * Safe here specifically because the build emits a single bundle with no lazy
 * chunks (the precache manifest is index.html + one JS + one CSS). If code
 * splitting is ever turned on, revisit: an open page could then request a chunk
 * the newly-claimed worker's precache no longer has.
 */
self.skipWaiting();
clientsClaim();

// Precache everything the build emitted (JS/CSS/HTML chunks, manifest, icons).
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigation fallback so client-side routes keep working offline. API
// calls are deliberately excluded - this is an offline *app shell*, not
// offline *data*; GET /api/... requests still hit the network and fail
// normally when offline rather than silently serving stale listings/bookings.
const fileExtensionRegexp = /\/[^/?]+\.[^/]+$/;
registerRoute(
  ({ request, url }: { request: Request; url: URL }) => {
    if (request.mode !== 'navigate') return false;
    if (url.pathname.startsWith('/api')) return false;
    if (fileExtensionRegexp.test(url.pathname)) return false;
    return true;
  },
  createHandlerBoundToURL('/index.html')
);

// Cache remote listing images (Cloudinary/Unsplash/Pexels) so previously-seen
// photos still render offline.
registerRoute(
  ({ url }: { url: URL }) =>
    url.origin !== self.location.origin && /\.(?:png|jpg|jpeg|webp|gif|svg)$/i.test(url.pathname),
  new StaleWhileRevalidate({
    cacheName: 'remote-images',
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  })
);

/**
 * Hand over to the new worker on request.
 *
 * This handler existed but nothing ever sent the message, which made the whole
 * update path dead code. A new worker downloads the new precache, reaches
 * `waiting`, and then stops: `clientsClaim()` only claims *uncontrolled* clients,
 * so with an old worker still in charge the new one waits for every tab of the
 * site to close. On a phone that is close to never, so a deploy could sit
 * unseen by returning visitors indefinitely - invisible from the server, which
 * is serving the new files correctly the whole time.
 *
 * serviceWorkerRegistration.ts is what posts this now, from its onUpdate hook.
 */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
