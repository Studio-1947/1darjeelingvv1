import { inArray } from 'drizzle-orm';
import { db, schema } from '../db';

/** Rating summary (count + 1-decimal average) per listing id, for the ids given. */
export async function ratingsForListings(listingIds: string[]): Promise<Map<string, { count: number; average: number }>> {
  const out = new Map<string, { count: number; average: number }>();
  if (listingIds.length === 0) return out;
  const rows = await db.select({ listingId: schema.reviews.listingId, rating: schema.reviews.rating })
    .from(schema.reviews)
    .where(inArray(schema.reviews.listingId, listingIds));
  const acc = new Map<string, { sum: number; count: number }>();
  for (const r of rows) {
    const a = acc.get(r.listingId) || { sum: 0, count: 0 };
    a.sum += r.rating;
    a.count += 1;
    acc.set(r.listingId, a);
  }
  for (const [id, a] of acc) {
    out.set(id, { count: a.count, average: Math.round((a.sum / a.count) * 10) / 10 });
  }
  return out;
}
