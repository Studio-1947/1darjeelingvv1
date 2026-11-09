/**
 * Which stored files are still in use, for scripts/cleanup-orphan-storage.ts.
 *
 * The clean-up used to read three columns (listings.image, providers.images, users.avatar) and
 * call every other file an orphan. Gallery photos (listings.extras.images), host profile extras,
 * review and feed photos and promotion images live elsewhere, so on 2026-11-09 it deleted photos
 * that listings still showed. Now a file counts as in use when its name appears ANYWHERE in the
 * database: every row of every table is read as JSON text and searched. A new column that holds a
 * photo is covered without anyone remembering to add it here.
 *
 * Finding too many references only keeps a file; finding too few deletes one. So when in doubt
 * (a key with no file name) the file is treated as in use.
 */
import type { Client, PoolClient } from 'pg';

type Db = Pick<Client | PoolClient, 'query'>;

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** The storage keys from `keys` that some database row still mentions. */
export async function findReferencedKeys(db: Db, keys: string[]): Promise<Set<string>> {
  const used = new Set<string>();
  // File name -> the keys with that name ("a/b/x.jpg" and "x.jpg" are both found by "x.jpg").
  const byName = new Map<string, string[]>();
  for (const key of keys) {
    const name = key.split('/').pop() || '';
    if (name.length < 8) {
      used.add(key); // too short to search for safely; never delete it
      continue;
    }
    byName.set(name, [...(byName.get(name) || []), key]);
  }
  if (byName.size === 0) return used;

  const { rows: tables } = await db.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  for (const { table_name } of tables) {
    const { rows } = await db.query(`SELECT row_to_json(t)::text AS j FROM ${quoteIdent(table_name)} t`);
    for (const { j } of rows) {
      for (const [name, ks] of byName) {
        if (j.includes(name)) {
          ks.forEach((k) => used.add(k));
          byName.delete(name);
        }
      }
      if (byName.size === 0) return used;
    }
  }
  return used;
}
