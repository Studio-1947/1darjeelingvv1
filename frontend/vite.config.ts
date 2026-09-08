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
  };
});

