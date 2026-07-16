/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

clientsClaim();

// Precache everything the build emitted (JS/CSS/HTML chunks, manifest, icons).
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigation fallback so client-side routes keep working offline. API
// calls are deliberately excluded — this is an offline *app shell*, not
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

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
