import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { AMOUNTS, MOCK_PAYMENTS, rzpClient, RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, IS_PROD, log } from '../config';

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
        price: Number(p.priceFrom || 0),
        image: (p.images || [''])[0] || '',
        tags: (p.extras as any)?.tags || [],
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

// ============ PAYMENTS ============

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

  if (payment.status === 'paid') {
    return res.json({ ok: true, already: true });
  }

  await db.update(schema.payments)
    .set({ status: 'paid', paymentId: `mock_pay_${uuidv4().replace(/-/g, '').slice(0, 12)}`, paidAt: new Date().toISOString() })
    .where(eq(schema.payments.orderId, order_id));

  const resultRecord = await handlePaymentSuccess(flow, reference_id, req.user.id);
  res.json({ ok: true, status: 'paid', record: resultRecord });
});

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

  if (!RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ detail: 'Razorpay secret not configured' });
  }

  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ detail: 'Invalid payment signature' });
  }

  await db.update(schema.payments)
    .set({ status: 'paid', paymentId: razorpay_payment_id, paidAt: new Date().toISOString() })
    .where(eq(schema.payments.orderId, razorpay_order_id));

  await handlePaymentSuccess(flow, reference_id, req.user.id);
  res.json({ ok: true, status: 'paid' });
});

export default router;
