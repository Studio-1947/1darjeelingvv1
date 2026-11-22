import { asc, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { phoneKey } from './phone';

/**
 * The account for a phone number, however it was typed (QA report BUG-06).
 *
 * `users.phone` holds whatever was typed at signup, so "9800012345", "+919800012345" and
 * "98000 12345" are three different strings for one person. Sign-in used to look up the exact
 * string only, so typing the number a second way created a second, empty account and split
 * bookings and host status across the two.
 *
 * The exact match is tried first, so every existing account still resolves the way it always
 * has. Only when that misses do we fall back to the canonical number (lib/phone.ts phoneKey):
 * the stored numbers whose digits end the same way are fetched and compared under phoneKey, and
 * the oldest match wins, because the oldest account is the one that holds the history.
 *
 * Stored numbers are NOT rewritten here. Merging accounts that are already split is a separate
 * data clean-up.
 */
export async function findUserByPhone(phone: string) {
  const [exact] = await db.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
  if (exact) return exact;

  const key = phoneKey(phone);
  if (!key) return undefined;

  // The last eight digits narrow the scan to a handful of rows; phoneKey makes the final call.
  const tail = key.slice(-8);
  const candidates = await db.select().from(schema.users)
    .where(sql`regexp_replace(${schema.users.phone}, '[^0-9]', '', 'g') LIKE ${'%' + tail}`)
    .orderBy(asc(schema.users.createdAt));
  return candidates.find((u) => phoneKey(u.phone) === key);
}
