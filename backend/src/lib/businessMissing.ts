import { asc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { missingAcross, type MissingItem } from './hostProfile';

/**
 * What a business still has to fill in, over all of its listings (lib/hostProfile.ts missingAcross),
 * oldest listing first. The profile pages, the document upload gate and the admin list all read this.
 */
export async function businessMissing(provider: { id: string; businessType: string; extras: unknown }): Promise<MissingItem[]> {
  const listings = await db.select({ id: schema.listings.id, title: schema.listings.title, type: schema.listings.type, extras: schema.listings.extras })
    .from(schema.listings).where(eq(schema.listings.providerId, provider.id)).orderBy(asc(schema.listings.createdAt), asc(schema.listings.id));
  return missingAcross(provider.businessType, provider.extras as Record<string, any>, listings);
}

/**
 * What holds back sending documents for approval: the business-wide items (the host's name), and,
 * only while no listing is finished yet, the listings' own items. One finished listing of any kind
 * is enough to start verification; the others' items stay on the checklist (decision 2026-11-26).
 */
export function uploadBlockers(missing: readonly MissingItem[], listingIds: readonly string[]): MissingItem[] {
  const business = missing.filter((m) => !m.listing_id);
  const unfinished = new Set(missing.filter((m) => m.listing_id).map((m) => m.listing_id));
  const oneFinished = listingIds.some((id) => !unfinished.has(id));
  return listingIds.length && oneFinished ? business : [...missing];
}

/** uploadBlockers for a business, read from the database. */
export async function businessUploadBlockers(provider: { id: string; businessType: string; extras: unknown }): Promise<MissingItem[]> {
  const ids = (await db.select({ id: schema.listings.id }).from(schema.listings).where(eq(schema.listings.providerId, provider.id))).map((r) => r.id);
  if (!ids.length) return businessMissing(provider);
  return uploadBlockers(await businessMissing(provider), ids);
}
