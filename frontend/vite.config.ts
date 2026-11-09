import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

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
    plugins: [react()],
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
