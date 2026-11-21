/**
 * Finds and repairs photo addresses stored with a retired or broken origin (old domain
 * 1darjeeling.in, the "https://1darjeeling.in,https://aaganerp.in" mix-up, the aaganerp.in typo).
 * The address rules are in assetUrls.ts. Used by scripts/rewrite-prod-urls.ts and by the admin
 * panel's Clean-up tab (routes/adminMaintenance.ts).
 */
import type { Client, PoolClient } from 'pg';

import { RETIRED_ASSET_ORIGINS, rewriteAssetUrls } from './assetUrls';

type Db = Pick<Client | PoolClient, 'query'>;

export const LIVE_ORIGIN = 'https://aanganerp.in';

/** Every column that can hold a photo address: [table, column, is jsonb]. Fixed list, never user input. */
export const PHOTO_COLUMNS: Array<[string, string, boolean]> = [
  ['listings', 'image', false],
  ['listings', 'extras', true],
  ['providers', 'images', true],
  ['providers', 'extras', true],
  ['users', 'avatar', false],
  ['reviews', 'photos', true],
  ['host_posts', 'photos', true],
  ['promotions', 'image', false],
];

export interface PhotoChange {
  table: string;
  column: string;
  id: string;
  before: string;
  after: string;
  jsonb: boolean;
}

export async function findPhotoRepairs(
  db: Db,
  opts: { from?: string[]; to?: string } = {},
): Promise<PhotoChange[]> {
  const from = opts.from ?? RETIRED_ASSET_ORIGINS;
  const to = opts.to ?? LIVE_ORIGIN;
  const likes = from.map((o) => `%${o}%`);
  const changes: PhotoChange[] = [];
  for (const [table, column, jsonb] of PHOTO_COLUMNS) {
    const exists = await db.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
      [table, column],
    );
    if (!exists.rowCount) continue;
    const rows = await db.query(
      `SELECT id, ${column}::text AS value FROM ${table} WHERE ${column}::text ILIKE ANY($1::text[])`,
      [likes],
    );
    for (const row of rows.rows as Array<{ id: string; value: string }>) {
      const after = rewriteAssetUrls(row.value, from, to);
      if (after !== row.value) changes.push({ table, column, id: row.id, before: row.value, after, jsonb });
    }
  }
  return changes;
}

/** Writes the changes in one transaction. `client` must be one connection (not a pool). */
export async function applyPhotoRepairs(client: Db, changes: PhotoChange[]): Promise<number> {
  if (changes.length === 0) return 0;
  await client.query('BEGIN');
  try {
    for (const c of changes) {
      const known = PHOTO_COLUMNS.some(([t, col]) => t === c.table && col === c.column);
      if (!known) throw new Error(`Unknown photo column ${c.table}.${c.column}`);
      await client.query(`UPDATE ${c.table} SET ${c.column} = $1${c.jsonb ? '::jsonb' : ''} WHERE id = $2`, [c.after, c.id]);
    }
    await client.query('COMMIT');
    return changes.length;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

/** The repaired addresses on the live site that a change would produce. */
export function repairedUrls(changes: PhotoChange[], to = LIVE_ORIGIN): string[] {
  const re = new RegExp(`${to.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^"\\s,]+`, 'g');
  return [...new Set(changes.flatMap((c) => c.after.match(re) || []))];
}
