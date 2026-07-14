import { pgTable, text, integer, boolean, numeric, jsonb } from 'drizzle-orm/pg-core';

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
});

export const otps = pgTable('otps', {
  phone: text('phone').primaryKey(),
  otp: text('otp').notNull(),
  channel: text('channel').notNull(),
  createdAt: text('created_at').notNull(),
});

export const providers = pgTable('providers', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  businessName: text('business_name').notNull(),
  businessType: text('business_type').notNull(),
  description: text('description').notNull(),
  location: text('location').notNull(),
  contactPhone: text('contact_phone').notNull(),
  priceFrom: integer('price_from').default(0).notNull(),
  images: jsonb('images').$type<string[]>().default([]).notNull(),
  extras: jsonb('extras').$type<Record<string, any>>().default({}).notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  activatedAt: text('activated_at'),
});

export const listings = pgTable('listings', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  type: text('type').notNull(),
  description: text('description').notNull(),
  location: text('location').notNull(),
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
