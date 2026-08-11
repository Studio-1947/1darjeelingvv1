/**
 * Identifies and removes placeholder / test listings from the database.
 * Safe & Idempotent:
 * - Defaults to DRY RUN mode (previews matching rows without deleting).
 * - Requires explicit `--execute` flag to delete test rows.
 *
 * Usage:
 *   npx tsx scripts/cleanup-test-data.ts [--execute]
 */
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('[cleanup-test-data] ERROR: DATABASE_URL environment variable is required.');
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  return { execute };
}

// Patterns used to identify test data
const TEST_PATTERNS = [
  '%admin test%',
  '%qeqwe%',
  '%test listing%',
  '%dummy listing%',
];

async function main() {
  const { execute } = parseArgs();
  console.log(`[cleanup-test-data] Mode: ${execute ? 'LIVE DELETION (--execute)' : 'DRY RUN (preview only)'}`);

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const matchingListings: Array<{ id: string; title: string; description: string | null }> = [];

    for (const pattern of TEST_PATTERNS) {
      const res = await client.query(
        `SELECT id, title, description FROM listings WHERE LOWER(title) LIKE $1 OR LOWER(description) LIKE $1`,
        [pattern.toLowerCase()]
      );
      for (const row of res.rows) {
        if (!matchingListings.some(m => m.id === row.id)) {
          matchingListings.push(row);
        }
      }
    }

    console.log(`\n[cleanup-test-data] Found ${matchingListings.length} test listing(s):`);
    for (const item of matchingListings) {
      console.log(`  - Listing ID: ${item.id}`);
      console.log(`    Title:       "${item.title}"`);
      console.log(`    Description: "${item.description || ''}"`);
    }

    if (matchingListings.length === 0) {
      console.log('\n[cleanup-test-data] No test listings found in the database.');
      return;
    }

    if (!execute) {
      console.log('\n[cleanup-test-data] Dry run complete. To perform real deletions, re-run with: npx tsx scripts/cleanup-test-data.ts --execute');
      return;
    }

    await client.query('BEGIN');
    const idsToDelete = matchingListings.map(m => m.id);
    const deleteRes = await client.query(
      `DELETE FROM listings WHERE id = ANY($1::text[])`,
      [idsToDelete]
    );
    await client.query('COMMIT');

    console.log(`\n[cleanup-test-data] SUCCESS: Deleted ${deleteRes.rowCount} test listing(s) from the database.`);

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[cleanup-test-data] ERROR executing cleanup:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
