import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { eq, and, ne, gte, desc, sql } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { AMOUNTS, FREE_HOST_TYPES, GST_RATE_PERCENT, PLATFORM_FEE_PERCENT, HOST_RENEWAL_WINDOW_DAYS, MOCK_PAYMENTS, rzpClient, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, IS_PROD, log } from '../config';
import { computeSupportPassExpiry, isExemptFromSupport, isSupportActive } from '../lib/support';
import { computeHostPlanExpiry, isHostPlanLive, isListingHostLapsed } from '../lib/hostPlan';
import { serializeProvider } from '../lib/providerShape';
import { publishFirstListing } from '../lib/hostGrace';
import { sendAwaitingRequest, AWAITING_FEE } from '../lib/bookingSend';
import { settleBookingConfirmation } from '../lib/bookingConfirmation';
import { isAwaitingHost } from '../lib/bookingApproval';
import { refundPaymentsFor } from '../lib/refunds';
import { resolveAmount } from '../lib/payments';
import { hostPlanBreakup, passBreakupFor, priceList } from '../lib/pricing';

const router = Router();

// What a settlement writes through: the shared pool, or the transaction settlePaymentOnce opens so
// the paid flag and the entitlement it buys commit together or not at all.
type Executor = Pick<typeof db, 'select' | 'update' | 'insert'>;

// Common after-payment trigger side effects function
async function handlePaymentSuccess(
  flow: string,
  referenceId: string,
  userId: string,
  amount: number,
  tx: Executor = db
) {
  if (flow === 'provider_registration') {
    // The first year (₹499, or ₹99 for a cafe, shop or guide). assertOwnsReference only lets a provider pay this once: one that has
    // never been activated, or one on the free start (grace). A host on the free start already
    // has their listing, so it is only made here for a host who never started free.
    const [before] = await tx.select().from(schema.providers).where(eq(schema.providers.id, referenceId)).limit(1);
    const wasOnGrace = !!before?.grace;
    await tx.update(schema.providers)
      .set({
        status: 'active',
        grace: false,
        activatedAt: before?.activatedAt || new Date().toISOString(),
        // From today: a host who started free begins their paid year the day they pay.
        planExpiresAt: computeHostPlanExpiry(before?.planExpiresAt),
      })
      .where(eq(schema.providers.id, referenceId));

    await tx.update(schema.users)
      .set({ providerPaid: true })
      .where(eq(schema.users.id, userId));

    const [p] = await tx.select().from(schema.providers).where(eq(schema.providers.id, referenceId)).limit(1);
    if (p && !wasOnGrace) await publishFirstListing(tx, p);
    return p ? serializeProvider(p) : null;
  } else if (flow === 'provider_renewal') {
    // Another year at the same price. Extends from the current expiry when renewing early, from now when
    // the plan has already lapsed, so the host's listings come back the moment this settles.
    const [p] = await tx.select().from(schema.providers).where(eq(schema.providers.id, referenceId)).limit(1);
    if (!p) return null;
    const [renewed] = await tx.update(schema.providers)
      .set({ planExpiresAt: computeHostPlanExpiry(p.planExpiresAt) })
      .where(eq(schema.providers.id, referenceId))
      .returning();
    return serializeProvider(renewed);
  } else if (flow === 'booking_commission') {
    // The ₹1 fee of a traveller without the pass: paying it sends their saved request to the
    // host (lib/bookingSend.ts), and refunds it if the request cannot go out after all.
    const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, referenceId)).limit(1);
    if (!b) return null;
    if (b.status === AWAITING_FEE) {
      const sent = await sendAwaitingRequest(referenceId, { paid: true });
      return 'booking' in sent ? { outcome: sent.outcome, id: sent.booking.id, status: sent.booking.status } : null;
    }
    // An order made before 2026-11-19, when the fee confirmed a booking, settling late: it still
    // confirms. A request still waiting on its host is never confirmed by money (it went out with
    // the pass while this payment was open), so that fee goes back.
    if (await isAwaitingHost(b)) {
      await refundPaymentsFor('booking_commission', b.id, 'request already sent with the pass');
      return { outcome: 'already', id: b.id, status: b.status };
    }
    return settleBookingConfirmation(referenceId, userId, { paid: true });
  } else if (flow === 'platform_support') {
    // The yearly aangan pass (₹1 the first year, ₹12 after). A duplicate settlement never reaches this point because the
    // payment record is settled idempotently before entitlements are granted.
    const [u] = await tx.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!u) return null;

    const supportExpiresAt = computeSupportPassExpiry(u.supportExpiresAt);
    await tx.update(schema.users)
      .set({ supportExpiresAt })
      .where(eq(schema.users.id, userId));

    return { supportExpiresAt };
  } else if (flow === 'donation') {
    // Deliberately grants nothing. No expiry, no listing, no booking, no entitlement of any kind
    //  a donation is a gift, and giving one must never become a way to buy access. The amount
    // is returned only so the thank-you screen can name the figure; the authoritative record is
    // the payments row settlePaymentOnce has already marked paid.
    return { amount };
  }
  return null;
}

