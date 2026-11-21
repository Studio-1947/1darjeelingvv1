import { eq } from 'drizzle-orm';

import { db, schema } from '../db';
import { hostAccessFor } from './hostAccess';
import { isSupportActive } from './support';

type Provider = typeof schema.providers.$inferSelect;

/**
 * Who may put something in the Feed. Anyone can read, react, comment and share; posting needs a
 * verified person:
 *  - a traveller is verified by the aangan pass ("Verified traveller", ₹1 a year);
 *  - a business is verified by its Verified tick (documents approved by the team).
 * A traveller may post only trip plans. A verified business may post trip plans and its own posts.
 */
export function isVerifiedBusiness(p: Pick<Provider, 'status' | 'kycStatus'> | null | undefined): boolean {
  return !!p && p.status === 'active' && p.kycStatus === 'verified';
}

export type PlanPostRefusal = 'not_verified';

export async function planPostRights(userId: string): Promise<{ can: boolean; passActive: boolean; verifiedBusiness: boolean }> {
  const [u] = await db.select({ role: schema.users.role, supportExpiresAt: schema.users.supportExpiresAt })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const passActive = !!u && isSupportActive(u);
  const host = await hostAccessFor(userId);
  const verifiedBusiness = isVerifiedBusiness(host?.provider);
  return { can: passActive || verifiedBusiness, passActive, verifiedBusiness };
}
