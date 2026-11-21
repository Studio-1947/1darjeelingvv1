/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';

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
 * The build is code-split, so an open page could ask the newly-claimed worker
 * for a chunk from the old build that its precache no longer has. That page
 * never gets the chance: serviceWorkerRegistration.ts reloads it on the
 * controller change, onto the new index.html and its own chunks.
 */
self.skipWaiting();
clientsClaim();

// Precache the app shell (HTML, every JS/CSS chunk, manifest, icons). The list
// is written in at build time by scripts/build-sw.mjs.
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigation fallback so client-side routes keep working offline. API
// calls are deliberately excluded - this is an offline *app shell*, not
// offline *data*; GET /api/... requests still hit the network and fail
// normally when offline rather than silently serving stale listings/bookings.
const fileExtensionRegexp = /\/[^/?]+\.[^/]+$/;
registerRoute(
  ({ request, url }: { request: Request; url: URL }) => {
    if (request.mode !== 'navigate') return false;
    // /api and /api-docs belong to the backend and /admin is a separate app;
    // answering them with this site's index.html would break all three.
    if (url.pathname.startsWith('/api') || url.pathname.startsWith('/admin')) return false;
    if (fileExtensionRegexp.test(url.pathname)) return false;
    return true;
  },
  createHandlerBoundToURL('/index.html')
);

// Photos from Cloudinary and other hosts are left to the browser. The site's
// CSP (connect-src) also applies to fetches this worker makes, so caching them
// here would block every remote listing photo.

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
