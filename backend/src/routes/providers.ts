import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { KYC_REQUIREMENTS } from '../lib/kycRequirements';

const SELF_ONBOARDABLE_BUSINESS_TYPES = Object.keys(KYC_REQUIREMENTS);

const router = Router();

// ============ PROVIDER ONBOARDING ============

/**
 * @openapi
 * /providers/onboard:
 *   post:
 *     summary: Register/onboard the current user as a service provider
 *     description: Creates a provider profile with status pending_payment and promotes the user's role to "provider". Activation (and listing publication) happens after payment via /payments/mock/complete or /payments/verify.
 *     tags: [Providers]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [business_name, business_type, description, location, contact_phone]
 *             properties:
 *               business_name: { type: string }
 *               business_type: { type: string, enum: [homestay, driver, shop, cafe], description: "Self-onboardable types only — admin-seeded types (spot, event, biodiversity) are rejected here." }
 *               description: { type: string }
 *               location: { type: string }
 *               contact_phone: { type: string }
 *               price_from: { type: integer, default: 0 }
 *               images: { type: array, items: { type: string } }
 *               extras: { type: object }
 *     responses:
 *       200:
 *         description: Provider profile created, or (if the caller already had a pending_payment
 *           row) that same row updated in place with the newly submitted details — onboarding is
 *           idempotent for a user resuming after abandoning payment, so this can be a create or
 *           an update.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 provider: { $ref: '#/components/schemas/Provider' }
 *       400:
 *         description: Missing required fields, or business_type outside the self-onboardable set
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: Caller already has an active or suspended provider profile (a pending_payment
 *           profile is resumed instead of rejected — see the 200 response above)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// Register/Onboard a provider
router.post('/onboard', authenticateToken, async (req: Request, res: Response) => {
  const { business_name, business_type, description, location, latitude = null, longitude = null, contact_phone, price_from = 0, images = [], extras = {} } = req.body;

  if (!business_name || !business_name.trim() || !business_type || !description || !description.trim() || !location || !location.trim() || !contact_phone || !contact_phone.trim()) {
    return res.status(400).json({ detail: 'Business name, type, description, location, and contact phone are required' });
  }

  // business_type gates the KYC matrix (requirementsFor). Anything outside the self-onboardable
  // set falls through to requirementsFor() returning [], which awards the full KYC weight for
  // free and silently renders an empty KYC checklist — so validate against the same matrix.
  if (!SELF_ONBOARDABLE_BUSINESS_TYPES.includes(business_type)) {
    return res.status(400).json({
      detail: `business_type must be one of: ${SELF_ONBOARDABLE_BUSINESS_TYPES.join(', ')}`,
    });
  }

  // A DB-level unique index on providers.user_id (see drizzle/0005) means each user has at most
  // one provider row, ever — enforced by Postgres, not just this read-then-write check. That
  // collapses what to do with an existing row to three cases:
  //   - pending_payment: the caller onboarded but never finished paying. Rejecting this with 409
  //     used to strand them — the frontend only creates a payment order from a *successful*
  //     onboard response, so there was no way back in. Instead, treat this as a resume: update
  //     the row in place with the newly submitted details and return 200 in the normal shape, so
  //     the existing frontend flow proceeds straight to creating the payment order.
  //   - active: a real second onboard attempt. Genuinely conflicting — 409.
  //   - suspended: an admin pulled this provider. Also conflicting, but with a distinct message
  //     since "onboard again" is not a fix here.
  //   - anything else (shouldn't occur, but not trusted to be exhaustive): treated as
  //     conflicting rather than silently allowed through as a fresh insert would attempt (and
  //     the unique index would then reject anyway).
  const [existing] = await db.select().from(schema.providers).where(eq(schema.providers.userId, req.user.id)).limit(1);

  if (existing && existing.status === 'active') {
    return res.status(409).json({ detail: 'You already have a provider profile. Only one provider profile is allowed per user.' });
  }
  if (existing && existing.status === 'suspended') {
    return res.status(409).json({ detail: 'Your provider profile has been suspended. Contact support to resolve this before onboarding again.' });
  }
  if (existing && existing.status !== 'pending_payment') {
    return res.status(409).json({ detail: 'You already have a provider profile. Only one provider profile is allowed per user.' });
  }

  const normalizedLatitude = typeof latitude === 'number' ? latitude : null;
  const normalizedLongitude = typeof longitude === 'number' ? longitude : null;

  let provider: typeof schema.providers.$inferSelect;
  if (existing) {
    // Resume: update the caller's own pending_payment row in place rather than creating a
    // second one (which the unique index would reject anyway).
    const [updated] = await db.update(schema.providers)
      .set({
        businessName: business_name,
        businessType: business_type,
        description,
        location,
        latitude: normalizedLatitude,
        longitude: normalizedLongitude,
        contactPhone: contact_phone,
        priceFrom: price_from,
        images,
        extras,
      })
      .where(eq(schema.providers.id, existing.id))
      .returning();
    provider = updated;
  } else {
    const [inserted] = await db.insert(schema.providers).values({
      id: uuidv4(),
      userId: req.user.id,
      businessName: business_name,
      businessType: business_type,
      description,
      location,
      latitude: normalizedLatitude,
      longitude: normalizedLongitude,
      contactPhone: contact_phone,
      priceFrom: price_from,
      images,
      extras,
      status: 'pending_payment',
      createdAt: new Date().toISOString(),
      activatedAt: null,
    }).returning();
    provider = inserted;
  }

  await db.update(schema.users).set({ role: 'provider' }).where(eq(schema.users.id, req.user.id));

  const providerReturn = {
    id: provider.id,
    user_id: provider.userId,
    business_name: provider.businessName,
    business_type: provider.businessType,
    description: provider.description,
    location: provider.location,
    latitude: provider.latitude,
    longitude: provider.longitude,
    contact_phone: provider.contactPhone,
    price_from: provider.priceFrom,
    images: provider.images,
    extras: provider.extras,
    status: provider.status,
    created_at: provider.createdAt
  };

  res.json({ provider: providerReturn });
});

/**
 * @openapi
 * /providers/me:
 *   get:
 *     summary: Get the current user's provider profile (active profile preferred over drafts)
 *     tags: [Providers]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The provider profile, or null if the user hasn't onboarded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 provider:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/Provider'
 *                     - type: 'null'
 */
// Retrieve current user's provider info
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  const providersList = await db.select().from(schema.providers).where(eq(schema.providers.userId, req.user.id));
  const provider = providersList.find(p => p.status === 'active') || providersList[0];
  if (!provider) {
    return res.json({ provider: null });
  }

  const providerReturn = {
    id: provider.id,
    user_id: provider.userId,
    business_name: provider.businessName,
    business_type: provider.businessType,
    description: provider.description,
    location: provider.location,
    latitude: provider.latitude,
    longitude: provider.longitude,
    contact_phone: provider.contactPhone,
    price_from: provider.priceFrom,
    images: provider.images,
    extras: provider.extras,
    status: provider.status,
    created_at: provider.createdAt,
    activated_at: provider.activatedAt
  };

  res.json({ provider: providerReturn });
});

export default router;