type PaymentRow = typeof schema.payments.$inferSelect;

/**
 * Checks that `referenceId` names something the caller actually owns and may pay for.
 * Returns null when allowed, or the error to send.
 */
async function assertOwnsReference(
  flow: string,
  referenceId: string,
  userId: string
): Promise<{ status: number; detail: string; code?: string } | null> {
  if (flow === 'provider_registration' || flow === 'provider_renewal') {
    const [provider] = await db.select().from(schema.providers).where(eq(schema.providers.id, referenceId)).limit(1);
    if (!provider) {
      return { status: 404, detail: 'Provider not found' };
    }
    if (provider.userId !== userId) {
      return { status: 403, detail: 'You can only pay for your own provider registration' };
    }
    // Registration is the ₹1 first year and happens once. Paying it again on a host that has
    // already been activated would buy a year for ₹1 instead of ₹499 (and used to insert a
    // duplicate listing), so a registered host is sent to the renewal instead.
    // A host on the free start (grace) has been activated but has not paid: their first year is
    // still this registration.
    if (flow === 'provider_registration' && provider.activatedAt && !provider.grace) {
      return { status: 409, detail: 'This business is already registered. Renew the plan instead.' };
    }
    if (provider.businessType && FREE_HOST_TYPES.has(provider.businessType)) {
      return { status: 409, detail: 'Local shops list free. There is nothing to pay.', code: 'free_listing' };
    }
    if (flow === 'provider_registration' && provider.status === 'suspended') {
      return { status: 403, detail: 'This business is suspended. Contact support.' };
    }
    if (flow === 'provider_renewal') {
      if (!provider.activatedAt) {
        return { status: 409, detail: 'Finish registering before renewing.' };
      }
      if (provider.grace) {
        return { status: 409, detail: 'You are on the free start. Pay for your first year instead.', code: 'on_grace' };
      }
      if (provider.status === 'suspended') {
        return { status: 403, detail: 'This business is suspended. Contact support.' };
      }
      if (isHostPlanLive(provider)) {
        const opensAt = Date.parse(provider.planExpiresAt as string) - HOST_RENEWAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
        if (Date.now() < opensAt) {
          const from = new Date(opensAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
          return {
            status: 409,
            detail: `Your host plan is already active. Renewal opens ${HOST_RENEWAL_WINDOW_DAYS} days before it ends, on ${from}.`,
          };
        }
      }
    }
    return null;
  }

  if (flow === 'booking_commission') {
    const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, referenceId)).limit(1);
    if (!booking) {
      return { status: 404, detail: 'Booking not found' };
    }
    if (booking.userId !== userId) {
      return { status: 403, detail: 'You can only pay for your own booking' };
    }
    if (booking.status === 'confirmed') return { status: 409, detail: 'This booking is already confirmed' };
    if (booking.status === 'cancelled') return { status: 409, detail: 'This booking was cancelled' };
    // The fee is paid to send a saved request. Once it has gone (with the fee or the pass),
    // there is nothing more to pay: confirming is free.
    if (booking.status === AWAITING_FEE) return null;
    return { status: 409, detail: 'This request has already been sent. Confirming it is free.', code: 'booking_free' };
  }

  if (flow === 'platform_support') {
    // The reference is the payer themselves  there is no other entity to own. Requiring the
    // match is what stops someone creating a ₹1 order that credits a different account.
    if (referenceId !== userId) {
      return { status: 403, detail: 'You can only pay the support fee for your own account' };
    }
    return null;
  }

  if (flow === 'donation') {
    // Same shape as platform_support: a gift has no entity behind it, so the payer is the
    // reference. It grants nothing, so a mismatch is not exploitable for access  but an order
    // attributed to the wrong account would still corrupt the record of who gave what.
    if (referenceId !== userId) {
      return { status: 403, detail: 'You can only donate from your own account' };
    }
    return null;
  }

  // Unknown flows are rejected by the AMOUNTS lookup before this is reached; refuse by default
  // rather than silently allowing any future flow added without an ownership rule.
  return { status: 400, detail: 'Invalid payment flow' };
}

