import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { eq, and, ne } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { AMOUNTS, MOCK_PAYMENTS, rzpClient, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, IS_PROD, log } from '../config';

const router = Router();

// Common after-payment trigger side effects function
async function handlePaymentSuccess(flow: string, referenceId: string, userId: string) {
  if (flow === 'provider_registration') {
    await db.update(schema.providers)
      .set({ status: 'active', activatedAt: new Date().toISOString() })
      .where(eq(schema.providers.id, referenceId));

    await db.update(schema.users)
      .set({ providerPaid: true })
      .where(eq(schema.users.id, userId));

    const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, referenceId)).limit(1);
    if (p) {
      const listing = {
        id: uuidv4(),
        title: p.businessName,
        type: p.businessType,
        description: p.description,
        location: p.location,
        latitude: p.latitude,
        longitude: p.longitude,
        price: Number(p.priceFrom || 0),
        image: (p.images || [''])[0] || '',
        tags: [],
        providerId: p.id,
        extras: p.extras || {},
        createdAt: new Date().toISOString()
      };
      await db.insert(schema.listings).values(listing);
    }
    return p;
  } else if (flow === 'booking_commission') {
    await db.update(schema.bookings)
      .set({ status: 'confirmed', confirmedAt: new Date().toISOString() })
      .where(eq(schema.bookings.id, referenceId));

    const [booking] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, referenceId)).limit(1);
    if (booking) {
      const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, booking.listingId)).limit(1);
      let providerInfo = null;

      if (listing) {
        const [prov] = await db.select().from(schema.providers).where(eq(schema.providers.id, listing.providerId)).limit(1);
        if (prov) {
          providerInfo = prov;
        } else {
          const [userProv] = await db.select().from(schema.users).where(eq(schema.users.id, listing.providerId)).limit(1);
          if (userProv) {
            providerInfo = { name: userProv.name, phone: userProv.phone };
          }
        }
      }

      const [bookingUser] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      if (!IS_PROD) {
        log.info(`[MOCK NOTIFY] Booking ${booking.id} confirmed. Tourist=****${(bookingUser?.phone || '').slice(-4)}`);
      }

      return {
        ...booking,
        listing,
        provider: providerInfo
      };
    }
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
): Promise<{ status: number; detail: string } | null> {
  if (flow === 'provider_registration') {
    const [provider] = await db.select().from(schema.providers).where(eq(schema.providers.id, referenceId)).limit(1);
    if (!provider) {
      return { status: 404, detail: 'Provider not found' };
    }
    if (provider.userId !== userId) {
      return { status: 403, detail: 'You can only pay for your own provider registration' };
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
 * callback into /verify, once by Razorpay into /webhook — and they race. The conditional
 * `WHERE status <> 'paid'` is the lock: whoever wins gets a row back and runs the side effects;
 * the loser gets zero rows and skips them. Without this, provider_registration would insert a
 * duplicate listing per delivery.
 *
 * Always uses the *stored* flow/referenceId (see INVESTIGATION.md §1.5) — never caller input.
 */
async function settlePaymentOnce(payment: PaymentRow, gatewayPaymentId: string) {
  const settled = await db.update(schema.payments)
    .set({ status: 'paid', paymentId: gatewayPaymentId, paidAt: new Date().toISOString() })
    .where(and(eq(schema.payments.orderId, payment.orderId), ne(schema.payments.status, 'paid')))
    .returning();

  if (settled.length === 0) {
    return { alreadySettled: true as const, record: null };
  }

  const record = await handlePaymentSuccess(payment.flow, payment.referenceId, payment.userId);
  return { alreadySettled: false as const, record };
}

// ============ PAYMENTS ============

/**
 * @openapi
 * /payments/order:
 *   post:
 *     summary: Create a payment order (mock or real Razorpay depending on MOCK_PAYMENTS)
 *     description: >
 *       The reference_id must name something the caller owns — their own provider for
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
 *               flow: { type: string, enum: [provider_registration, booking_commission] }
 *               reference_id: { type: string, description: "Provider id (provider_registration) or booking id (booking_commission)" }
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
// Create order
router.post('/order', authenticateToken, async (req: Request, res: Response) => {
  const { flow, reference_id } = req.body;
  if (!flow || !reference_id) {
    return res.status(400).json({ detail: 'Flow and reference ID are required' });
  }

  const amount = AMOUNTS[flow];
  if (!amount) {
    return res.status(400).json({ detail: 'Invalid payment flow' });
  }

  // Bind the reference to the caller at the point it enters the system. §1.5 stopped an order
  // being *redeemed* against someone else's reference, but without this an attacker could simply
  // create the order that way — paying ₹1 to confirm a stranger's booking, or ₹99 to activate a
  // provider that isn't theirs. The order is the record of record, so it has to be right here.
  const ownershipError = await assertOwnsReference(flow, reference_id, req.user.id);
  if (ownershipError) {
    return res.status(ownershipError.status).json({ detail: ownershipError.detail });
  }

  if (MOCK_PAYMENTS) {
    const mockOrderId = `mock_order_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    await db.insert(schema.payments).values({
      id: uuidv4(),
      userId: req.user.id,
      flow,
      referenceId: reference_id,
      amount,
      orderId: mockOrderId,
      status: 'created',
      mock: true,
      createdAt: new Date().toISOString()
    });

    return res.json({
      mock: true,
      key_id: 'mock_gateway',
      order: { id: mockOrderId, amount, currency: 'INR' },
      amount
    });
  }

  if (!rzpClient) {
    return res.status(500).json({ detail: 'Razorpay not configured' });
  }

  const receipt = `${flow.slice(0, 20)}_${reference_id.slice(0, 16)}_${uuidv4().slice(0, 6)}`.slice(0, 40);
  try {
    const order = await rzpClient.orders.create({
      amount,
      currency: 'INR',
      receipt,
      notes: { flow, reference_id, user_id: req.user.id }
    });

    await db.insert(schema.payments).values({
      id: uuidv4(),
      userId: req.user.id,
      flow,
      referenceId: reference_id,
      amount,
      orderId: order.id,
      status: 'created',
      mock: false,
      createdAt: new Date().toISOString()
    });

    return res.json({
      mock: false,
      key_id: RAZORPAY_KEY_ID,
      order,
      amount
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
 *               flow: { type: string, enum: [provider_registration, booking_commission] }
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
 *               flow: { type: string, enum: [provider_registration, booking_commission] }
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

  // See /mock/complete — the order, not the request body, decides what gets settled.
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

  // May race the webhook for the same order — settlePaymentOnce makes that safe.
  const { alreadySettled } = await settlePaymentOnce(payment, razorpay_payment_id);
  res.json({ ok: true, status: 'paid', already: alreadySettled });
});

/**
 * @openapi
 * /payments/webhook:
 *   post:
 *     summary: Razorpay webhook receiver — called by Razorpay's servers, not by the app
 *     description: >
 *       Authenticated by the X-Razorpay-Signature header (HMAC-SHA256 of the raw request body
 *       using RAZORPAY_WEBHOOK_SECRET), NOT by a bearer token. This is the authoritative record
 *       of payment: the browser callback into /payments/verify is best-effort and is lost if the
 *       customer closes the tab, so without this endpoint those payments are charged by Razorpay
 *       but never settled in the app. Safe to deliver more than once — settlement is idempotent.
 *       Handles payment.captured and order.paid; every other event is acknowledged and ignored.
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, description: "Raw Razorpay event payload" }
 *     responses:
 *       200:
 *         description: Event processed, ignored, or already settled — Razorpay stops retrying
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
// Razorpay webhook. NOTE: no authenticateToken — Razorpay has no session; the signature is the auth.
router.post('/webhook', async (req: Request, res: Response) => {
  if (!RAZORPAY_WEBHOOK_SECRET) {
    log.error('[webhook] received but RAZORPAY_WEBHOOK_SECRET is not configured — ignoring');
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
    log.error('[webhook] body is not raw — express.raw is not mounted for this path');
    return res.status(500).json({ detail: 'Webhook body parser misconfigured' });
  }
  const raw = req.body;

  const expected = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    log.error('[webhook] signature mismatch — rejecting');
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
    log.error(`[webhook] ${eventType} carried no order id — acknowledging`);
    return res.json({ ok: true, ignored: eventType });
  }

  try {
    const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId)).limit(1);
    if (!payment) {
      // Not ours (or created against another environment sharing these keys). Ack so it stops.
      log.error(`[webhook] ${eventType} for unknown order ${orderId} — acknowledging`);
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
