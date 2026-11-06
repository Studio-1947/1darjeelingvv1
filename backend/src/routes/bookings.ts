import { Router, Request, Response } from 'express';
import { REQUEST_EXPIRY_HOURS } from '../config';
import { isCompleted } from '../lib/travellerDashboard';
import { guideWorksOn, isAvailable } from '../lib/hostProfile';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
// lt/gt/and moved out with the inline overlap query  the date comparison now lives in
// lib/bookingAvailability.ts, shared with the settlement path so the two cannot drift.
import { eq, desc, inArray, and, ne, lt, gt, gte, isNull, sql } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { isExemptFromSupport, isSupportActive } from '../lib/support';
import { flowBreakup, passBreakupFor } from '../lib/pricing';
import { findBlockingBooking, holdCutoff, isDateExclusive, lockBookingForChange, lockListingForBooking } from '../lib/bookingAvailability';
import { checkBookingRequest, hasStartDatePassed, MAX_OPEN_REQUESTS, PAST_DATE_DETAIL } from '../lib/bookingRules';
import { refundPaymentsFor } from '../lib/refunds';
import { notifyBookingAccepted, notifyBookingCancelled, notifyBookingRequest } from '../lib/notifications';
import { routeParam } from '../lib/routeParam';
import { isListingHostLapsed } from '../lib/hostPlan';
import { settleBookingConfirmation } from '../lib/bookingConfirmation';
import { addHostNotification, addInAppNotification } from '../lib/inApp';
import { releaseVoucherForBooking } from '../lib/vouchers';
import { requireTravellerMode } from '../middleware/mode';
import { bookingGrossAmount } from '../lib/bookingAmount';
import { ownListingIds } from '../lib/hostAccess';
import { approvalRequired, AWAITING_HOST_DETAIL, isAwaitingHost, realHostIds } from '../lib/bookingApproval';

