import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { db, pool, schema } from './db';
import { eq, or, and, ilike, desc, inArray, count } from 'drizzle-orm';
import { SEED_LISTINGS } from './seed_data';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey12345!';
const MOCK_PAYMENTS = process.env.MOCK_PAYMENTS ? process.env.MOCK_PAYMENTS.toLowerCase() === 'true' : true;
const APP_ENV = process.env.APP_ENV || 'development';
const IS_PROD = APP_ENV === 'production';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

if (IS_PROD && MOCK_PAYMENTS) {
  throw new Error("MOCK_PAYMENTS must be 'false' in production. Set MOCK_PAYMENTS=false in .env.");
}

const rzpClient = RAZORPAY_KEY_SECRET ? new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
}) : null;

const AMOUNTS: Record<string, number> = {
  provider_registration: 9900,
  booking_commission: 100
};

const app = express();
app.use(express.json());


app.use(cors({
  origin: (origin, callback) => {
    callback(null, true);
  },
  credentials: true,
}));

// Security headers middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  if (IS_PROD) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// Logging setup
const log = {
  info: (msg: string) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`)
};

// Rate limiter middleware (in-memory)
interface RateLimitStore {
  [ip: string]: {
    count: number;
    resetTime: number;
  };
}
const rateLimitStores: { [key: string]: RateLimitStore } = {};

function rateLimiter(limit: number, windowMs: number, keyPrefix: string) {
  if (!rateLimitStores[keyPrefix]) {
    rateLimitStores[keyPrefix] = {};
  }
  const store = rateLimitStores[keyPrefix];

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = store[ip];

    if (!record || now > record.resetTime) {
      store[ip] = {
        count: 1,
        resetTime: now + windowMs
      };
      return next();
    }

    if (record.count >= limit) {
      return res.status(429).json({ detail: 'Rate limit exceeded' });
    }

    record.count++;
    next();
  };
}

// Authentication Helpers & Middleware
function makeToken(userId: string, phone: string, role: string): string {
  return jwt.sign({ sub: userId, phone, role }, JWT_SECRET, { expiresIn: '30d' });
}

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Missing token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, payload.sub)).limit(1);
    if (!user) {
      return res.status(401).json({ detail: 'User not found' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ detail: 'Invalid token' });
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ detail: 'Admin only' });
  }
  next();
}

// ============ ROOT / HEALTH ============
app.get('/api', (req: Request, res: Response) => {
  res.json({ app: "1 Darjeeling", status: "ok" });
});

// ============ AUTH ROUTES ============
app.post('/api/auth/otp/send', rateLimiter(5, 60 * 1000, 'otp_send'), async (req: Request, res: Response) => {
  const { phone, channel = 'whatsapp' } = req.body;
  if (!phone) {
    return res.status(400).json({ detail: 'Phone number is required' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const now = new Date().toISOString();

  await db.insert(schema.otps)
    .values({ phone, otp, channel, createdAt: now })
    .onConflictDoUpdate({
      target: schema.otps.phone,
      set: { otp, channel, createdAt: now }
    });

  if (!IS_PROD) {
    log.info(`[MOCK OTP] phone=****${phone.slice(-4)} otp=${otp}`);
    return res.json({
      sent: true,
      channel,
      mock_otp: otp,
      hint: "Mock mode: use the OTP shown or 123456"
    });
  }

  return res.json({ sent: true, channel });
});

app.post('/api/auth/otp/verify', rateLimiter(10, 60 * 1000, 'otp_verify'), async (req: Request, res: Response) => {
  const { phone, otp, name, role = 'tourist' } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ detail: 'Phone and OTP are required' });
  }

  const [otpRec] = await db.select().from(schema.otps).where(eq(schema.otps.phone, phone)).limit(1);
  const universalOk = (!IS_PROD) && otp === '123456';

  if (!universalOk && (!otpRec || otpRec.otp !== otp)) {
    return res.status(400).json({ detail: 'Invalid OTP' });
  }

  let [user] = await db.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
  if (!user) {
    if (!name || name.trim() === '') {
      return res.status(400).json({ detail: 'Name is required for registration' });
    }
    user = {
      id: uuidv4(),
      phone,
      name: name.trim(),
      role,
      providerPaid: false,
      email: null,
      language: null,
      avatar: null,
      createdAt: new Date().toISOString()
    };
    await db.insert(schema.users).values(user);
  }

  if (otpRec) {
    await db.delete(schema.otps).where(eq(schema.otps.phone, phone));
  }

  const token = makeToken(user.id, user.phone, user.role);
  return res.json({ token, user });
});

app.get('/api/auth/me', authenticateToken, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

// ============ USERS ============
app.patch('/api/users/me', authenticateToken, async (req: Request, res: Response) => {
  const patch = req.body || {};
  const allowed = ['name', 'email', 'language', 'avatar'];
  const updateFields: Record<string, any> = {};

  for (const key of allowed) {
    if (patch[key] !== undefined) {
      updateFields[key] = patch[key];
    }
  }

  if (Object.keys(updateFields).length > 0) {
    await db.update(schema.users).set(updateFields).where(eq(schema.users.id, req.user.id));
  }

  const [updatedUser] = await db.select().from(schema.users).where(eq(schema.users.id, req.user.id)).limit(1);
  res.json({ user: updatedUser });
});

app.delete('/api/users/me', authenticateToken, async (req: Request, res: Response) => {
  const uid = req.user.id;
  const phone = req.user.phone;

  // Manual deletions for non-strictly linked tables
  await db.delete(schema.otps).where(eq(schema.otps.phone, phone));
  await db.delete(schema.listings).where(eq(schema.listings.providerId, uid));
  // Cascading deletes on schema will clean up providers, bookings, and payments, but let's be explicit
  await db.delete(schema.providers).where(eq(schema.providers.userId, uid));
  await db.delete(schema.bookings).where(eq(schema.bookings.userId, uid));
  await db.delete(schema.payments).where(eq(schema.payments.userId, uid));
  await db.delete(schema.users).where(eq(schema.users.id, uid));

  res.json({ deleted: true });
});

// ============ PROVIDER ONBOARDING ============
app.post('/api/providers/onboard', authenticateToken, async (req: Request, res: Response) => {
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

  // Construct snake_case return for frontend compatibility
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

app.get('/api/providers/me', authenticateToken, async (req: Request, res: Response) => {
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

// ============ LISTINGS ============
app.get('/api/listings', async (req: Request, res: Response) => {
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

  // Return mapped array with frontend-expected names
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

app.get('/api/listings/:id', async (req: Request, res: Response) => {
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

app.post('/api/listings', authenticateToken, async (req: Request, res: Response) => {
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

// ============ BOOKINGS ============
app.post('/api/bookings', authenticateToken, async (req: Request, res: Response) => {
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

app.get('/api/bookings/me', authenticateToken, async (req: Request, res: Response) => {
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

app.get('/api/bookings/provider', authenticateToken, async (req: Request, res: Response) => {
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

// ============ PAYMENTS ============
app.post('/api/payments/order', authenticateToken, async (req: Request, res: Response) => {
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

app.post('/api/payments/mock/complete', authenticateToken, rateLimiter(10, 60 * 1000, 'mock_complete'), async (req: Request, res: Response) => {
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

app.post('/api/payments/verify', authenticateToken, async (req: Request, res: Response) => {
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

// ============ ADMIN / DEV / SEED ============
app.post('/api/dev/seed', async (req: Request, res: Response) => {
  if (IS_PROD) {
    return res.status(403).json({ detail: 'Not available in production' });
  }

  let inserted = 0;
  for (const item of SEED_LISTINGS) {
    const exists = await db.select()
      .from(schema.listings)
      .where(and(eq(schema.listings.title, item.title), eq(schema.listings.type, item.type)))
      .limit(1);

    if (exists.length > 0) {
      continue;
    }

    const doc = {
      id: uuidv4(),
      title: item.title,
      type: item.type,
      description: item.description,
      location: item.location,
      price: item.price,
      image: item.image,
      tags: item.tags,
      providerId: 'admin-seed-provider',
      extras: item.extras || {},
      createdAt: new Date().toISOString()
    };
    await db.insert(schema.listings).values(doc);
    inserted++;
  }

  res.json({ seeded: inserted, total_in_seed: SEED_LISTINGS.length });
});

app.post('/api/admin/seed', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  let inserted = 0;
  for (const item of SEED_LISTINGS) {
    const exists = await db.select()
      .from(schema.listings)
      .where(and(eq(schema.listings.title, item.title), eq(schema.listings.type, item.type)))
      .limit(1);

    if (exists.length > 0) {
      continue;
    }

    const doc = {
      id: uuidv4(),
      title: item.title,
      type: item.type,
      description: item.description,
      location: item.location,
      price: item.price,
      image: item.image,
      tags: item.tags,
      providerId: 'admin-seed-provider',
      extras: item.extras || {},
      createdAt: new Date().toISOString()
    };
    await db.insert(schema.listings).values(doc);
    inserted++;
  }

  res.json({ seeded: inserted, total_in_seed: SEED_LISTINGS.length });
});

app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const usersCount = await db.select({ value: count() }).from(schema.users);
  const providersCount = await db.select({ value: count() }).from(schema.providers);
  const listingsCount = await db.select({ value: count() }).from(schema.listings);
  const bookingsCount = await db.select({ value: count() }).from(schema.bookings);
  const paymentsCount = await db.select({ value: count() }).from(schema.payments).where(eq(schema.payments.status, 'paid'));

  res.json({
    users: usersCount[0]?.value || 0,
    providers: providersCount[0]?.value || 0,
    listings: listingsCount[0]?.value || 0,
    bookings: bookingsCount[0]?.value || 0,
    payments: paymentsCount[0]?.value || 0
  });
});

app.post('/api/admin/bootstrap', rateLimiter(3, 60 * 60 * 1000, 'admin_bootstrap'), authenticateToken, async (req: Request, res: Response) => {
  const { secret } = req.body;
  const adminCountResult = await db.select({ value: count() }).from(schema.users).where(eq(schema.users.role, 'admin'));
  const adminCount = adminCountResult[0]?.value || 0;

  if (adminCount > 0) {
    return res.status(403).json({ detail: 'Admin already exists' });
  }

  const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET || '';
  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(403).json({ detail: 'Invalid bootstrap secret' });
  }

  await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, req.user.id));
  res.json({ ok: true, user_id: req.user.id });
});

// ============ SERVER INIT ============
const PORT = process.env.PORT || 8000;
const server = app.listen(PORT, () => {
  log.info(`Server running on http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  log.info('SIGTERM signal received. Shutting down gracefully.');
  server.close(() => {
    pool.end(() => {
      log.info('Database pool shut down. Server stopped.');
    });
  });
});
