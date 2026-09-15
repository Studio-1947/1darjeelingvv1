import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@sentry')) return 'vendor-monitoring';
          if (id.includes('leaflet')) return 'vendor-maps';
          if (id.includes('framer-motion') || id.includes('gsap') || id.includes('/ogl/')) return 'vendor-motion';
          if (id.includes('@radix-ui') || id.includes('lucide-react')) return 'vendor-ui';
          return undefined;
        },
      },
    },
  },
});
