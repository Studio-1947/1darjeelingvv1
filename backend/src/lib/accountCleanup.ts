import { inArray, eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../schema';

/**
 * Removes the listings belonging to a user, whether they were created under the user's own id
 * or under one of their provider rows.
 *
 * `listings.provider_id` is plain text with no foreign key — it holds a user id for
 * admin-created rows and a *provider* id for provider-created ones (see routes/listings.ts).
 * Deleting only `provider_id = <user id>` therefore missed every listing a provider had
 * actually published, leaving public, bookable rows pointing at an account that no longer
 * exists. There is no DB cascade that can do this for us, so both delete paths call this.
 *
 * Returns the ids of the listings that were removed.
 */
export async function deleteListingsOwnedBy(userId: string): Promise<string[]> {
  const providerRows = await db.select({ id: schema.providers.id })
    .from(schema.providers)
    .where(eq(schema.providers.userId, userId));

  const ownerIds = [userId, ...providerRows.map(p => p.id)];

  const listingRows = await db.select({ id: schema.listings.id })
    .from(schema.listings)
    .where(inArray(schema.listings.providerId, ownerIds));

  if (listingRows.length === 0) return [];

  const listingIds = listingRows.map(l => l.id);
  // bookings/reviews/favourites all reference listings with ON DELETE CASCADE, so removing the
  // listing row is enough to clear what hung off it.
  await db.delete(schema.listings).where(inArray(schema.listings.id, listingIds));
  return listingIds;
}
