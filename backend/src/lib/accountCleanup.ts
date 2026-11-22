import { and, eq, gte, inArray, ne, or, sql } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '../schema';
import { deletePrivate } from './s3';
import { log } from '../config';

/**
 * Removes the listings belonging to a user, whether they were created under the user's own id
 * or under one of their provider rows.
 *
 * `listings.provider_id` is plain text with no foreign key  it holds a user id for
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
 * Removes the KYC documents a user uploaded  the objects, not just the rows.
 *
 * `kyc_documents` cascades from `providers`, so deleting an account already took the rows away.
 * Nothing took the FILES. Those live in the private bucket under `file_key`, which no database
 * cascade can reach, so every identity document ever uploaded outlived the account that
 * uploaded it  the one category of data where that matters most.
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

/**
 * Bookings that must not vanish when a listing or an account is deleted (QA report BUG-03).
 *
 * `bookings.listing_id` and `bookings.user_id` cascade, so deleting a listing used to delete
 * every guest's booking on it without a word, and they disappeared from My Trips. A request
 * still waiting on the host, a booking the host accepted, and a confirmed booking whose last day
 * has not passed are all promises someone is relying on, so a delete is refused while any exist.
 * Confirmed bookings with no date are complete once confirmed, so they do not hold a delete up.
 *
 * `excludeUserId` leaves out the deleter's own bookings as a guest on their own listing.
 */
export async function openBookingsFor(
  where: { listingIds?: string[]; guestUserId?: string },
  excludeUserId?: string
): Promise<number> {
  const scope = [];
  if (where.listingIds?.length) scope.push(inArray(schema.bookings.listingId, where.listingIds));
  if (where.guestUserId) scope.push(eq(schema.bookings.userId, where.guestUserId));
  if (!scope.length) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.select({ id: schema.bookings.id }).from(schema.bookings).where(and(
    scope.length === 1 ? scope[0] : or(...scope),
    or(
      inArray(schema.bookings.status, ['pending_payment', 'accepted']),
      and(
        eq(schema.bookings.status, 'confirmed'),
        gte(sql`substr(coalesce(${schema.bookings.checkOut}, ${schema.bookings.checkIn}), 1, 10)`, today),
      ),
    ),
    ...(excludeUserId ? [ne(schema.bookings.userId, excludeUserId)] : []),
  ));
  return rows.length;
}

/** Every listing a user owns, directly or through one of their provider rows. */
export async function listingIdsOwnedBy(userId: string): Promise<string[]> {
  const providerRows = await db.select({ id: schema.providers.id })
    .from(schema.providers)
    .where(eq(schema.providers.userId, userId));
  const ownerIds = [userId, ...providerRows.map(p => p.id)];
  const rows = await db.select({ id: schema.listings.id })
    .from(schema.listings)
    .where(inArray(schema.listings.providerId, ownerIds));
  return rows.map(r => r.id);
}

/**
 * The one account that payment records of deleted accounts are filed under (QA report BUG-03).
 *
 * `payments.user_id` cascades off `users`, so deleting an account used to delete its payment
 * rows too: the GST-relevant records and the refund trail that tax rules expect us to keep. The
 * rows are moved here instead. They keep the amount, GST breakup, order and gateway ids and the
 * refund trail, but no longer point at the person, so the account itself is still deleted.
 * The placeholder has no usable phone or password, so nobody can sign in as it.
 */
export const DELETED_ACCOUNT_ID = 'deleted-account';

async function ensureDeletedAccount(tx: any): Promise<void> {
  await tx.insert(schema.users).values({
    id: DELETED_ACCOUNT_ID,
    phone: DELETED_ACCOUNT_ID,
    name: 'Deleted account',
    role: 'tourist',
    providerPaid: false,
    createdAt: new Date().toISOString(),
  }).onConflictDoNothing();
}

/**
 * Deletes an account the safe way (QA report BUG-03). Used by DELETE /users/me and the admin
 * delete.
 *
 * - Refused (returns `{ blocked }`) while the person has open or upcoming bookings as a guest, or
 *   other guests have them on the person's listings, unless `force` (admins only).
 * - Payment records are kept under DELETED_ACCOUNT_ID, not deleted.
 * - Every database step runs in one transaction, so a failure part-way leaves the account whole
 *   instead of half-deleted. KYC files in storage are removed only after it commits.
 */
export async function deleteAccount(
  uid: string,
  { force = false }: { force?: boolean } = {}
): Promise<{ deleted: true } | { blocked: { asGuest: number; onListings: number } }> {
  const listingIds = await listingIdsOwnedBy(uid);
  if (!force) {
    const asGuest = await openBookingsFor({ guestUserId: uid });
    const onListings = await openBookingsFor({ listingIds }, uid);
    if (asGuest || onListings) return { blocked: { asGuest, onListings } };
  }

  // Collected before the provider rows go: kyc_documents cascades off them, and once they are
  // gone there is no way left to find the identity documents those rows point at in storage.
  const providerRows = await db.select({ id: schema.providers.id })
    .from(schema.providers).where(eq(schema.providers.userId, uid));
  const kycKeys = providerRows.length
    ? (await db.select({ fileKey: schema.kycDocuments.fileKey }).from(schema.kycDocuments)
      .where(inArray(schema.kycDocuments.providerId, providerRows.map(p => p.id)))).map(d => d.fileKey)
    : [];
  const [user] = await db.select({ phone: schema.users.phone }).from(schema.users)
    .where(eq(schema.users.id, uid)).limit(1);

  await db.transaction(async (tx) => {
    const [hasPayments] = await tx.select({ id: schema.payments.id }).from(schema.payments)
      .where(eq(schema.payments.userId, uid)).limit(1);
    if (hasPayments) {
      await ensureDeletedAccount(tx);
      await tx.update(schema.payments).set({ userId: DELETED_ACCOUNT_ID }).where(eq(schema.payments.userId, uid));
    }
    if (user) await tx.delete(schema.otps).where(eq(schema.otps.phone, user.phone));
    // bookings/reviews/favourites hang off listings with ON DELETE CASCADE.
    if (listingIds.length) await tx.delete(schema.listings).where(inArray(schema.listings.id, listingIds));
    await tx.delete(schema.providers).where(eq(schema.providers.userId, uid));
    // Everything else that belongs to the account cascades off the user row.
    await tx.delete(schema.users).where(eq(schema.users.id, uid));
  });

  for (const key of kycKeys) {
    try {
      await deletePrivate(key);
    } catch (err) {
      // Logged, not thrown: the account is already gone; an orphaned object can be swept later.
      log.error(`[accountCleanup] KYC object ${key} could not be deleted: ${(err as Error).message}`);
    }
  }
  return { deleted: true };
}

/** The message a refused self-service delete shows. */
export function blockedDeleteDetail(b: { asGuest: number; onListings: number }): string {
  const parts: string[] = [];
  if (b.asGuest) {
    parts.push(`you have ${b.asGuest} open or upcoming booking${b.asGuest === 1 ? '' : 's'} as a guest (cancel ${b.asGuest === 1 ? 'it' : 'them'} in My Trips)`);
  }
  if (b.onListings) {
    parts.push(`guests have ${b.onListings} open or upcoming booking${b.onListings === 1 ? '' : 's'} on your listings (decline or cancel ${b.onListings === 1 ? 'it' : 'them'} on your dashboard)`);
  }
  return `Your account cannot be deleted yet: ${parts.join(', and ')}. People are relying on these, so they have to be closed first.`;
}