/** Listing types guests contact directly rather than book. */
const CONTACT_ONLY_TYPES = new Set(['cafe', 'shop']);

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
 *             required: [listing_id]
 *             properties:
 *               listing_id: { type: string }
 *               listing_type: { type: string, description: "Ignored. The listing's own stored type decides every rule." }
 *               check_in: { type: string, description: "YYYY-MM-DD, today (India time) or later, up to 365 days ahead. Required for a homestay." }
 *               check_out: { type: string, description: "YYYY-MM-DD. Homestay: required, 1 to 30 nights after check_in." }
 *               guests: { type: integer, default: 1, description: "1 to the listing's max_guests" }
 *               notes: { type: string, maxLength: 1000 }
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
 *         description: >
 *           Missing/invalid fields, with a `code`: dates_required, bad_date, date_in_past,
 *           too_far_ahead, dates_order, stay_too_long, bad_guests, bad_notes.
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
 *         description: >
 *           Homestay is unavailable for the requested range  either already confirmed-booked, or
 *           held by another guest's checkout that is still inside its hold window.
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// Create a booking
// No pass needed to ask: without one, the ₹1 fee is paid when the booking is confirmed.
router.post('/', authenticateToken, requireTravellerMode, async (req: Request, res: Response) => {
  // `listing_type` from the body is deliberately not read: the stored listing's type decides every
  // rule below, so a request cannot pick a type with weaker checks.
  const { listing_id, voucher_id, route_name, services } = req.body || {};
  // A driver booking says which of the driver's routes it is for (host dashboard: km and places).
  const routeName = typeof route_name === 'string' && route_name.trim() ? route_name.trim().slice(0, 160) : null;

  if (!listing_id || typeof listing_id !== 'string') {
    return res.status(400).json({ detail: 'Listing ID is required' });
  }

  let validVoucher = null;
  if (voucher_id) {
    const [found] = await db
      .select()
      .from(schema.vouchers)
      .where(and(eq(schema.vouchers.id, voucher_id), eq(schema.vouchers.userId, req.user.id)))
      .limit(1);
    
    if (!found || found.status !== 'available') {
      return res.status(400).json({ detail: 'Voucher is invalid, unavailable, or does not belong to you' });
    }
    validVoucher = found;
  }

  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, listing_id)).limit(1);
  if (!listing) {
    return res.status(404).json({ detail: 'Listing not found' });
  }
  // Dates, guests and notes, judged against the stored listing (lib/bookingRules.ts).
  const checked = checkBookingRequest(listing, req.body || {});
  if (!checked.ok) return res.status(400).json({ detail: checked.detail, code: checked.code });
  const { checkIn: check_in, checkOut: check_out, guests, notes } = checked.value;

  // A host who switched availability off takes no bookings until they switch it back on.
  if (!isAvailable(listing.extras as Record<string, any>)) {
    return res.status(409).json({ detail: 'This host is not taking bookings right now.', code: 'unavailable' });
  }
  // A guide guides only in the seasons on their profile (board: "based on availability, confirm").
  if (listing.type === 'guide' && !guideWorksOn(listing.extras as Record<string, any>, check_in)) {
    const seasons = ((listing.extras as any)?.seasons as string[])
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
    return res.status(409).json({
      detail: `This guide only works in ${seasons}. Pick a date in one of those seasons.`,
      code: 'out_of_season',
    });
  }

  // Cafés and shops are contact-only: a guest rings them, nothing is reserved.
  if (CONTACT_ONLY_TYPES.has(listing.type)) {
    return res.status(400).json({ detail: 'This kind of listing is contact-only and cannot be booked' });
  }
  // A host whose yearly plan has lapsed is not taking bookings until they renew. Their listing is
  // already out of the public feed; this covers a guest holding an old link.
  if (await isListingHostLapsed(listing.providerId)) {
    return res.status(409).json({ detail: 'This listing is not taking bookings right now' });
  }
  // A guide booking names the services asked for; only the guide's own services count.
  const offered = new Set(
    (Array.isArray((listing.extras as any)?.services) ? (listing.extras as any).services : [])
      .map((s: any) => String(s?.name ?? '').trim()).filter(Boolean),
  );
  const chosenServices = listing.type === 'guide' && Array.isArray(services)
    ? [...new Set(services.map((s: unknown) => String(s ?? '').trim()).filter((s: string) => offered.has(s)))].slice(0, 20) as string[]
    : [];

  const booking = {
    id: uuidv4(),
    userId: req.user.id,
    listingId: listing_id,
    // Always the listing's own type: later steps (accept, confirm, amounts) read it from here.
    listingType: listing.type,
    listingTitle: listing.title,
    checkIn: check_in,
    checkOut: check_out,
    guests,
    notes,
    routeName,
    services: chosenServices,
    status: 'pending_payment',
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    voucherId: validVoucher ? validVoucher.id : null,
    appliedDiscount: validVoucher ? validVoucher.discountPercentage : null,
  };

  // The clash check, the insert and the voucher burn happen in one transaction under the listing
  // lock, so requests sent at the same instant (a double tap, or two guests) are judged one after
  // the other: the second sees the first and is refused instead of both being saved.
  // The voucher update also re-checks `available` itself and says whether it won; the loser rolls
  // back its booking row too.
  const VOUCHER_TAKEN = Symbol('voucher-taken');
  const CLASH = Symbol('clash');
  let clash: typeof schema.bookings.$inferSelect | null = null;
  const TOO_MANY = Symbol('too-many');
  try {
    await db.transaction(async (tx) => {
      // A request costs nothing until it is confirmed, but each one messages a host. Cap how many
      // one traveller can have waiting at once; the per-person lock makes requests sent at the same
      // instant (to different listings) count one after the other. Always taken before the listing
      // lock, and only here, so the two locks are never waited on in opposite orders.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`booking-requests:${req.user.id}`}))`);
      const waiting = await tx.select({ id: schema.bookings.id }).from(schema.bookings).where(and(
        eq(schema.bookings.userId, req.user.id),
        eq(schema.bookings.status, 'pending_payment'),
        gte(schema.bookings.createdAt, new Date(Date.now() - REQUEST_EXPIRY_HOURS * 60 * 60 * 1000).toISOString()),
      ));
      if (waiting.length >= MAX_OPEN_REQUESTS) throw TOO_MANY;
      await lockListingForBooking(tx, listing_id);
      if (isDateExclusive(listing.type) && check_in && check_out) {
        // Blocks on confirmed and accepted bookings AND on requests still inside their hold window.
        clash = await findBlockingBooking(tx, listing_id, check_in, check_out);
      } else {
        // Nothing reserves a driver's or guide's day, but the same person asking twice for the
        // same day within the hold window is a double tap, not a second trip.
        const [same] = await tx.select().from(schema.bookings).where(and(
          eq(schema.bookings.userId, req.user.id),
          eq(schema.bookings.listingId, listing_id),
          eq(schema.bookings.status, 'pending_payment'),
          check_in ? eq(schema.bookings.checkIn, check_in) : isNull(schema.bookings.checkIn),
          gte(schema.bookings.createdAt, holdCutoff()),
        )).limit(1);
        clash = same ?? null;
      }
      if (clash) throw CLASH;
      await tx.insert(schema.bookings).values(booking);
      if (validVoucher) {
        const claimed = await tx.update(schema.vouchers)
          .set({
            status: 'used',
            usedAt: new Date().toISOString(),
            usedOnBookingId: booking.id,
          })
          .where(and(eq(schema.vouchers.id, validVoucher.id), eq(schema.vouchers.status, 'available')))
          .returning({ id: schema.vouchers.id });
        if (claimed.length === 0) throw VOUCHER_TAKEN;
      }
    });
  } catch (err) {
    if (err === TOO_MANY) {
      return res.status(409).json({
        detail: `You have ${MAX_OPEN_REQUESTS} requests waiting for hosts. Wait for an answer, or cancel one in My Trips, then ask again.`,
        code: 'too_many_requests',
      });
    }
    if (err === CLASH && clash) {
      const taken = clash as typeof schema.bookings.$inferSelect;
      if (taken.userId === req.user.id) {
        return res.status(409).json({
          detail: 'You already asked for these dates. See it in My Trips.',
          code: 'already_requested',
          booking_id: taken.id,
        });
      }
      return res.status(409).json({ detail: 'These dates are already booked for this homestay', code: 'dates_taken' });
    }
    if (err === VOUCHER_TAKEN) {
      return res.status(400).json({ detail: 'Voucher is invalid, unavailable, or does not belong to you' });
    }
    throw err;
  }

  const awaitingHost = approvalRequired(listing.type, listing.providerId, await realHostIds([listing.providerId]));

  // The host's feed hears about the request straight away, even though it is unpaid, because the
  // provider inbox already lists it and they would otherwise see it there with no prompt.
  await addHostNotification(listing.providerId, {
    kind: 'booking_request',
    title: 'New booking request',
    body: awaitingHost
      ? `${req.user.name || 'A guest'} asked to book ${listing.title}. Accept or decline it on your dashboard.`
      : `${req.user.name || 'A guest'} asked about ${listing.title}.`,
    refId: booking.id,
  });
  // A request needs the host to act, so it also goes out by WhatsApp/email (not awaited: the
  // guest's answer must not wait on a gateway).
  if (awaitingHost && listing.providerId) {
    void notifyBookingRequest(booking, listing.providerId, req.user.name || 'A guest');
  }

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
    created_at: booking.createdAt,
    voucher_id: booking.voucherId,
    applied_discount: booking.appliedDiscount,
    // True when the host must accept before the guest can confirm (drivers, homestays, guides).
    awaiting_host: awaitingHost,
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

  const myReviews = await db.select({ listingId: schema.reviews.listingId }).from(schema.reviews)
    .where(eq(schema.reviews.userId, req.user.id));
  const reviewedListings = new Set(myReviews.map((r) => r.listingId));
  const myListingRows = bookings.length
    ? await db.select().from(schema.listings).where(inArray(schema.listings.id, [...new Set(bookings.map((b) => b.listingId))]))
    : [];
  const listingById = new Map(myListingRows.map((l) => [l.id, l]));
  const hosts = await realHostIds(myListingRows.map((l) => l.providerId));
  const enrichedBookings = [];
  for (const b of bookings) {
    const listing = listingById.get(b.listingId);

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
      accepted_at: b.acceptedAt,
      voucher_id: b.voucherId,
      applied_discount: b.appliedDiscount,
      route_name: b.routeName,
      services: b.services ?? [],
      // Board: "After completion -> Reviews + Suggestion for aangan, share your trip story".
      completed: isCompleted(b),
      reviewed: reviewedListings.has(b.listingId),
      // A request still waiting for the host's accept (drivers, homestays, guides).
      awaiting_host: b.status === 'pending_payment' && !!listing && approvalRequired(listing.type, listing.providerId, hosts),
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
  const possibleProviderIds = await ownListingIds(req.user.id);

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
      stats: { total: 0, confirmed: 0, pending: 0, accepted: 0, revenue: 0 },
      listings: []
    });
  }

  const bookings = await db.select()
    .from(schema.bookings)
    .where(inArray(schema.bookings.listingId, listingIds))
    .orderBy(desc(schema.bookings.createdAt));

  const guestIds = [...new Set(bookings.map(b => b.userId))];
  const guests = guestIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, guestIds))
    : [];
  const guestById = new Map(guests.map(g => [g.id, g]));
  const hosts = await realHostIds(myListings.map((l) => l.providerId));

  const enrichedBookings = [];
  for (const b of bookings) {
    const customer = guestById.get(b.userId);
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
      accepted_at: b.acceptedAt,
      voucher_id: b.voucherId,
      applied_discount: b.appliedDiscount,
      route_name: b.routeName,
      services: b.services ?? [],
      completed: isCompleted(b),
      // A request this host has to accept or decline.
      awaiting_host: b.status === 'pending_payment' && !!listingMatch && approvalRequired(listingMatch.type, listingMatch.provider_id, hosts),
      customer: customer ? { name: customer.name, phone: customer.phone } : null,
      listing: listingMatch
    });
  }

  const confirmedBookings = bookings.filter(b => b.status === 'confirmed');
  let revenue = 0;
  for (const b of confirmedBookings) {
    const listing = listingsMap.find(l => l.id === b.listingId);
    if (listing) {
      revenue += bookingGrossAmount({
        listingType: b.listingType,
        price: listing.price,
        guests: b.guests,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
      });
    }
  }

  const stats = {
    total: bookings.length,
    confirmed: confirmedBookings.length,
    // What still needs the host's attention. An accepted booking is waiting on the guest's
    // payment, not on the host, so it is counted separately rather than nagging them forever.
    pending: bookings.filter(b => b.status === 'pending_payment').length,
    accepted: bookings.filter(b => b.status === 'accepted').length,
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
 *       200:
 *         description: >
 *           The cancelled booking (idempotent if already cancelled), plus `refunded` saying
 *           whether a settled payment for it was returned.
 *       403: { description: Caller may not cancel this booking }
 *       404: { description: Booking not found }
 */
// Cancel a booking. A traveller can cancel their own; a provider can decline/cancel one on a
// listing they own; an admin can cancel any. Only ever transitions to 'cancelled' (no un-cancel).
/**
 * Does this caller own the listing a booking was made against?
 *
 * The listing's providerId can be a provider id or a bare user id (admin-created listings), so
 * both are accepted. Shared by cancel and confirm, which must agree on who the host is  two
 * copies of this would eventually let someone confirm a booking they cannot cancel.
 */
async function ownsListingFor(
  booking: typeof schema.bookings.$inferSelect,
  user: { id: string; role: string }
): Promise<boolean> {
  const [listing] = await db.select({ providerId: schema.listings.providerId })
    .from(schema.listings).where(eq(schema.listings.id, booking.listingId)).limit(1);
  if (!listing) return false;
  const ownIds = new Set<string>(await ownListingIds(user.id));
  return ownIds.has(listing.providerId);
}

const bookingShape = (b: typeof schema.bookings.$inferSelect) => ({
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
  accepted_at: b.acceptedAt,
});

/**
 * @openapi
 * /bookings/{id}/confirm:
 *   patch:
 *     summary: Accept a booking request (host or admin only)
 *     description: >
 *       Moves a `pending_payment` booking to `accepted`  the host has agreed to take it. This
 *       does NOT confirm the booking: payment is still what confirms, and the status becomes
 *       `confirmed` when the commission settles. An accepted booking holds its dates
 *       unconditionally, unlike a pending one, which expires with the checkout hold window.
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: The accepted booking }
 *       403: { description: Not the host of this listing }
 *       404: { description: Booking not found }
 *       409: { description: The booking is cancelled, or its dates went to someone else }
 */
router.patch('/:id/confirm', authenticateToken, async (req: Request, res: Response) => {
  const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, routeParam(req, 'id'))).limit(1);
  if (!booking) return res.status(404).json({ detail: 'Booking not found' });

  // Deliberately NOT the guest: a guest accepting their own request would be the whole point of
  // host approval defeated. Admins are included as the operational escape hatch they are elsewhere.
  const allowed = req.user.role === 'admin' || (await ownsListingFor(booking, req.user));
  if (!allowed) {
    return res.status(403).json({ detail: 'Only the host of this listing can accept this booking' });
  }

  // Idempotent, and already-confirmed is a success rather than an error  the guest paid before
  // the host got to the request, which is a normal race on an instant-confirm rate.
  if (booking.status === 'accepted' || booking.status === 'confirmed') {
    return res.json({ booking: bookingShape(booking) });
  }
  if (booking.status === 'cancelled') {
    return res.status(409).json({ detail: 'This booking was cancelled and cannot be accepted' });
  }
  // A request whose date has passed (one saved before dates were checked) cannot be promised.
  if (hasStartDatePassed(booking.checkIn)) {
    return res.status(409).json({ detail: PAST_DATE_DETAIL, code: 'date_in_past' });
  }

  // Accepting takes the dates off the market unconditionally, so it has to be serialised against
  // the settlement path the same way that path serialises against itself  otherwise a host could
  // accept one guest at the same instant another guest's payment confirms the same nights.
  const outcome = await db.transaction(async (tx) => {
    // Re-read under lock: the guest may have cancelled, or request expiry closed it, since the
    // checks above. Accepting must not undo either.
    const now = await lockBookingForChange(tx, booking.id);
    if (!now || now.status === 'cancelled') return { closed: true as const };
    if (now.status === 'accepted' || now.status === 'confirmed') return { already: now };
    if (isDateExclusive(booking.listingType) && booking.checkIn && booking.checkOut) {
      const clash = await findBlockingBooking(
        tx, booking.listingId, booking.checkIn, booking.checkOut, booking.id
      );
      if (clash && (clash.status === 'confirmed' || clash.status === 'accepted')) {
        return { taken: true as const };
      }
    }
    const [accepted] = await tx.update(schema.bookings)
      .set({ status: 'accepted', acceptedAt: new Date().toISOString() })
      .where(eq(schema.bookings.id, booking.id))
      .returning();
    // Other guests who asked for some of the same nights can no longer get them. Close their
    // requests now, so they are told and can look elsewhere instead of waiting on a host who
    // can no longer say yes.
    let declined: typeof schema.bookings.$inferSelect[] = [];
    if (isDateExclusive(booking.listingType) && booking.checkIn && booking.checkOut) {
      declined = await tx.update(schema.bookings)
        .set({ status: 'cancelled' })
        .where(and(
          eq(schema.bookings.listingId, booking.listingId),
          eq(schema.bookings.status, 'pending_payment'),
          ne(schema.bookings.id, booking.id),
          lt(schema.bookings.checkIn, booking.checkOut),
          gt(schema.bookings.checkOut, booking.checkIn),
        ))
        .returning();
    }
    return { taken: false as const, booking: accepted, declined };
  });

  if ('closed' in outcome) {
    return res.status(409).json({ detail: 'This booking was cancelled and cannot be accepted', code: 'cancelled' });
  }
  if ('already' in outcome && outcome.already) return res.json({ booking: bookingShape(outcome.already) });
  if (outcome.taken) {
    return res.status(409).json({ detail: 'These dates have already gone to another guest' });
  }

  for (const other of outcome.declined) {
    await releaseVoucherForBooking(db, other.id);
    await refundPaymentsFor('booking_commission', other.id, 'dates went to another guest'); // no-op when unpaid
    await addInAppNotification(other.userId, {
      kind: 'booking_cancelled',
      title: 'Those dates are no longer free',
      body: `The host of ${other.listingTitle} accepted another guest for some of the same nights, so your request was closed. Nothing was charged.`,
      refId: other.id,
    });
  }

  await addInAppNotification(booking.userId, {
    kind: 'booking_accepted',
    title: 'Your request was accepted',
    body: `The host accepted your request for ${booking.listingTitle}. Confirm it to lock it in.`,
    refId: booking.id,
  });
  void notifyBookingAccepted(outcome.booking);

  res.json({ booking: bookingShape(outcome.booking) });
});

