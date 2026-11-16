import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Plugin } from 'vite';

// A production build registers /service-worker.js, which serves the app cache-first. If that build
// once ran on this address (e.g. the Docker frontend on :3000), the old worker keeps serving the old
// app over the dev server: its chunks no longer exist, so the page stays white, and the browser can't
// update the worker because the dev server answers /service-worker.js with index.html. In dev only,
// answer it with a worker that clears its caches, unregisters itself and reloads the open tabs.
const devServiceWorkerKillSwitch = (): Plugin => ({
  name: 'dev-service-worker-kill-switch',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.split('?')[0].endsWith('/service-worker.js')) return next();
      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.end(`self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));`);
    });
  },
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendProxyTarget =
    env.VITE_BACKEND_PROXY_URL ||
    process.env.VITE_BACKEND_PROXY_URL ||
    env.REACT_APP_BACKEND_URL ||
    process.env.REACT_APP_BACKEND_URL ||
    'http://backend:8000';

  return {
    base: env.VITE_BASE_PATH || process.env.VITE_BASE_PATH || '/',
    plugins: [react(), devServiceWorkerKillSwitch()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: backendProxyTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'node',
      globals: true,
      // e2e/ holds Playwright browser tests (npm run test:e2e); vitest must not load them.
      exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    },
    build: {
      rolldownOptions: {
        output: {
          // Library groups. A group also takes in the modules its own modules import, so priority
          // decides who gets a shared one. React has to win: under the old manualChunks setup the
          // maps group (leaflet, which imports React) captured React's core, so every page
          // downloaded the 170 KB map library before it could draw.
          codeSplitting: {
            groups: [
              // Every page needs React and it changes far less often than the app, so returning
              // visitors keep it cached across deploys.
              { name: 'vendor-react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 50 },
              { name: 'vendor-monitoring', test: /[\\/]node_modules[\\/]@sentry/, priority: 20 },
              { name: 'vendor-maps', test: /[\\/]node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/, priority: 20 },
              { name: 'vendor-motion', test: /[\\/]node_modules[\\/](framer-motion|gsap|ogl|motion-dom|motion-utils)[\\/]/, priority: 20 },
              { name: 'vendor-ui', test: /[\\/]node_modules[\\/](@radix-ui|lucide-react)/, priority: 20 },
            ],
          },
        },
      },
    },
  };
});