/**
 * Marks an order paid and runs its side effects at most once.
 *
 * With webhooks enabled, a successful payment is reported twice by design: once by the browser
 * callback into /verify, once by Razorpay into /webhook  and they race. The conditional
 * `WHERE status <> 'paid'` is the lock: whoever wins gets a row back and runs the side effects;
 * the loser gets zero rows and skips them. Without this, provider_registration would insert a
 * duplicate listing per delivery.
 *
 * Always uses the *stored* flow/referenceId (see INVESTIGATION.md §1.5)  never caller input.
 */
async function settlePaymentOnce(payment: PaymentRow, gatewayPaymentId: string) {
  const markPaid = (ex: Executor) => ex.update(schema.payments)
    .set({ status: 'paid', paymentId: gatewayPaymentId, paidAt: new Date().toISOString() })
    .where(and(eq(schema.payments.orderId, payment.orderId), ne(schema.payments.status, 'paid')))
    .returning();

  // Every argument comes from the STORED row, never from caller input  see the note above and
  // INVESTIGATION.md §1.5. That includes the amount: echoing a client-supplied figure back as
  // "thank you for ₹X" would let anyone fake a receipt for a sum they never paid.
  const fulfil = (ex: Executor) => handlePaymentSuccess(
    payment.flow,
    payment.referenceId,
    payment.userId,
    payment.amount,
    ex
  );

  // Booking settlement runs its own transaction and refund logic on the shared pool, so it cannot
  // join this one. If the settlement
  // throws, the paid flag is rolled back so the webhook's retry can run it again, rather than
  // being skipped as "already settled" for a payment whose booking was never confirmed.
  if (payment.flow === 'booking_commission') {
    const settled = await markPaid(db);
    if (settled.length === 0) return { alreadySettled: true as const, record: null };
    try {
      return { alreadySettled: false as const, record: await fulfil(db) };
    } catch (err) {
      await db.update(schema.payments)
        .set({ status: 'created', paymentId: null, paidAt: null })
        .where(eq(schema.payments.orderId, payment.orderId));
      throw err;
    }
  }

  // Everything else commits atomically. If activating the host or granting the pass throws, the
  // paid flag rolls back with it, so /verify and the webhook both fail loudly and Razorpay's
  // retry runs the whole settlement again. Before this, the row stayed `paid`, every retry saw
  // "already settled", and a charged customer was left with nothing.
  return db.transaction(async (tx) => {
    const settled = await markPaid(tx);
    if (settled.length === 0) return { alreadySettled: true as const, record: null };
    return { alreadySettled: false as const, record: await fulfil(tx) };
  });
}

