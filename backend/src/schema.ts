import { pgTable, text, integer, boolean, numeric, jsonb, doublePrecision, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  phone: text('phone').unique().notNull(),
  name: text('name').notNull(),
  role: text('role').notNull(), // 'tourist' | 'provider' | 'admin'
  providerPaid: boolean('provider_paid').default(false).notNull(),
  email: text('email'),
  language: text('language'),
  avatar: text('avatar'),
  createdAt: text('created_at').notNull(),
  password: text('password'),
});

export const otps = pgTable('otps', {
  phone: text('phone').primaryKey(),
  otp: text('otp').notNull(),
  channel: text('channel').notNull(),
  createdAt: text('created_at').notNull(),
  // Wrong guesses against the current code. Reset to 0 whenever a new code is issued.
  attempts: integer('attempts').notNull().default(0),
});

export const providers = pgTable('providers', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  businessName: text('business_name').notNull(),
  businessType: text('business_type').notNull(),
  description: text('description').notNull(),
  location: text('location').notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  contactPhone: text('contact_phone').notNull(),
  priceFrom: integer('price_from').default(0).notNull(),
  images: jsonb('images').$type<string[]>().default([]).notNull(),
  extras: jsonb('extras').$type<Record<string, any>>().default({}).notNull(),
  status: text('status').notNull(),
  kycStatus: text('kyc_status').default('none').notNull(),
  createdAt: text('created_at').notNull(),
  activatedAt: text('activated_at'),
}, (t) => ({
  // At most one provider row per user, ever — enforced at the DB level so the onboard route's
  // read-then-write conflict check can't lose a race (two concurrent onboards both reading "no
  // existing row" and both inserting). Also closes the status hole where only 'active' and
  // 'pending_payment' were checked in app code: a 'suspended' provider could otherwise create a
  // second row, reintroducing the nondeterministic-attribution problem this index exists to
  // prevent.
  userIdUnique: uniqueIndex('providers_user_id_unique').on(t.userId),
}));

export const listings = pgTable('listings', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  type: text('type').notNull(),
  description: text('description').notNull(),
  location: text('location').notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  price: integer('price').default(0).notNull(),
  image: text('image').default('').notNull(),
  tags: jsonb('tags').$type<string[]>().default([]).notNull(),
  providerId: text('provider_id').notNull(), // text (can be user_id or provider_id)
  extras: jsonb('extras').$type<Record<string, any>>().default({}).notNull(),
  createdAt: text('created_at').notNull(),
});

export const bookings = pgTable('bookings', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  listingId: text('listing_id').references(() => listings.id, { onDelete: 'cascade' }).notNull(),
  listingType: text('listing_type').notNull(),
  listingTitle: text('listing_title').notNull(),
  checkIn: text('check_in'),
  checkOut: text('check_out'),
  guests: integer('guests').default(1).notNull(),
  notes: text('notes').default('').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  confirmedAt: text('confirmed_at'),
});

export const favorites = pgTable('favorites', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  listingId: text('listing_id').references(() => listings.id, { onDelete: 'cascade' }).notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  // A user can favorite a listing at most once — enforced at the DB level so a double-tap or two
  // concurrent POSTs can't create duplicate rows (the add route relies on this via onConflictDoNothing).
  userListingUnique: uniqueIndex('favorites_user_id_listing_id_unique').on(t.userId, t.listingId),
}));

export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  flow: text('flow').notNull(),
  referenceId: text('reference_id').notNull(),
  amount: integer('amount').notNull(),
  orderId: text('order_id').unique().notNull(),
  status: text('status').notNull(),
  paymentId: text('payment_id'),
  signature: text('signature'),
  mock: boolean('mock').default(false).notNull(),
  createdAt: text('created_at').notNull(),
  paidAt: text('paid_at'),
});

export const kycDocuments = pgTable('kyc_documents', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').references(() => providers.id, { onDelete: 'cascade' }).notNull(),
  docType: text('doc_type').notNull(),
  fileKey: text('file_key').notNull(),        // object key in the PRIVATE bucket — never a public URL
  contentType: text('content_type').notNull(),
  status: text('status').notNull(),           // 'pending' | 'approved' | 'rejected'
  rejectionReason: text('rejection_reason'),
  uploadedAt: text('uploaded_at').notNull(),
  reviewedAt: text('reviewed_at'),
  reviewedBy: text('reviewed_by'),
}, (t) => ({
  // Exactly one row per (provider, docType) — enforced at the DB level so concurrent uploads
  // of the same docType can't both insert, which previously let approved/pending duplicates
  // coexist and made the Verified badge flap depending on unordered row read order.
  providerDocTypeUnique: uniqueIndex('kyc_documents_provider_doc_type_unique').on(t.providerId, t.docType),
}));
