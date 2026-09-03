import { inArray, eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../schema';
import { deletePrivate } from './s3';
import { log } from '../config';

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

/**
 * Removes the KYC documents a user uploaded — the objects, not just the rows.
 *
 * `kyc_documents` cascades from `providers`, so deleting an account already took the rows away.
 * Nothing took the FILES. Those live in the private bucket under `file_key`, which no database
 * cascade can reach, so every identity document ever uploaded outlived the account that
 * uploaded it — the one category of data where that matters most.
 *
 * Must run BEFORE the provider rows are deleted: the file keys are only reachable through them,
 * and once the cascade fires there is nothing left to look the objects up by.
 *
 * A storage failure is logged, not thrown. Half-deleting an account is worse than leaving an
 * orphaned object: the object can be swept up later, whereas a user whose deletion request
 * errored out still has an account they asked us to remove. Returns how many were deleted.
 */
export async function deleteKycFilesOwnedBy(userId: string): Promise<number> {
  const providerRows = await db.select({ id: schema.providers.id })
    .from(schema.providers)
    .where(eq(schema.providers.userId, userId));
  if (providerRows.length === 0) return 0;

  const docs = await db.select({ fileKey: schema.kycDocuments.fileKey })
    .from(schema.kycDocuments)
    .where(inArray(schema.kycDocuments.providerId, providerRows.map((p) => p.id)));

  let removed = 0;
  for (const doc of docs) {
    try {
      await deletePrivate(doc.fileKey);
      removed += 1;
    } catch (err) {
      log.error(`[accountCleanup] KYC object ${doc.fileKey} could not be deleted: ${(err as Error).message}`);
    }
  }
  return removed;
}