/**
 * @openapi
 * /bookings/{id}/checkout:
 *   post:
 *     summary: Confirm a booking (free with the aangan pass)
 *     description: >
 *       Confirms the booking under the listing lock (so two guests cannot both take the same
 *       nights) and sends both parties their confirmation. Free for a traveller with the ₹12
 *       aangan pass. Without one this answers 402 `fee_required`: the traveller pays the ₹1
 *       convenience fee (payment flow `booking_commission`, reference = this booking), and that
 *       payment confirms the booking. Only the guest who made the booking can call it.
 *       Idempotent: an already-confirmed booking is returned as it is.
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: "The confirmed booking, as `{ booking }`" }
 *       402: { description: "No aangan pass: pay the ₹1 fee (`code: fee_required`, `amount` in paise)" }
 *       403: { description: Not the guest who made this booking }
 *       404: { description: Booking not found }
 *       409: { description: "The booking is cancelled, the host is not taking bookings, or the dates went to another guest (the booking is then cancelled)" }
 */
router.post('/:id/checkout', authenticateToken, async (req: Request, res: Response) => {
  const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, routeParam(req, 'id'))).limit(1);
  if (!booking) return res.status(404).json({ detail: 'Booking not found' });
  if (booking.userId !== req.user.id) {
    return res.status(403).json({ detail: 'You can only confirm your own booking' });
  }
  if (booking.status === 'cancelled') {
    return res.status(409).json({ detail: 'This booking was cancelled' });
  }
  // Board: a driver, homestay or guide request waits for the host to accept it first.
  if (await isAwaitingHost(booking)) {
    return res.status(409).json({ detail: AWAITING_HOST_DETAIL, code: 'awaiting_host', booking: bookingShape(booking) });
  }
  if (booking.status !== 'confirmed') {
    // Checked before the fee, so nobody pays to confirm a date that has already gone.
    if (hasStartDatePassed(booking.checkIn)) {
      return res.status(409).json({ detail: PAST_DATE_DETAIL, code: 'date_in_past' });
    }
    const [listing] = await db.select({ providerId: schema.listings.providerId })
      .from(schema.listings).where(eq(schema.listings.id, booking.listingId)).limit(1);
    if (listing && (await isListingHostLapsed(listing.providerId))) {
      return res.status(409).json({ detail: 'This listing is not taking bookings right now' });
    }
    // Board: with the pass every booking is free; without it, ₹1 per booking.
    if (!isExemptFromSupport(req.user) && !isSupportActive(req.user)) {
      return res.status(402).json({
        detail: 'Pay the ₹1 convenience fee, or take the aangan pass and book free all year.',
        code: 'fee_required',
        // What the fee and the pass cost with GST, so the choice shows the real totals.
        amount: flowBreakup('booking_commission').total,
        breakup: flowBreakup('booking_commission'),
        pass_breakup: passBreakupFor(req.user),
      });
    }
  }

  const record = await settleBookingConfirmation(booking.id, req.user.id, { paid: false });
  if (!record) return res.status(404).json({ detail: 'Booking not found' });
  if ('cancelled' in record && record.cancelled) {
    return res.status(409).json({ detail: 'This booking was cancelled', code: 'cancelled' });
  }
  if (record.conflict) {
    return res.status(409).json({ detail: 'These dates have already gone to another guest', booking: record });
  }
  res.json({ booking: record });
});

