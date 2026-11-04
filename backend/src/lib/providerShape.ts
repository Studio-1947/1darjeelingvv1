import { schema } from '../db';
import { isHostApprovalPending, isHostPlanLive } from './hostPlan';

// The DB rows are camelCase (drizzle), but every response the frontend reads is snake_case 
// see providers.ts / bookings.ts. The confirmation record has to follow the same convention or
// the success modal silently renders `undefined` for every renamed column.
export function serializeProvider(p: typeof schema.providers.$inferSelect) {
  return {
    id: p.id,
    user_id: p.userId,
    business_name: p.businessName,
    business_type: p.businessType,
    slug: p.slug,
    page_path: p.slug ? `/${p.businessType}/${p.slug}` : null,
    // Member: paid plan live. Verified: documents checked (blue tick). See lib/hostPage.ts.
    badges: { member: p.status === 'active' && isHostPlanLive(p), verified: p.status === 'active' && p.kycStatus === 'verified' },
    description: p.description,
    location: p.location,
    latitude: p.latitude,
    longitude: p.longitude,
    contact_phone: p.contactPhone,
    price_from: p.priceFrom,
    images: p.images,
    extras: p.extras,
    status: p.status,
    plan_expires_at: p.planExpiresAt,
    plan_active: isHostPlanLive(p),
    kyc_status: p.kycStatus,
    approval_pending: isHostApprovalPending(p),
    created_at: p.createdAt,
    activated_at: p.activatedAt,
  };
}
