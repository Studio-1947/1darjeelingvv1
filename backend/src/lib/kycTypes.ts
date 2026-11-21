import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { kycTypes } from './kycRequirements';

/** The kinds of business whose documents a provider sends: its own, plus its other listings' kinds. */
export async function kycTypesFor(provider: { id: string; businessType: string | null }): Promise<string[]> {
  const rows = await db.select({ type: schema.listings.type }).from(schema.listings).where(eq(schema.listings.providerId, provider.id));
  return kycTypes(provider.businessType, rows.map((r) => r.type));
}