// ============ PAYMENTS ============

/**
 * @openapi
 * /payments/order:
 *   post:
 *     summary: Create a payment order (mock or real Razorpay depending on MOCK_PAYMENTS)
 *     description: >
 *       The reference_id must name something the caller owns  their own provider for
 *       provider_registration, or their own booking for booking_commission. The amount is set
 *       server-side from the flow and is never taken from the client.
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [flow, reference_id]
 *             properties:
 *               flow: { type: string, enum: [provider_registration, provider_renewal, platform_support, donation] }
 *               reference_id: { type: string, description: "Provider id (provider_registration, provider_renewal), or the caller's own user id (platform_support, donation)" }
 *               amount: { type: integer, description: "Amount in paise. ONLY read for flow=donation, where it must be an integer between 1000 (₹10) and 10000000 (₹1,00,000). Ignored for every other flow, whose price is fixed server-side." }
 *     responses:
 *       200:
 *         description: Order created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mock: { type: boolean }
 *                 key_id: { type: string }
 *                 order: { type: object }
 *                 amount: { type: integer, description: "Amount in paise" }
 *       400:
 *         description: Missing fields or invalid flow
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: reference_id belongs to another user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: reference_id does not exist
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       502:
 *         description: Razorpay order creation failed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
/**
 * @openapi
 * /payments/prices:
 *   get:
 *     summary: What each fixed payment costs, with its breakup
 *     description: >
 *       Base price, 18% GST, the 2% payment gateway fee (host plans only) and the total, in
 *       paise, for the aangan pass (first year and renewal), the ₹1 booking fee and the host plan. Public, so both apps can show
 *       the breakup before anyone signs in or pays.
 *     tags: [Payments]
 *     responses:
 *       200: { description: "`{ gst_rate, platform_fee_rate, prices: { <flow>: { base, gst, platform_fee, total } } }`" }
 */
router.get('/prices', (_req: Request, res: Response) => {
  res.json({ gst_rate: GST_RATE_PERCENT, platform_fee_rate: PLATFORM_FEE_PERCENT, prices: priceList() });
});

/** The traveller's member number: AG-<year joined>-<5 letters from their account>, stable for life. */
export function memberIdFor(userId: string, since: string | null): string {
  const yy = since ? String(new Date(since).getUTCFullYear()).slice(-2) : '00';
  const code = crypto.createHash('sha256').update(String(userId)).digest('hex').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 5);
  return `AG-${yy}-${code}`;
}

/**
 * @openapi
 * /payments/membership:
 *   get:
 *     summary: The signed-in traveller's aangan pass, for the membership card
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "`{ active, expires_at, since, paid, member_id }`; paid is in paise, from the latest pass payment" }
 */
router.get('/membership', authenticateToken, async (req: Request, res: Response) => {
  const [u] = await db.select({ id: schema.users.id, role: schema.users.role, supportExpiresAt: schema.users.supportExpiresAt })
    .from(schema.users).where(eq(schema.users.id, req.user.id)).limit(1);
  if (!u) return res.status(404).json({ detail: 'User not found' });
  const paid = await db.select({ amount: schema.payments.amount, paidAt: schema.payments.paidAt, createdAt: schema.payments.createdAt })
    .from(schema.payments)
    .where(and(eq(schema.payments.userId, u.id), eq(schema.payments.flow, 'platform_support'), eq(schema.payments.status, 'paid')))
    .orderBy(schema.payments.createdAt);
  const first = paid[0];
  const last = paid[paid.length - 1];
  const since = first ? (first.paidAt || first.createdAt) : null;
  res.json({
    active: isSupportActive(u),
    expires_at: u.supportExpiresAt,
    since,
    paid: last ? last.amount : null,
    member_id: memberIdFor(u.id, since),
  });
});

