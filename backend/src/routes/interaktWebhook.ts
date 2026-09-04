import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { INTERAKT_WEBHOOK_SECRET, log } from '../config';

const router = Router();
const DELIVERY_EVENTS = new Set([
  'message_api_sent',
  'message_api_delivered',
  'message_api_read',
  'message_api_failed',
]);

function safeEquals(expected: string, supplied: string | undefined): boolean {
  if (!supplied || !supplied.startsWith('sha256=')) return false;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const suppliedBuffer = Buffer.from(supplied, 'utf8');
  return expectedBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(expectedBuffer, suppliedBuffer);
}

/**
 * Interakt signs the exact raw JSON bytes. This route is mounted behind express.raw() before the
 * normal JSON parser; do not change that order or valid webhooks will fail verification.
 */
router.post('/', async (req: Request, res: Response) => {
  if (!INTERAKT_WEBHOOK_SECRET) {
    log.error('[interakt webhook] received while no webhook secret is configured');
    return res.status(503).json({ detail: 'Webhook not configured' });
  }
  if (!Buffer.isBuffer(req.body)) {
    return res.status(500).json({ detail: 'Webhook body parser misconfigured' });
  }

  const expected = `sha256=${crypto.createHmac('sha256', INTERAKT_WEBHOOK_SECRET).update(req.body).digest('hex')}`;
  const signature = req.header('Interakt-Signature');
  if (!safeEquals(expected, signature)) {
    return res.status(401).json({ detail: 'Invalid webhook signature' });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(req.body.toString('utf8')) as Record<string, unknown>;
  } catch {
    return res.status(400).json({ detail: 'Malformed webhook payload' });
  }

  // Interakt's event envelope has varied by API version, so accept the documented event field
  // and their common aliases without treating arbitrary event types as delivery evidence.
  const eventType = [payload.event, payload.eventType, payload.type].find((value) => typeof value === 'string');
  const eventData = payload.data as Record<string, unknown> | undefined;
  const message = eventData?.message as Record<string, unknown> | undefined;
  const callbackData = [
    payload.callbackData,
    payload.callback_data,
    eventData?.callbackData,
    eventData?.callback_data,
    message?.callbackData,
    message?.callback_data,
  ]
    .find((value) => typeof value === 'string');

  if (typeof eventType !== 'string' || !DELIVERY_EVENTS.has(eventType) || typeof callbackData !== 'string' || !callbackData.startsWith('aangan:otp:')) {
    // Acknowledging unrelated, correctly signed Interakt events prevents retry storms. We only
    // persist the four API-template statuses subscribed for this integration.
    return res.status(200).json({ received: true });
  }

  try {
    await db.insert(schema.interaktDeliveryEvents).values({
      id: uuidv4(), callbackData, eventType, receivedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    // The unique index makes redelivery idempotent. Avoid logging callback data: it is opaque by
    // design but delivery logs should still contain no customer-associated identifiers.
    if (err?.code !== '23505') throw err;
  }

  return res.status(200).json({ received: true });
});

export default router;
