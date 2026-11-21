import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: false,
    env: {
      // Overridable so several suites can run side by side on their own databases (TEST_DATABASE_URL,
      // the same variable scripts/setup-test-db.ts reads). The default is unchanged.
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/one_darjeeling_test',
      PORT: '8001',
      JWT_SECRET: 'test_jwt_secret_do_not_use_in_prod',
      MOCK_PAYMENTS: 'true',
      APP_ENV: 'test',
      CORS_ORIGINS: '*',
      ADMIN_BOOTSTRAP_SECRET: 'test_bootstrap_secret',
      RAZORPAY_WEBHOOK_SECRET: 'test_webhook_secret',
      INTERAKT_WEBHOOK_SECRET: 'test_interakt_webhook_secret',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'test_admin_password',
      // TEMPORARY(legal-pause): both paused in production (config.ts); the suites that cover them run with them on, and
      // test/pausedFeatures.test.ts switches them off.
      HOME_DELIVERY: 'true',
      DONATIONS: 'true',
    },
    setupFiles: ['./test/setup.ts'],
  },
});
