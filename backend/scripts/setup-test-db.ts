/**
 * Creates the isolated test database and syncs the schema into it.
 *
 * The suite talks to `one_darjeeling_test` (see vitest.config.ts) — a separate database from the
 * dev one, because test setup TRUNCATEs every table between tests. Previously this database had
 * to be created by hand and nothing said so, which meant `npm test` failed on a fresh clone and
 * could not run in CI at all.
 *
 * Safe to re-run: creating an existing database is a no-op, and drizzle-kit push is idempotent.
 *
 *   npm run test:setup
 */
import { Client } from 'pg';
import { execFileSync } from 'child_process';
import * as path from 'path';

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres';
const TEST_DB = process.env.TEST_DB_NAME || 'one_darjeeling_test';
const TEST_URL = process.env.TEST_DATABASE_URL || `postgres://postgres:postgres@localhost:5432/${TEST_DB}`;

// Identifier, not a value — it can't be a bound parameter, so it's quoted defensively instead.
function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Refusing unsafe database name: ${name}`);
  }
  return `"${name}"`;
}

async function main() {
  const client = new Client({ connectionString: ADMIN_URL });
  await client.connect();

  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE ${quoteIdent(TEST_DB)}`);
      console.log(`[test-db] created ${TEST_DB}`);
    } else {
      console.log(`[test-db] ${TEST_DB} already exists`);
    }
  } finally {
    await client.end();
  }

  console.log('[test-db] syncing schema via drizzle-kit push...');
  execFileSync('npx', ['drizzle-kit', 'push', '--force'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  console.log('[test-db] ready');
}

main().catch((err) => {
  console.error('[test-db] setup failed:', err?.message || err);
  process.exit(1);
});
