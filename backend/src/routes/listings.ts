import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { eq, or, and, ilike } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// ============ LISTINGS ============

// Get list of listings with filter
router.get('/', async (req: Request, res: Response) => {
  const type = req.query.type as string | undefined;
  const q = req.query.q as string | undefined;
  const limit = parseInt(req.query.limit as string) || 60;

  const conditions = [];
  if (type) {
    conditions.push(eq(schema.listings.type, type));
  }
  if (q) {
    conditions.push(
      or(
        ilike(schema.listings.title, `%${q}%`),
        ilike(schema.listings.description, `%${q}%`),
        ilike(schema.listings.location, `%${q}%`)
      )
    );
  }

  const items = await db.select()
    .from(schema.listings)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(limit);

  const itemsReturn = items.map(item => ({
    id: item.id,
    title: item.title,
    type: item.type,
    description: item.description,
    location: item.location,
    latitude: item.latitude,
    longitude: item.longitude,
    price: item.price,
    image: item.image,
    tags: item.tags,
    provider_id: item.providerId,
    extras: item.extras,
    created_at: item.createdAt
  }));

  res.json({ items: itemsReturn });
});

// Get single listing detail
router.get('/:id', async (req: Request, res: Response) => {
  const [item] = await db.select().from(schema.listings).where(eq(schema.listings.id, req.params.id as any)).limit(1);
  if (!item) {
    return res.status(404).json({ detail: 'Not found' });
  }

  const itemReturn = {
    id: item.id,
    title: item.title,
    type: item.type,
    description: item.description,
    location: item.location,
    latitude: item.latitude,
    longitude: item.longitude,
    price: item.price,
    image: item.image,
    tags: item.tags,
    provider_id: item.providerId,
    extras: item.extras,
    created_at: item.createdAt
  };

  res.json({ item: itemReturn });
});

// Create a new listing
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  const { title, type, description, location, latitude = null, longitude = null, price = 0, image = '', tags = [], provider_id, extras = {} } = req.body;
  if (!title || !type || !description || !location) {
    return res.status(400).json({ detail: 'Title, type, description and location are required' });
  }

  const listing = {
    id: uuidv4(),
    title,
    type,
    description,
    location,
    latitude: typeof latitude === 'number' ? latitude : null,
    longitude: typeof longitude === 'number' ? longitude : null,
    price,
    image,
    tags,
    providerId: provider_id || req.user.id,
    extras,
    createdAt: new Date().toISOString()
  };

  await db.insert(schema.listings).values(listing);

  const listingReturn = {
    id: listing.id,
    title: listing.title,
    type: listing.type,
    description: listing.description,
    location: listing.location,
    latitude: listing.latitude,
    longitude: listing.longitude,
    price: listing.price,
    image: listing.image,
    tags: listing.tags,
    provider_id: listing.providerId,
    extras: listing.extras,
    created_at: listing.createdAt
  };

  res.json({ item: listingReturn });
});

export default router;
