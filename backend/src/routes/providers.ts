import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';

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
 *               business_type: { type: string, enum: [homestay, driver, shop, cafe, event, spot, biodiversity] }
 *               description: { type: string }
 *               location: { type: string }
 *               contact_phone: { type: string }
 *               price_from: { type: integer, default: 0 }
 *               images: { type: array, items: { type: string } }
 *               extras: { type: object }
 *     responses:
 *       200:
 *         description: Provider profile created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 provider: { $ref: '#/components/schemas/Provider' }
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// Register/Onboard a provider
router.post('/onboard', authenticateToken, async (req: Request, res: Response) => {
  const { business_name, business_type, description, location, contact_phone, price_from = 0, images = [], extras = {} } = req.body;

  if (!business_name || !business_name.trim() || !business_type || !description || !description.trim() || !location || !location.trim() || !contact_phone || !contact_phone.trim()) {
    return res.status(400).json({ detail: 'Business name, type, description, location, and contact phone are required' });
  }

  const provider = {
    id: uuidv4(),
    userId: req.user.id,
    businessName: business_name,
    businessType: business_type,
    description,
    location,
    contactPhone: contact_phone,
    priceFrom: price_from,
    images: images,
    extras: extras,
    status: 'pending_payment',
    createdAt: new Date().toISOString(),
    activatedAt: null
  };

  await db.insert(schema.providers).values(provider);
  await db.update(schema.users).set({ role: 'provider' }).where(eq(schema.users.id, req.user.id));

  const providerReturn = {
    id: provider.id,
    user_id: provider.userId,
    business_name: provider.businessName,
    business_type: provider.businessType,
    description: provider.description,
    location: provider.location,
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
