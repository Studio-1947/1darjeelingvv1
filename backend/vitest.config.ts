import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: false,
    env: {
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/one_darjeeling_test',
      PORT: '8001',
      JWT_SECRET: 'test_jwt_secret_do_not_use_in_prod',
      MOCK_PAYMENTS: 'true',
      APP_ENV: 'test',
      CORS_ORIGINS: '*',
      ADMIN_BOOTSTRAP_SECRET: 'test_bootstrap_secret',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'test_admin_password',
    },
    setupFiles: ['./test/setup.ts'],
  },
});
