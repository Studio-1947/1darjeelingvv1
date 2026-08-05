// Registers the Workbox-built service worker (src/service-worker.ts) in
// production builds only. Dev (`yarn start`) never registers one, so local
// development always sees fresh code with no stale-cache surprises.

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
    window.location.hostname === '[::1]' ||
    window.location.hostname.match(/^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/)
);

type Config = {
  onSuccess?: (registration: ServiceWorkerRegistration) => void;
  onUpdate?: (registration: ServiceWorkerRegistration) => void;
};

export function register(config?: Config) {
  if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
    const publicUrl = new URL((process.env.PUBLIC_URL as string) || '', window.location.href);
    if (publicUrl.origin !== window.location.origin) {
      return;
    }

    window.addEventListener('load', () => {
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

      if (isLocalhost) {
        checkValidServiceWorker(swUrl, config);
        navigator.serviceWorker.ready.then(() => {
          console.log('1 Darjeeling is being served cache-first by a service worker.');
        });
      } else {
        registerValidSW(swUrl, config);
      }
    });
  }
}

/**
 * Reload once when a new worker takes control, so the page on screen matches the
 * precache now serving it.
 *
 * The worker activates itself (see skipWaiting in service-worker.ts); this is the
 * other half - without it the visitor keeps looking at the old render until they
 * happen to navigate, even though the new bundle is already in place.
 *
 * Two guards, both load-bearing:
 *
 *   hadController - on a FIRST visit clientsClaim also fires controllerchange,
 *                   going from no controller to one. Reloading there would make
 *                   every new visitor's first page load flash and repeat itself
 *                   for no reason. Only a genuine hand-over counts, and that is
 *                   what having had a controller at startup distinguishes.
 *   refreshing    - Chrome can fire controllerchange more than once; two reloads
 *                   back to back is a flicker at best and a loop at worst.
 */
function reloadOnControllerChange() {
  const hadController = !!navigator.serviceWorker.controller;
  if (!hadController) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

function registerValidSW(swUrl: string, config?: Config) {
  // Registered before the worker can swap, so the hand-over is never missed.
  // A caller supplying onUpdate is taking the update over itself (to prompt
  // rather than reload), so the automatic path stands down.
  if (!config?.onUpdate) reloadOnControllerChange();

  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) return;
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              if (config && config.onUpdate) config.onUpdate(registration);
            } else {
              console.log('Content is cached for offline use.');
              if (config && config.onSuccess) config.onSuccess(registration);
            }
          }
        };
      };
    })
    .catch((error) => {
      console.error('Error during service worker registration:', error);
    });
}

function checkValidServiceWorker(swUrl: string, config?: Config) {
  fetch(swUrl, { headers: { 'Service-Worker': 'script' } })
    .then((response) => {
      const contentType = response.headers.get('content-type');
      if (response.status === 404 || (contentType != null && contentType.indexOf('javascript') === -1)) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      console.log('No internet connection found. App is running in offline mode.');
    });
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error(error.message);
      });
  }
}
