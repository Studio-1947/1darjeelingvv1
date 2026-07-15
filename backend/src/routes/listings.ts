import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { eq, or, and, ilike } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import fs from 'fs';
import path from 'path';
import { uploadToMinIO } from '../lib/s3';

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
  const { title, type, description, location, price = 0, image = '', tags = [], provider_id, extras = {} } = req.body;
  if (!title || !type || !description || !location) {
    return res.status(400).json({ detail: 'Title, type, description and location are required' });
  }

  const listing = {
    id: uuidv4(),
    title,
    type,
    description,
    location,
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
    price: listing.price,
    image: listing.image,
    tags: listing.tags,
    provider_id: listing.providerId,
    extras: listing.extras,
    created_at: listing.createdAt
  };

  res.json({ item: listingReturn });
});

// Upload image (returns local server URL)
router.post('/upload', authenticateToken, async (req: Request, res: Response) => {
  const { file, filename } = req.body;
  if (!file || !filename) {
    return res.status(400).json({ detail: 'File payload and filename are required' });
  }

  try {
    // Decode base64 file data
    const base64Data = file.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');

    // Create unique key
    const ext = path.extname(filename) || '.jpg';
    const uniqueKey = `${uuidv4()}${ext}`;

    // Get Content-Type
    const match = file.match(/^data:(\w+\/\w+);base64,/);
    const contentType = match ? match[1] : 'image/jpeg';

    const fileUrl = await uploadToMinIO(buffer, uniqueKey, contentType);
    res.json({ url: fileUrl });
  } catch (err: any) {
    res.status(500).json({ detail: err.message || 'MinIO upload failed' });
  }
});

// Update listing details & image gallery
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, description, location, price, image, tags, extras } = req.body;

  const [existing] = await db.select().from(schema.listings).where(eq(schema.listings.id, id as any)).limit(1);
  if (!existing) {
    return res.status(404).json({ detail: 'Listing not found' });
  }

  // Verify ownership
  const [provider] = await db.select().from(schema.providers).where(eq(schema.providers.userId, req.user.id)).limit(1);
  const isOwner = existing.providerId === req.user.id || (provider && existing.providerId === provider.id);
  const isAdmin = req.user.role === 'admin';

  if (!isOwner && !isAdmin) {
    return res.status(403).json({ detail: 'Unauthorized to modify this listing' });
  }

  // Update listing fields dynamically
  const updatedFields: Partial<typeof existing> = {};
  if (title !== undefined) updatedFields.title = title;
  if (description !== undefined) updatedFields.description = description;
  if (location !== undefined) updatedFields.location = location;
  if (price !== undefined) updatedFields.price = Number(price) || 0;
  if (image !== undefined) updatedFields.image = image;
  if (tags !== undefined) updatedFields.tags = tags;
  if (extras !== undefined) updatedFields.extras = extras;

  await db.update(schema.listings).set(updatedFields).where(eq(schema.listings.id, id as any));

  // Fetch updated record
  const [updated] = await db.select().from(schema.listings).where(eq(schema.listings.id, id as any)).limit(1);

  const listingReturn = {
    id: updated.id,
    title: updated.title,
    type: updated.type,
    description: updated.description,
    location: updated.location,
    price: updated.price,
    image: updated.image,
    tags: updated.tags,
    provider_id: updated.providerId,
    extras: updated.extras,
    created_at: updated.createdAt
  };

  res.json({ item: listingReturn });
});

export default router;
