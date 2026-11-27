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

