/**
 * Rewrites photo addresses stored in the database so they point at the live site.
 *
 * uploadToMinIO() stores ABSOLUTE URLs (`${MINIO_PUBLIC_URL}/${MINIO_BUCKET}/<key>`), so a wrong
 * MINIO_PUBLIC_URL is baked into every photo uploaded while it was set. The live site had three
 * kinds of broken address (audit 2026-11-08), all repaired by default:
 *   https://1darjeeling.in/one-darjeeling/...                       retired domain (2026-09-07)
 *   https://1darjeeling.in,https://aaganerp.in/one-darjeeling/...   two origins glued by a comma
 *   https://aaganerp.in/...                                          typo of aanganerp.in
 * The rules are in src/lib/assetUrls.ts (tested in test/assetUrls.test.ts).
 *
 * Every column that can hold a photo address is covered: listings.image, listings.extras,
 * providers.images, providers.extras, users.avatar, reviews.photos, host_posts.photos,
 * promotions.image.
 *
 * SAFE BY DEFAULT: it only reports what it would change. Add --execute to write, in one
 * transaction. Idempotent: a second run finds nothing.
 *
 * Usage (from backend/, with DATABASE_URL set):
 *   npx tsx scripts/rewrite-prod-urls.ts                      # report only
 *   npx tsx scripts/rewrite-prod-urls.ts --execute            # repair
 *   npx tsx scripts/rewrite-prod-urls.ts --to https://aanganerp.in --from https://old.example --execute
 * --from adds an origin to the retired list; --to defaults to https://aanganerp.in.
 * --check also asks each repaired address over HTTP and reports the ones that do not load
 * (the file may never have reached this storage), without changing what is written.
 */
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { RETIRED_ASSET_ORIGINS, rewriteAssetUrls } from '../src/lib/assetUrls';

dotenv.config({ path: path.join(__dirname, '../.env') });

/** [table, column, is jsonb] */
const COLUMNS: Array<[string, string, boolean]> = [
  ['listings', 'image', false],
  ['listings', 'extras', true],
  ['providers', 'images', true],
  ['providers', 'extras', true],
  ['users', 'avatar', false],
  ['reviews', 'photos', true],
  ['host_posts', 'photos', true],
  ['promotions', 'image', false],
];

function parseArgs(argv: string[]) {
  const from = [...RETIRED_ASSET_ORIGINS];
  let to = 'https://aanganerp.in';
  let execute = false;
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from' && argv[i + 1]) from.push(argv[++i].trim().replace(/\/+$/, ''));
    else if (a === '--to' && argv[i + 1]) to = argv[++i].trim().replace(/\/+$/, '');
    else if (a === '--execute') execute = true;
    else if (a === '--check') check = true;
    else if (a === '--dry-run') execute = false; // the old flag; reporting is now the default
  }
  return { from: [...new Set(from)].filter((o) => o !== to), to, execute, check };
}

async function loads(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok;
  } catch {
    return false;
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('[rewrite-urls] DATABASE_URL is required.');
    process.exit(1);
  }
  const { from, to, execute, check } = parseArgs(process.argv.slice(2));
  console.log(`[rewrite-urls] ${execute ? 'EXECUTE: rows will be updated' : 'REPORT ONLY (add --execute to write)'}`);
  console.log(`[rewrite-urls] retired: ${from.join(', ')}`);
  console.log(`[rewrite-urls] live:    ${to}`);

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const likes = from.map((o) => `%${o}%`);
  const changes: Array<{ table: string; column: string; id: string; before: string; after: string; jsonb: boolean }> = [];

  try {
    for (const [table, column, jsonb] of COLUMNS) {
      const exists = await client.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
        [table, column],
      );
      if (!exists.rowCount) continue;
      const rows = await client.query(
        `SELECT id, ${column}::text AS value FROM ${table} WHERE ${column}::text ILIKE ANY($1::text[])`,
        [likes],
      );
      let n = 0;
      for (const row of rows.rows as Array<{ id: string; value: string }>) {
        const after = rewriteAssetUrls(row.value, from, to);
        if (after === row.value) continue;
        n++;
        changes.push({ table, column, id: row.id, before: row.value, after, jsonb });
      }
      console.log(`  ${table}.${column}: ${n} row(s) to repair`);
    }

    for (const c of changes.slice(0, 10)) {
      console.log(`\n  ${c.table}.${c.column} ${c.id}\n    from ${c.before.slice(0, 160)}\n    to   ${c.after.slice(0, 160)}`);
    }
    if (changes.length > 10) console.log(`\n  ...and ${changes.length - 10} more`);

    if (check) {
      const urls = [...new Set(changes.flatMap((c) => c.after.match(new RegExp(`${to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^"\\s,]+`, 'g')) || []))];
      let bad = 0;
      for (const u of urls) {
        if (!(await loads(u))) {
          bad++;
          if (bad <= 20) console.log(`  does not load: ${u}`);
        }
      }
      console.log(`\n[rewrite-urls] --check: ${urls.length - bad} of ${urls.length} repaired addresses load.`);
    }

    if (!execute) {
      console.log(`\n[rewrite-urls] ${changes.length} row(s) would change. Nothing was written.`);
      return;
    }

    await client.query('BEGIN');
    for (const c of changes) {
      await client.query(
        `UPDATE ${c.table} SET ${c.column} = $1${c.jsonb ? '::jsonb' : ''} WHERE id = $2`,
        [c.after, c.id],
      );
    }
    await client.query('COMMIT');
    console.log(`\n[rewrite-urls] Done: ${changes.length} row(s) updated.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[rewrite-urls] Failed, nothing was changed:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void main();
