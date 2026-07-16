import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// ============ PROVIDER ONBOARDING ============

// Register/Onboard a provider
router.post('/onboard', authenticateToken, async (req: Request, res: Response) => {
  const { business_name, business_type, description, location, latitude = null, longitude = null, contact_phone, price_from = 0, images = [], extras = {} } = req.body;

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
    latitude: typeof latitude === 'number' ? latitude : null,
    longitude: typeof longitude === 'number' ? longitude : null,
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
