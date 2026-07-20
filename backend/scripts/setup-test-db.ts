/**
 * Creates the isolated test database and syncs the schema into it.
 *
 * The suite talks to `one_darjeeling_test` (see vitest.config.ts) — a separate database from the
 * dev one, because test setup TRUNCATEs every table between tests. Previously this database had
 * to be created by hand and nothing said so, which meant `npm test` failed on a fresh clone and
 * could not run in CI at all.
 *
 * Uses `drizzle-kit migrate` — the exact command production runs (backend/Dockerfile) — rather
 * than `push`. That difference matters: push builds the schema straight from schema.ts, so a
 * developer who edits schema.ts and forgets `npm run db:generate` would still get a green suite
 * while production came up missing the column. Migrating here means the tests run against
 * precisely what the migrations produce, and a forgotten migration fails locally and in CI.
 *
 * Safe to re-run: creating an existing database is a no-op, and migrate skips applied migrations.
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

  console.log('[test-db] applying migrations (same path as production)...');
  execFileSync('npx', ['drizzle-kit', 'migrate'], {
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