router.patch('/:id/cancel', authenticateToken, async (req: Request, res: Response) => {
  const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, routeParam(req, 'id'))).limit(1);
  if (!booking) return res.status(404).json({ detail: 'Booking not found' });

  const allowed =
    booking.userId === req.user.id ||
    req.user.role === 'admin' ||
    (await ownsListingFor(booking, req.user));
  if (!allowed) return res.status(403).json({ detail: 'You do not have permission to cancel this booking' });

  const shape = bookingShape;

  // Locked, so an accept or confirm landing at the same moment cannot overwrite the cancel, and
  // `was` is the status this cancel actually replaced (the decisions below depend on it).
  const change = await db.transaction(async (tx) => {
    const now = await lockBookingForChange(tx, booking.id);
    if (!now) return null;
    // Idempotent: cancelling an already-cancelled booking just echoes it back.
    if (now.status === 'cancelled') return { was: now.status, updated: now, unchanged: true };
    const [updated] = await tx.update(schema.bookings)
      .set({ status: 'cancelled' })
      .where(eq(schema.bookings.id, booking.id))
      .returning();
    return { was: now.status, updated, unchanged: false };
  });
  if (!change) return res.status(404).json({ detail: 'Booking not found' });
  if (change.unchanged) return res.json({ booking: shape(change.updated) });
  const { updated } = change;
  const wasStatus = change.was;

  // A voucher is burned when the request is made. If the booking never reached `confirmed` the
  // guest received nothing for it, so it goes back; a confirmed stay keeps its discount spent.
  if (wasStatus !== 'confirmed') await releaseVoucherForBooking(db, booking.id);

  // Give back whatever was paid for this booking. Before this, cancelling flipped the status and
  // kept the money with no record that anything was owed  refundPaymentsFor is idempotent and a
  // no-op for a booking that never got past pending_payment, so this is safe on every path.
  const outcomes = await refundPaymentsFor(
    'booking_commission',
    booking.id,
    `booking cancelled by ${req.user.role === 'admin' ? 'admin' : booking.userId === req.user.id ? 'guest' : 'host'}`
  );
  const refunded = outcomes.some(o => o.refunded);

  // The feed, unlike WhatsApp, is cheap and silent, so whoever did not press the button hears
  // about it whatever state the booking was in.
  if (booking.userId !== req.user.id) {
    await addInAppNotification(booking.userId, {
      kind: 'booking_cancelled',
      title: 'Booking cancelled',
      body: `Your booking for ${booking.listingTitle} was cancelled by the host.`,
      refId: booking.id,
    });
  } else if (wasStatus === 'confirmed' || wasStatus === 'accepted') {
    const [listing] = await db.select({ providerId: schema.listings.providerId })
      .from(schema.listings).where(eq(schema.listings.id, booking.listingId)).limit(1);
    await addHostNotification(listing?.providerId, {
      kind: 'booking_cancelled',
      title: 'Booking cancelled',
      body: `A guest cancelled their booking for ${booking.listingTitle}.`,
      refId: booking.id,
    });
  }

  // Only worth telling the guest when there was something to tell them about  a booking that
  // never reached confirmation was never announced in the first place.
  if (wasStatus === 'confirmed') {
    const [guest] = await db.select().from(schema.users).where(eq(schema.users.id, booking.userId)).limit(1);
    await notifyBookingCancelled(updated, guest?.phone || '', guest?.name || 'Guest', refunded, guest?.email);
  }

  res.json({ booking: shape(updated), refunded });
});

export default router;
