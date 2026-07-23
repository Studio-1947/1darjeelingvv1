import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { eq, desc, inArray, and, lt, gt } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { requireActiveSupport } from '../middleware/support';

const router = Router();

// ============ BOOKINGS ============

/**
 * @openapi
 * /bookings:
 *   post:
 *     summary: Create a booking for a listing
 *     description: Booking starts in status pending_payment; it's confirmed via the payments flow (/payments/order then /payments/mock/complete or /payments/verify).
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [listing_id, listing_type]
 *             properties:
 *               listing_id: { type: string }
 *               listing_type: { type: string }
 *               check_in: { type: string, description: "Required (and must precede check_out) when listing_type is homestay" }
 *               check_out: { type: string }
 *               guests: { type: integer, default: 1 }
 *               notes: { type: string }
 *     responses:
 *       200:
 *         description: Created booking
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 booking: { $ref: '#/components/schemas/Booking' }
 *       400:
 *         description: Missing/invalid fields (e.g. bad homestay date range)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       402:
 *         description: The caller's annual platform support fee is not active
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Listing not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: Homestay is already confirmed-booked for an overlapping date range
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// Create a booking
router.post('/', authenticateToken, requireActiveSupport, async (req: Request, res: Response) => {
  const { listing_id, listing_type, check_in, check_out, guests = 1, notes } = req.body;

  if (!listing_id || !listing_type) {
    return res.status(400).json({ detail: 'Listing ID and type are required' });
  }

  if (listing_type === 'homestay') {
    if (!check_in || !check_out) {
      return res.status(400).json({ detail: 'Check-in and check-out dates are required for homestays' });
    }
    if (new Date(check_out) <= new Date(check_in)) {
      return res.status(400).json({ detail: 'Check-out date must be after check-in date' });
    }
  }

  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, listing_id)).limit(1);
  if (!listing) {
    return res.status(404).json({ detail: 'Listing not found' });
  }

  if (listing_type === 'homestay') {
    const overlapping = await db.select().from(schema.bookings).where(
      and(
        eq(schema.bookings.listingId, listing_id),
        eq(schema.bookings.status, 'confirmed'),
        lt(schema.bookings.checkIn, check_out),
        gt(schema.bookings.checkOut, check_in)
      )
    ).limit(1);
    if (overlapping.length > 0) {
      return res.status(409).json({ detail: 'These dates are already booked for this homestay' });
    }
  }

  const booking = {
    id: uuidv4(),
    userId: req.user.id,
    listingId: listing_id,
    listingType: listing_type,
    listingTitle: listing.title,
    checkIn: check_in || null,
    checkOut: check_out || null,
    guests,
    notes,
    status: 'pending_payment',
    createdAt: new Date().toISOString(),
    confirmedAt: null
  };

  await db.insert(schema.bookings).values(booking);

  const bookingReturn = {
    id: booking.id,
    user_id: booking.userId,
    listing_id: booking.listingId,
    listing_type: booking.listingType,
    listing_title: booking.listingTitle,
    check_in: booking.checkIn,
    check_out: booking.checkOut,
    guests: booking.guests,
    notes: booking.notes,
    status: booking.status,
    created_at: booking.createdAt
  };

  res.json({ booking: bookingReturn });
});

/**
 * @openapi
 * /bookings/me:
 *   get:
 *     summary: Get the current user's own bookings (as a tourist), enriched with listing summaries
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The user's bookings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Booking'
 *                       - type: object
 *                         properties:
 *                           listing:
 *                             oneOf:
 *                               - type: object
 *                               - type: 'null'
 */
// Get user's own bookings
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  const bookings = await db.select()
    .from(schema.bookings)
    .where(eq(schema.bookings.userId, req.user.id))
    .orderBy(desc(schema.bookings.createdAt));

  const enrichedBookings = [];
  for (const b of bookings) {
    const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, b.listingId)).limit(1);
    
    let listingReturn = null;
    if (listing) {
      listingReturn = {
        id: listing.id,
        title: listing.title,
        type: listing.type,
        image: listing.image,
        location: listing.location,
        price: listing.price
      };
    }

    enrichedBookings.push({
      id: b.id,
      user_id: b.userId,
      listing_id: b.listingId,
      listing_type: b.listingType,
      listing_title: b.listingTitle,
      check_in: b.checkIn,
      check_out: b.checkOut,
      guests: b.guests,
      notes: b.notes,
      status: b.status,
      created_at: b.createdAt,
      confirmed_at: b.confirmedAt,
      listing: listingReturn
    });
  }

  res.json({ items: enrichedBookings });
});

/**
 * @openapi
 * /bookings/provider:
 *   get:
 *     summary: Get bookings received by the current user's provider listings, with stats and revenue
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Provider bookings, listings, and aggregate stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     allOf:
 *                       - $ref: '#/components/schemas/Booking'
 *                       - type: object
 *                         properties:
 *                           customer: { type: object, nullable: true }
 *                           listing: { type: object, nullable: true }
 *                 stats:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     confirmed: { type: integer }
 *                     pending: { type: integer }
 *                     revenue: { type: integer }
 *                 listings:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Listing' }
 */