/**
 * @openapi
 * /payments/membership/end:
 *   post:
 *     summary: End the traveller's aangan pass now (no refund; buying again later costs the yearly price)
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "`{ ok: true, supportExpiresAt }`" }
 */
router.post('/membership/end', authenticateToken, async (req: Request, res: Response) => {
  const [u] = await db.select({ id: schema.users.id, role: schema.users.role, supportExpiresAt: schema.users.supportExpiresAt })
    .from(schema.users).where(eq(schema.users.id, req.user.id)).limit(1);
  if (!u) return res.status(404).json({ detail: 'User not found' });
  if (!isSupportActive(u)) return res.json({ ok: true, supportExpiresAt: u.supportExpiresAt });
  const supportExpiresAt = new Date().toISOString();
  await db.update(schema.users).set({ supportExpiresAt }).where(eq(schema.users.id, u.id));
  res.json({ ok: true, supportExpiresAt });
});

// Create order
/** How long an unpaid order is handed back again instead of making a new one. */
const ORDER_REUSE_MINUTES = 30;

router.post('/order', authenticateToken, async (req: Request, res: Response) => {
  const { flow, reference_id } = req.body;
  if (!flow || !reference_id) {
    return res.status(400).json({ detail: 'Flow and reference ID are required' });
  }

  // resolveAmount owns this decision for every flow. Fixed flows read the server-side map and
  // ignore the body; `donation` is the only branch permitted to read a client-supplied amount,
  // and it validates the range before returning. Keeping it in one function means "can a client
  // name its own price?" has a single, auditable answer.
  const resolved = resolveAmount(flow, req.body);
  if ('error' in resolved) {
    return res.status(resolved.error.status).json({ detail: resolved.error.detail });
  }
  let { amount } = resolved;
  let breakup = resolved.breakup ?? null;
  // The pass is ₹1 the first time and ₹12 after that; the payer decides which, not the client.
  if (flow === 'platform_support') {
    breakup = passBreakupFor(req.user);
    amount = breakup.total;
  }

  // Bind the reference to the caller at the point it enters the system. §1.5 stopped an order
  // being *redeemed* against someone else's reference, but without this an attacker could simply
  // create the order that way  paying ₹1 to activate a provider that isn't theirs, or to renew
  // someone else's plan. The order is the record of record, so it has to be right here.
  const ownershipError = await assertOwnsReference(flow, reference_id, req.user.id);
  if (ownershipError) {
    return res.status(ownershipError.status).json({ detail: ownershipError.detail, ...(ownershipError.code ? { code: ownershipError.code } : {}) });
  }
  // A host's plan depends on the business: ₹499 for a homestay or driver, ₹99 for a cafe, shop
  // or guide. The provider is known to exist and be the caller's (assertOwnsReference above).
  if (flow === 'provider_registration' || flow === 'provider_renewal') {
    const [p] = await db.select({ businessType: schema.providers.businessType }).from(schema.providers)
      .where(eq(schema.providers.id, reference_id)).limit(1);
    breakup = hostPlanBreakup(p?.businessType, flow);
    amount = breakup.total;
  }

  if (!MOCK_PAYMENTS && !rzpClient) {
    return res.status(500).json({ detail: 'Razorpay not configured' });
  }

  // One open order per thing being paid for. Pressing Pay twice, or closing the sheet and opening
  // it again, hands back the order already made for the same thing at the same price, instead of
  // leaving a pile of unused orders. The advisory lock makes two presses at the same instant wait
  // for each other, so the second one finds the first one's order. A donation names its own
  // amount, so it always gets a fresh order.
  const reusable = flow !== 'donation';
  try {
    const result = await db.transaction(async (tx) => {
      if (reusable) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`payment-order:${req.user.id}:${flow}:${reference_id}`}))`);
        const [open] = await tx.select().from(schema.payments).where(and(
          eq(schema.payments.userId, req.user.id),
          eq(schema.payments.flow, flow),
          eq(schema.payments.referenceId, reference_id),
          eq(schema.payments.status, 'created'),
          eq(schema.payments.amount, amount),
          eq(schema.payments.mock, MOCK_PAYMENTS),
          gte(schema.payments.createdAt, new Date(Date.now() - ORDER_REUSE_MINUTES * 60 * 1000).toISOString()),
        )).orderBy(desc(schema.payments.createdAt)).limit(1);
        if (open?.orderId) return { order: { id: open.orderId, amount, currency: 'INR' } as any, reused: true };
      }

      let order: any;
      if (MOCK_PAYMENTS) {
        order = { id: `mock_order_${uuidv4().replace(/-/g, '').slice(0, 12)}`, amount, currency: 'INR' };
      } else {
        const receipt = `${flow.slice(0, 20)}_${reference_id.slice(0, 16)}_${uuidv4().slice(0, 6)}`.slice(0, 40);
        order = await rzpClient!.orders.create({
          amount,
          currency: 'INR',
          receipt,
          notes: { flow, reference_id, user_id: req.user.id }
        });
      }
      await tx.insert(schema.payments).values({
        id: uuidv4(),
        userId: req.user.id,
        flow,
        referenceId: reference_id,
        amount,
        breakup,
        orderId: order.id,
        status: 'created',
        mock: MOCK_PAYMENTS,
        createdAt: new Date().toISOString()
      });
      return { order, reused: false };
    });

    return res.json({
      mock: MOCK_PAYMENTS,
      key_id: MOCK_PAYMENTS ? 'mock_gateway' : RAZORPAY_KEY_ID,
      order: result.order,
      amount,
      breakup
    });
  } catch (err: any) {
    log.error(`Razorpay order failed: ${err}`);
    return res.status(502).json({ detail: `Payment gateway error: ${err.message || err}` });
  }
});

/**
 * @openapi
 * /payments/mock/complete:
 *   post:
 *     summary: Complete a mock payment order (dev/sandbox only)
 *     description: >
 *       Only available when MOCK_PAYMENTS=true. Marks the order paid and triggers the same side
 *       effects as a real payment (provider activation or booking confirmation). The submitted
 *       flow and reference_id must match those the order was created with, and the order must
 *       belong to the caller.
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [order_id, flow, reference_id]
 *             properties:
 *               order_id: { type: string }
 *               flow: { type: string, enum: [provider_registration, provider_renewal, platform_support, donation] }
 *               reference_id: { type: string }
 *     responses:
 *       200:
 *         description: Payment marked paid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 status: { type: string }
 *                 record: { type: object, nullable: true }
 *       400:
 *         description: Mock payments disabled, missing fields, or flow/reference_id do not match the order
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Order does not belong to the calling user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// Complete mock payment
router.post('/mock/complete', authenticateToken, rateLimiter(10, 60 * 1000, 'mock_complete'), async (req: Request, res: Response) => {
  if (!MOCK_PAYMENTS) {
    return res.status(400).json({ detail: 'Mock payments disabled' });
  }

  const { order_id, flow, reference_id } = req.body;
  if (!order_id || !flow || !reference_id) {
    return res.status(400).json({ detail: 'Order ID, flow and reference ID are required' });
  }

  const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, order_id)).limit(1);
  if (!payment) {
    return res.status(404).json({ detail: 'Order not found' });
  }

  if (payment.userId !== req.user.id) {
    return res.status(403).json({ detail: 'Not authorized to complete this payment' });
  }

  // The order records what was actually paid for. Redeeming it against any other
  // flow/reference would let a cheap order settle an expensive one, or settle
  // another user's provider/booking entirely.
  if (payment.flow !== flow || payment.referenceId !== reference_id) {
    return res.status(400).json({ detail: 'Flow and reference ID do not match this order' });
  }

  if (payment.status === 'paid') {
    return res.json({ ok: true, already: true });
  }

  const { alreadySettled, record } = await settlePaymentOnce(
    payment,
    `mock_pay_${uuidv4().replace(/-/g, '').slice(0, 12)}`
  );
  if (alreadySettled) {
    return res.json({ ok: true, already: true });
  }
  res.json({ ok: true, status: 'paid', record });
});

/**
 * @openapi
 * /payments/verify:
 *   post:
 *     summary: Verify a real Razorpay payment signature and complete the order
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [razorpay_order_id, razorpay_payment_id, razorpay_signature, flow, reference_id]
 *             properties:
 *               razorpay_order_id: { type: string }
 *               razorpay_payment_id: { type: string }
 *               razorpay_signature: { type: string }
 *               flow: { type: string, enum: [provider_registration, provider_renewal, platform_support, donation] }
 *               reference_id: { type: string }
 *     responses:
 *       200:
 *         description: Payment verified and completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 status: { type: string }
 *       400:
 *         description: Missing fields, invalid signature, or flow/reference_id do not match the order
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Order does not belong to the calling user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         description: Razorpay secret not configured
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// Verify payment signature
router.post('/verify', authenticateToken, async (req: Request, res: Response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, flow, reference_id } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !flow || !reference_id) {
    return res.status(400).json({ detail: 'All payment parameters are required' });
  }

  const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, razorpay_order_id)).limit(1);
  if (!payment) {
    return res.status(404).json({ detail: 'Order not found' });
  }

  if (payment.userId !== req.user.id) {
    return res.status(403).json({ detail: 'Not authorized to complete this payment' });
  }

  // See /mock/complete  the order, not the request body, decides what gets settled.
  if (payment.flow !== flow || payment.referenceId !== reference_id) {
    return res.status(400).json({ detail: 'Flow and reference ID do not match this order' });
  }

  if (!RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ detail: 'Razorpay secret not configured' });
  }

  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const providedBuf = Buffer.from(String(razorpay_signature), 'utf8');
  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    return res.status(400).json({ detail: 'Invalid payment signature' });
  }

  // May race the webhook for the same order  settlePaymentOnce makes that safe.
  const { alreadySettled } = await settlePaymentOnce(payment, razorpay_payment_id);
  res.json({ ok: true, status: 'paid', already: alreadySettled });
});

/**
 * Has this order been paid? Polled by the website while Razorpay's window is open: a UPI QR
 * scanned on another phone does not always reach the window's success callback, so the window
 * would sit open after the money had gone. When our row is not paid yet, Razorpay is asked
 * directly and a captured payment is settled exactly as the webhook would settle it.
 */
router.get('/order/:orderId/status', authenticateToken, rateLimiter(120, 60 * 1000, 'order_status'), async (req: Request, res: Response) => {
  const orderId = String(req.params.orderId);
  const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId)).limit(1);
  if (!payment || payment.userId !== req.user.id) return res.status(404).json({ detail: 'Order not found' });
  if (payment.status === 'paid' || payment.status === 'refunded') return res.json({ paid: true });
  if (payment.mock || !rzpClient) return res.json({ paid: false });
  try {
    const found: any = await rzpClient.orders.fetchPayments(orderId);
    const captured = (found?.items || []).find((p: any) => p?.status === 'captured' && p?.order_id === orderId);
    if (!captured) return res.json({ paid: false });
    const { alreadySettled } = await settlePaymentOnce(payment, captured.id);
    log.info(`[order-status] order=${orderId} flow=${payment.flow} ${alreadySettled ? 'already settled' : 'settled by poll'}`);
    return res.json({ paid: true });
  } catch (err: any) {
    log.error(`[order-status] could not ask Razorpay about ${orderId}: ${err?.message || err?.error?.description || err}`);
    return res.json({ paid: false });
  }
});

/**
 * @openapi
 * /payments/webhook:
 *   post:
 *     summary: Razorpay webhook receiver  called by Razorpay's servers, not by the app
 *     description: >
 *       Authenticated by the X-Razorpay-Signature header (HMAC-SHA256 of the raw request body
 *       using RAZORPAY_WEBHOOK_SECRET), NOT by a bearer token. This is the authoritative record
 *       of payment: the browser callback into /payments/verify is best-effort and is lost if the
 *       customer closes the tab, so without this endpoint those payments are charged by Razorpay
 *       but never settled in the app. Safe to deliver more than once  settlement is idempotent.
 *       Handles payment.captured and order.paid; every other event is acknowledged and ignored.
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, description: "Raw Razorpay event payload" }
 *     responses:
 *       200:
 *         description: Event processed, ignored, or already settled  Razorpay stops retrying
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 already: { type: boolean }
 *                 ignored: { type: string }
 *       400:
 *         description: Missing or invalid signature
 *       503:
 *         description: RAZORPAY_WEBHOOK_SECRET not configured
 */
// Razorpay webhook. NOTE: no authenticateToken  Razorpay has no session; the signature is the auth.
router.post('/webhook', async (req: Request, res: Response) => {
  if (!RAZORPAY_WEBHOOK_SECRET) {
    log.error('[webhook] received but RAZORPAY_WEBHOOK_SECRET is not configured  ignoring');
    return res.status(503).json({ detail: 'Webhook not configured' });
  }

  const signature = req.headers['x-razorpay-signature'];
  if (typeof signature !== 'string' || !signature) {
    return res.status(400).json({ detail: 'Missing X-Razorpay-Signature header' });
  }

  // req.body is a Buffer here: app.ts mounts express.raw for this exact path, ahead of
  // express.json. The signature covers the precise bytes Razorpay sent, so re-serialising parsed
  // JSON (different key order/whitespace) would produce a different HMAC and never verify.
  if (!Buffer.isBuffer(req.body)) {
    log.error('[webhook] body is not raw  express.raw is not mounted for this path');
    return res.status(500).json({ detail: 'Webhook body parser misconfigured' });
  }
  const raw = req.body;

  const expected = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    log.error('[webhook] signature mismatch  rejecting');
    return res.status(400).json({ detail: 'Invalid webhook signature' });
  }

  let event: any;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ detail: 'Malformed webhook payload' });
  }

  const eventType: string = event?.event || 'unknown';
  const paymentEntity = event?.payload?.payment?.entity;
  const orderId: string | undefined = paymentEntity?.order_id || event?.payload?.order?.entity?.id;

  // Razorpay retries any non-2xx with backoff. Anything we deliberately don't act on must still
  // be acknowledged, or it gets redelivered for days.
  if (eventType !== 'payment.captured' && eventType !== 'order.paid') {
    return res.json({ ok: true, ignored: eventType });
  }
  if (!orderId) {
    log.error(`[webhook] ${eventType} carried no order id  acknowledging`);
    return res.json({ ok: true, ignored: eventType });
  }

  try {
    const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId)).limit(1);
    if (!payment) {
      // Not ours (or created against another environment sharing these keys). Ack so it stops.
      log.error(`[webhook] ${eventType} for unknown order ${orderId}  acknowledging`);
      return res.json({ ok: true, unknown_order: true });
    }

    const { alreadySettled } = await settlePaymentOnce(payment, paymentEntity?.id || `rzp_${orderId}`);
    log.info(`[webhook] ${eventType} order=${orderId} flow=${payment.flow} ${alreadySettled ? 'already settled' : 'settled'}`);
    return res.json({ ok: true, already: alreadySettled });
  } catch (err: any) {
    // 500 here is deliberate: a transient DB failure should be retried by Razorpay, not swallowed.
    log.error(`[webhook] failed to settle order ${orderId}: ${err?.message || err}`);
    return res.status(500).json({ detail: 'Webhook processing failed' });
  }
});

export default router;
