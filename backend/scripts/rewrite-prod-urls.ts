/**
 * Rewrites asset domain URLs stored in the PostgreSQL database from a source domain
 * (e.g. https://onedarjeeling.duckdns.org/) to a target domain (e.g. https://1darjeeling.in/).
 *
 * Safe & idempotent:
 * - Can be run with `--dry-run` to preview matches without mutating the database.
 * - Handles `listings.image`, `providers.images` (JSONB array), and `users.avatar`.
 *
 * Usage:
 *   npx tsx scripts/rewrite-prod-urls.ts --from https://onedarjeeling.duckdns.org --to https://1darjeeling.in [--dry-run]
 */
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('[rewrite-urls] ERROR: DATABASE_URL environment variable is required.');
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let fromDomain = 'https://onedarjeeling.duckdns.org';
  let toDomain = 'https://1darjeeling.in';
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) {
      fromDomain = args[i + 1].trim();
      i++;
    } else if (args[i] === '--to' && args[i + 1]) {
      toDomain = args[i + 1].trim();
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  // Strip trailing slashes for clean matching
  fromDomain = fromDomain.replace(/\/+$/, '');
  toDomain = toDomain.replace(/\/+$/, '');

  return { fromDomain, toDomain, dryRun };
}

async function main() {
  const { fromDomain, toDomain, dryRun } = parseArgs();

  console.log(`[rewrite-urls] Mode: ${dryRun ? 'DRY RUN (no database changes)' : 'LIVE EXECUTION'}`);
  console.log(`[rewrite-urls] Source domain: "${fromDomain}"`);
  console.log(`[rewrite-urls] Target domain: "${toDomain}"`);

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    // 1. Preview or Update `listings.image`
    const listingCheck = await client.query(
      `SELECT id, title, image FROM listings WHERE image LIKE $1`,
      [`${fromDomain}%`]
    );
    console.log(`\n[listings.image] Found ${listingCheck.rowCount} matching rows.`);
    for (const row of listingCheck.rows) {
      const updated = row.image.replace(fromDomain, toDomain);
      console.log(`  - Listing "${row.title}" (${row.id}):`);
      console.log(`      From: ${row.image}`);
      console.log(`      To:   ${updated}`);
    }

    // 2. Preview or Update `providers.images`
    const providerCheck = await client.query(
      `SELECT id, business_name as name, images FROM providers WHERE images::text LIKE $1`,
      [`%${fromDomain}%`]
    );
    console.log(`\n[providers.images] Found ${providerCheck.rowCount} matching rows.`);
    for (const row of providerCheck.rows) {
      console.log(`  - Provider "${row.name}" (${row.id})`);
    }

    // 3. Preview or Update `users.avatar`
    const userCheck = await client.query(
      `SELECT id, name, avatar FROM users WHERE avatar LIKE $1`,
      [`${fromDomain}%`]
    );
    console.log(`\n[users.avatar] Found ${userCheck.rowCount} matching rows.`);
    for (const row of userCheck.rows) {
      console.log(`  - User "${row.name}" (${row.id})`);
    }

    if (dryRun) {
      console.log('\n[rewrite-urls] Dry run complete. No changes were made to the database.');
      return;
    }

    // Execute SQL updates inside a single transaction
    await client.query('BEGIN');

    const listingRes = await client.query(
      `UPDATE listings SET image = replace(image, $1, $2) WHERE image LIKE $3`,
      [fromDomain, toDomain, `${fromDomain}%`]
    );

    const providerRes = await client.query(
      `UPDATE providers SET images = replace(images::text, $1, $2)::jsonb WHERE images::text LIKE $3`,
      [fromDomain, toDomain, `%${fromDomain}%`]
    );

    const userRes = await client.query(
      `UPDATE users SET avatar = replace(avatar, $1, $2) WHERE avatar LIKE $3`,
      [fromDomain, toDomain, `${fromDomain}%`]
    );

    await client.query('COMMIT');

    console.log('\n[rewrite-urls] SUCCESS: Database records updated successfully!');
    console.log(`  - Listings updated: ${listingRes.rowCount}`);
    console.log(`  - Providers updated: ${providerRes.rowCount}`);
    console.log(`  - Users updated: ${userRes.rowCount}`);

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[rewrite-urls] ERROR executing URL rewrite:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