// Get provider's bookings
router.get('/provider', authenticateToken, async (req: Request, res: Response) => {
  const providersList = await db.select().from(schema.providers).where(eq(schema.providers.userId, req.user.id));
  const provider = providersList.find(p => p.status === 'active') || providersList[0];
  const possibleProviderIds = [req.user.id];
  if (provider) {
    possibleProviderIds.push(provider.id);
  }

  const myListings = await db.select()
    .from(schema.listings)
    .where(inArray(schema.listings.providerId, possibleProviderIds));

  const listingsMap = myListings.map(l => ({
    id: l.id,
    title: l.title,
    type: l.type,
    description: l.description,
    location: l.location,
    price: l.price,
    image: l.image,
    tags: l.tags,
    provider_id: l.providerId,
    extras: l.extras,
    created_at: l.createdAt
  }));

  const listingIds = myListings.map(l => l.id);
  if (listingIds.length === 0) {
    return res.json({
      items: [],
      stats: { total: 0, confirmed: 0, pending: 0, revenue: 0 },
      listings: []
    });
  }

  const bookings = await db.select()
    .from(schema.bookings)
    .where(inArray(schema.bookings.listingId, listingIds))
    .orderBy(desc(schema.bookings.createdAt));

  const enrichedBookings = [];
  for (const b of bookings) {
    const [customer] = await db.select().from(schema.users).where(eq(schema.users.id, b.userId)).limit(1);
    const listingMatch = listingsMap.find(l => l.id === b.listingId) || null;
    enrichedBookings.push({
      id: b.id,
      user_id: b.userId,
      listing_id: b.listingId,
      listing_type: b.listingType,
      listing_title: b.listingTitle,
      check_in: b.checkIn,
      check_out: b.checkOut,
      guests: b.guests,
      notes: b.notes,
      status: b.status,
      created_at: b.createdAt,
      confirmed_at: b.confirmedAt,
      customer: customer ? { name: customer.name, phone: customer.phone } : null,
      listing: listingMatch
    });
  }

  const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
  let revenue = 0;
  for (const b of confirmedBookings) {
    const listing = listingsMap.find(l => l.id === b.listingId);
    if (listing) {
      revenue += listing.price;
    }
  }

  const stats = {
    total: bookings.length,
    confirmed: confirmedBookings.length,
    pending: bookings.filter(b => b.status === 'pending_payment').length,
    revenue: revenue
  };

  res.json({
    items: enrichedBookings,
    stats: stats,
    listings: listingsMap
  });
});

/**
 * @openapi
 * /bookings/{id}/cancel:
 *   patch:
 *     summary: Cancel a booking (by the traveller who made it, the provider who owns the listing, or an admin)
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: The cancelled booking (idempotent if already cancelled) }
 *       403: { description: Caller may not cancel this booking }
 *       404: { description: Booking not found }
 */
// Cancel a booking. A traveller can cancel their own; a provider can decline/cancel one on a
// listing they own; an admin can cancel any. Only ever transitions to 'cancelled' (no un-cancel).
router.patch('/:id/cancel', authenticateToken, async (req: Request, res: Response) => {
  const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, req.params.id as any)).limit(1);
  if (!booking) return res.status(404).json({ detail: 'Booking not found' });

  let allowed = booking.userId === req.user.id || req.user.role === 'admin';
  if (!allowed) {
    // Provider path: the listing's providerId can be a provider id or a bare user id (admin-created
    // listings), so accept either the caller's user id or any of their provider ids.
    const [listing] = await db.select({ providerId: schema.listings.providerId })
      .from(schema.listings).where(eq(schema.listings.id, booking.listingId)).limit(1);
    if (listing) {
      const providersList = await db.select({ id: schema.providers.id })
        .from(schema.providers).where(eq(schema.providers.userId, req.user.id));
      const ownIds = new Set<string>([req.user.id, ...providersList.map(p => p.id)]);
      allowed = ownIds.has(listing.providerId);
    }
  }
  if (!allowed) return res.status(403).json({ detail: 'You do not have permission to cancel this booking' });

  const shape = (b: typeof schema.bookings.$inferSelect) => ({
    id: b.id,
    user_id: b.userId,
    listing_id: b.listingId,
    listing_type: b.listingType,
    listing_title: b.listingTitle,
    check_in: b.checkIn,
    check_out: b.checkOut,
    guests: b.guests,
    notes: b.notes,
    status: b.status,
    created_at: b.createdAt,
    confirmed_at: b.confirmedAt,
  });

  // Idempotent: cancelling an already-cancelled booking just echoes it back.
  if (booking.status === 'cancelled') return res.json({ booking: shape(booking) });

  const [updated] = await db.update(schema.bookings)
    .set({ status: 'cancelled' })
    .where(eq(schema.bookings.id, booking.id))
    .returning();
  res.json({ booking: shape(updated) });
});

export default router;
