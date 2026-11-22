import { pgTable, text, integer, boolean, numeric, jsonb, doublePrecision, uniqueIndex, index, primaryKey } from 'drizzle-orm/pg-core';

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
  // Tourist platform support & convenience fee. null = never paid. Active while > now().
  supportExpiresAt: text('support_expires_at'),
  password: text('password'),
  // Set atomically after a successful WhatsApp OTP verification.
  phoneVerifiedAt: text('phone_verified_at'),
  // When they ticked "I Agree" (Terms + Privacy Policy, 18 or older) on the sign-in screen. Kept as
  // the record of consent the DPDP Act asks for. null = signed up before the box existed, or from
  // an app version that does not send it yet.
  termsAcceptedAt: text('terms_accepted_at'),
  // The user's own invite code. Server-generated and unique  the app used to derive one from
  // the first name (`ASHA-1D`), which collides on every second Asha and could not be looked up.
  // Nullable because rows created before referrals existed have none until they are backfilled.
  referralCode: text('referral_code').unique(),
  // What the traveller picked on the "pick your vibe" screen (ids like 'nature', 'food'). Kept on
  // the account so it survives a reinstall or a second phone; the client owns the vocabulary.
  interests: jsonb('interests').$type<string[]>().default([]).notNull(),
  // The traveller profile from the board ("Profile Setup"). All optional; checked in
  // lib/travellerProfile.ts. Age is kept as a birth year so it stays right as years pass.
  whatsapp: text('whatsapp'),
  gender: text('gender'),
  birthYear: integer('birth_year'),
  address: text('address'),
  pincode: text('pincode'),
  likedFoods: jsonb('liked_foods').$type<string[]>().default([]).notNull(),
  travellerType: text('traveller_type'),
  diet: text('diet'),
});

/**
 * The in-app activity feed. One row per event a user should see, written server-side when the
 * thing happens, so a host accepting a request reaches a guest whose app is closed.
 */
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  // 'booking_accepted' | 'booking_confirmed' | 'booking_cancelled' | 'booking_request' | ...
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  // The booking (or other row) this is about, so the app can deep-link.
  refId: text('ref_id'),
  // The message as a key + details ({ key: 'request_accepted', params: { place } }), so the
  // website and app can show it in the reader's language. title/body stay the English text.
  msg: jsonb('msg').$type<{ key: string; params?: Record<string, string | number> }>(),
  // Where tapping it leads, for messages the team sends (broadcasts): a screen key such as 'feed'
  // or an https address. Booking notices leave it empty and are routed by kind + refId.
  link: text('link'),
  readAt: text('read_at'),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  userCreatedIdx: index('notifications_user_id_created_at_idx').on(t.userId, t.createdAt),
}));

/**
 * Messages the team sends from the admin panel (Notifications page): one row per send. Each
 * recipient also gets a `notifications` row (kind 'announcement', ref_id = this id) and a push.
 */
export const broadcasts = pgTable('broadcasts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  link: text('link'),
  // 'everyone' | 'travellers' | 'hosts' | 'person'; business_type narrows 'hosts'.
  audience: text('audience').notNull(),
  businessType: text('business_type'),
  phone: text('phone'),
  recipients: integer('recipients').default(0).notNull(),
  devices: integer('devices').default(0).notNull(),
  pushed: integer('pushed').default(0).notNull(),
  pushFailed: integer('push_failed').default(0).notNull(),
  // 'sending' while phone pushes go out, then 'sent'.
  status: text('status').notNull(),
  // The admin's user id; not a foreign key, because the built-in admin login ('admin-system') has no row.
  sentBy: text('sent_by'),
  createdAt: text('created_at').notNull(),
  finishedAt: text('finished_at'),
}, (t) => ({
  createdIdx: index('broadcasts_created_at_idx').on(t.createdAt),
}));

/**
 * Expo push tokens, one row per device. lib/push.ts sends every in-app notification to them.
 */
export const pushTokens = pgTable('push_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  token: text('token').notNull().unique(),
  platform: text('platform').notNull(), // 'ios' | 'android' | 'web'
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => ({
  userIdx: index('push_tokens_user_id_idx').on(t.userId),
}));

/**
 * Who invited whom, and what it bought them.
 *
 * One row per successful referral, written once at the moment the invited account is created.
 * The reward is applied in the same transaction and recorded here rather than recomputed, so
 * "why is this pass valid until 2028" has an answer that survives a change to the reward rule.
 */
export const referrals = pgTable('referrals', {
  id: text('id').primaryKey(),
  referrerId: text('referrer_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  // Unique: an account can be referred exactly once, at signup. Enforced at the DB level rather
  // than by a read-then-write check, which two concurrent registrations could both pass.
  refereeId: text('referee_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  // The code as it was typed, kept for support questions after a user changes their code.
  code: text('code').notNull(),
  // What each side actually received, so the ledger explains the expiry it produced.
  rewardDays: integer('reward_days').notNull(),
  createdAt: text('created_at').notNull(),
});

/**
 * A referral code the aangan team makes (admin → Referrals), as opposed to the one every user has.
 * Typically one per person who brings people in ("amitAangan26" for Amit), or per poster or partner,
 * so the report can say how many travellers and hosts each one brought. Matched without case or
 * dashes (`codeKey`); `code` keeps the spelling the admin typed, for display.
 */
export const referralCampaigns = pgTable('referral_campaigns', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  // Upper case, letters and digits only: "amit-Aangan26" and "AMITAANGAN26" are the same code.
  codeKey: text('code_key').notNull().unique(),
  // Who or what it is for, e.g. "Amit, field team Mirik".
  name: text('name').notNull(),
  // Who it counts for: 'any' | 'traveller' | 'host'. A code for hosts typed by a traveller is not recorded.
  audience: text('audience').default('any').notNull(),
  // Extra pass days a traveller gets for signing up with it. 0 = the code only counts sign-ups.
  rewardDays: integer('reward_days').default(0).notNull(),
  // Optional limits: after this date, or this many sign-ups, the code stops counting new ones.
  endsAt: text('ends_at'),
  maxUses: integer('max_uses'),
  active: boolean('active').default(true).notNull(),
  createdBy: text('created_by'),
  createdAt: text('created_at').notNull(),
});

/** One row per account that signed up with a campaign code (unique: an account counts once). */
export const campaignSignups = pgTable('campaign_signups', {
  id: text('id').primaryKey(),
  campaignId: text('campaign_id').references(() => referralCampaigns.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull().unique(),
  // How the account signed up: 'traveller' | 'host'. Whether a host went live is read from providers.
  joinedAs: text('joined_as').notNull(),
  rewardDays: integer('reward_days').default(0).notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  campaignIdx: index('campaign_signups_campaign_id_idx').on(t.campaignId),
}));

export const vouchers = pgTable('vouchers', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  discountPercentage: integer('discount_percentage').notNull(),
  tier: integer('tier').notNull(),
  status: text('status').notNull(), // 'available' | 'used'
  usedAt: text('used_at'),
  usedOnBookingId: text('used_on_booking_id'),
  createdAt: text('created_at').notNull(),
});

export const otps = pgTable('otps', {
  id: text('id').primaryKey(),
  phone: text('phone').notNull(),
  otpHash: text('otp_hash').notNull(),
  channel: text('channel').notNull(),
  createdAt: text('created_at').notNull(),
  // Wrong guesses against THIS challenge. Each send inserts its own row starting at 0 rather
  // than resetting an existing one, so a spent challenge keeps its count until it expires.
  attempts: integer('attempts').notNull().default(0),
  consumedAt: text('consumed_at'),
  expiresAt: text('expires_at').notNull(),
});

/** Interakt delivery events, deduplicated by the opaque callback plus event type. */
export const interaktDeliveryEvents = pgTable('interakt_delivery_events', {
  id: text('id').primaryKey(),
  callbackData: text('callback_data').notNull(),
  eventType: text('event_type').notNull(),
  receivedAt: text('received_at').notNull(),
}, (t) => ({
  callbackEventUnique: uniqueIndex('interakt_delivery_events_callback_event_unique').on(t.callbackData, t.eventType),
}));

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
  // End of the host's current paid year (₹499 a year, or ₹99 for cafes, shops and guides, plus GST
  // and the platform fee; see lib/pricing.ts). Null until
  // the first payment settles. Once it passes, the host's listings leave the public feed until
  // they renew. See lib/hostPlan.ts.
  planExpiresAt: text('plan_expires_at'),
  // True for hosts who registered once admin approval was introduced: their listings stay out of
  // the public feed, and refuse bookings, until kyc_status is 'verified'. Hosts who were already
  // live keep the default (false) so the change cut nobody off. See lib/hostPlan.ts.
  approvalRequired: boolean('approval_required').default(false).notNull(),
  // True while a host lists for free (no payment yet). The grace ends after HOST_GRACE_BOOKINGS
  // completed bookings plus delivered orders: new bookings then pause until the host pays the
  // first year (provider_registration), which sets this back to false. See lib/hostGrace.ts.
  grace: boolean('grace').default(false).notNull(),
  // Written on the first administrator decision, so a submitted queue is not misrepresented as
  // an active human review.
  kycReviewStartedAt: text('kyc_review_started_at'),
  // The host's public page address: aanganerp.in/<business_type>/<slug> (board: "all profiles
  // should look like individual websites"). Made from the business name, unique, see
  // lib/providerSlug.ts.
  slug: text('slug'),
}, (t) => ({
  slugUnique: uniqueIndex('providers_slug_unique').on(t.slug),
  // At most one provider row per user, ever  enforced at the DB level so the onboard route's
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
  // A driver booking's route, picked from the driver's own routes ("NJP -> Darjeeling"). Feeds the
  // host dashboard's km and locations covered. Null for other bookings.
  routeName: text('route_name'),
  /** A guide booking: which of the guide's services the traveller asked for (board: "Asking for given items"). */
  services: jsonb('services').$type<string[]>().default([]).notNull(),
  // 'pending_payment' | 'accepted' | 'confirmed' | 'cancelled'.
  //
  // `accepted` is the host's answer to a request: they have agreed to take the booking, but the
  // guest has not paid yet, so it is not `confirmed`. Payment is what confirms  that has not
  // changed. An instant-confirm rate skips `accepted` entirely, going straight from
  // pending_payment to confirmed when the commission settles.
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  confirmedAt: text('confirmed_at'),
  // When the host accepted. Null on an instant booking, which no host ever saw.
  acceptedAt: text('accepted_at'),
  // Who has actually been told this booking is confirmed. Null means "not notified"  which used
  // to be the silent, invisible state of EVERY production booking (see INVESTIGATION.md §6.A):
  // the guest paid, the row said confirmed, and nobody was ever informed. Persisting the outcome
  // is what turns a failed notification into something an operator can find and re-send, rather
  // than something discovered when a guest arrives at an unprepared homestay.
  touristNotifiedAt: text('tourist_notified_at'),
  providerNotifiedAt: text('provider_notified_at'),
  // Last delivery error, kept so the admin console can show why a notification is missing.
  notifyError: text('notify_error'),
  // Voucher used on this booking.
  voucherId: text('voucher_id'),
  // Discount percentage applied (e.g. 10 for 10%) so the host knows they need to collect 10% less.
  appliedDiscount: integer('applied_discount'),

  // Homestay: the room asked for (one of the host's profile rooms) and its nightly price at booking time.
  roomName: text('room_name'),
  roomPrice: integer('room_price'),
  // Driver: where and when to pick up, where to drop, how many days on a day-rate route, and the
  // fare quoted to the traveller when they asked (route price, or day rate x days).
  pickupPlace: text('pickup_place'),
  dropPlace: text('drop_place'),
  pickupTime: text('pickup_time'),
  days: integer('days'),
  quotedFare: integer('quoted_fare'),

  // Cancelling (prototype cancel.js): who cancelled ('guest' | 'host' | 'admin'), the reason code and
  // an optional note, when, whether it was late (under 24 h before the trip), and whether it was a
  // host declining a request rather than cancelling a booking.
  cancelReason: text('cancel_reason'),
  cancelNote: text('cancel_note'),
  cancelledBy: text('cancelled_by'),
  cancelledAt: text('cancelled_at'),
  cancelLate: boolean('cancel_late').default(false).notNull(),
  declined: boolean('declined').default(false).notNull(),
  // A guest asking to cancel a confirmed booking; the host accepts (cancels) or keeps it.
  cancelRequestedAt: text('cancel_requested_at'),
  cancelRequestReason: text('cancel_request_reason'),
  cancelRequestNote: text('cancel_request_note'),
});

export const favorites = pgTable('favorites', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  listingId: text('listing_id').references(() => listings.id, { onDelete: 'cascade' }).notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  // A user can favorite a listing at most once  enforced at the DB level so a double-tap or two
  // concurrent POSTs can't create duplicate rows (the add route relies on this via onConflictDoNothing).
  userListingUnique: uniqueIndex('favorites_user_id_listing_id_unique').on(t.userId, t.listingId),
}));

export const reviews = pgTable('reviews', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  listingId: text('listing_id').references(() => listings.id, { onDelete: 'cascade' }).notNull(),
  rating: integer('rating').notNull(), // 1..5, validated in the route
  comment: text('comment').default('').notNull(),
  photos: jsonb('photos').$type<string[]>().default([]).notNull(),
  authorName: text('author_name').notNull(), // snapshot of the reviewer's name at write time
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
}, (t) => ({
  // One review per (user, listing)  a second submit edits the first (upsert) instead of stacking.
  userListingUnique: uniqueIndex('reviews_user_id_listing_id_unique').on(t.userId, t.listingId),
  // Listing detail and the rating aggregates both read reviews by listing, so index that lookup.
  listingIdx: index('reviews_listing_id_idx').on(t.listingId),
}));

export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  flow: text('flow').notNull(),
  referenceId: text('reference_id').notNull(),
  amount: integer('amount').notNull(),
  // Base, GST, platform fee and total in paise at the time of the order (lib/pricing.ts). Null on
  // donations and on orders made before the breakup existed.
  breakup: jsonb('breakup').$type<{ base: number; gst: number; platform_fee: number; total: number; gst_rate: number; platform_fee_rate: number }>(),
  orderId: text('order_id').unique().notNull(),
  status: text('status').notNull(),
  paymentId: text('payment_id'),
  signature: text('signature'),
  mock: boolean('mock').default(false).notNull(),
  createdAt: text('created_at').notNull(),
  paidAt: text('paid_at'),
  // Refund trail. `status` becomes 'refunded' only once the gateway has accepted; a row that is
  // still 'paid' but carries a refundReason is money the platform owes and has not returned 
  // that combination is exactly what listUnreturnedPayments() reports. See lib/refunds.ts.
  refundId: text('refund_id'),
  refundedAt: text('refunded_at'),
  refundAmount: integer('refund_amount'),
  refundReason: text('refund_reason'),
  refundError: text('refund_error'),
});

export const kycDocuments = pgTable('kyc_documents', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').references(() => providers.id, { onDelete: 'cascade' }).notNull(),
  docType: text('doc_type').notNull(),
  fileKey: text('file_key').notNull(),        // object key in the PRIVATE bucket  never a public URL
  contentType: text('content_type').notNull(),
  status: text('status').notNull(),           // 'pending' | 'approved' | 'rejected'
  rejectionReason: text('rejection_reason'),
  uploadedAt: text('uploaded_at').notNull(),
  reviewedAt: text('reviewed_at'),
  reviewedBy: text('reviewed_by'),
}, (t) => ({
  // Exactly one row per (provider, docType)  enforced at the DB level so concurrent uploads
  // of the same docType can't both insert, which previously let approved/pending duplicates
  // coexist and made the Verified badge flap depending on unordered row read order.
  providerDocTypeUnique: uniqueIndex('kyc_documents_provider_doc_type_unique').on(t.providerId, t.docType),
}));

// Durable daily counters for OTP sends. Separate from middleware/rateLimiter.ts on purpose: that
// limiter is in-memory and per-process, so its windows reset on every deploy and are invisible to
// a second container. That is acceptable for a per-minute burst guard and useless for a daily
// spend cap, which is what stands between a real SMS provider and a billing attack  an attacker
// who can trigger a redeploy, or simply wait one out, gets a fresh budget.
//
// One row per (scope, day). `scope` is either 'global' or `phone:<number>`; keeping both in one
// table means one insert shape and one sweep rather than two of each.
export const otpSendCounters = pgTable('otp_send_counters', {
  scope: text('scope').notNull(),
  // 'YYYY-MM-DD', UTC. Text, like every other date in this schema.
  day: text('day').notNull(),
  count: integer('count').notNull().default(0),
}, (t) => ({
  scopeDayPk: primaryKey({ columns: [t.scope, t.day] }),
}));

/**
 * Home-screen promotion cards ("Trending"). Editable by an admin without a client release; the
 * app keeps a built-in set to fall back on when none are active or the server is unreachable.
 */
export const promotions = pgTable('promotions', {
  id: text('id').primaryKey(),
  tag: text('tag').notNull(), // the small pill, e.g. '25% OFF'
  title: text('title').notNull(),
  subtitle: text('subtitle').notNull(),
  image: text('image').notNull(),
  // An in-app path such as '/category/homestay'.
  link: text('link').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: text('created_at').notNull(),
});

/**
 * Something a signed-in person flagged as abusive, false or unsafe: a listing or a review. App
 * Store and Play both require a way to report user content; an admin reviews these and resolves
 * them. One open report per (reporter, target), so a repeated tap does not stack duplicates.
 */
export const reports = pgTable('reports', {
  id: text('id').primaryKey(),
  reporterId: text('reporter_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  targetType: text('target_type').notNull(), // 'listing' | 'review'
  targetId: text('target_id').notNull(),
  reason: text('reason').notNull(), // one of REPORT_REASONS in routes/reports.ts
  details: text('details').default('').notNull(),
  status: text('status').default('open').notNull(), // 'open' | 'resolved'
  createdAt: text('created_at').notNull(),
  resolvedAt: text('resolved_at'),
}, (t) => ({
  reporterTargetUnique: uniqueIndex('reports_reporter_target_unique').on(t.reporterId, t.targetType, t.targetId),
  statusIdx: index('reports_status_idx').on(t.status),
}));

/** Private product feedback from a host to the aangan team. */
export const hostFeedback = pgTable('host_feedback', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  providerId: text('provider_id').references(() => providers.id, { onDelete: 'cascade' }).notNull(),
  message: text('message').notNull(),
  status: text('status').default('open').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  providerCreatedIdx: index('host_feedback_provider_created_at_idx').on(t.providerId, t.createdAt),
}));

/**
 * A traveller asking a cafe, restaurant or shop to deliver (board: "Asking for home delivery").
 * The host answers accepted / declined, then marks it delivered; each side is told in-app.
 */
export const deliveryRequests = pgTable('delivery_requests', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  listingId: text('listing_id').references(() => listings.id, { onDelete: 'cascade' }).notNull(),
  providerId: text('provider_id').notNull(),
  items: jsonb('items').$type<{ name: string; qty: number; price?: number }[]>().default([]).notNull(),
  address: text('address').notNull(),
  phone: text('phone').notNull(),
  note: text('note').default('').notNull(),
  // 'open' | 'accepted' | 'declined' | 'delivered' | 'cancelled'
  status: text('status').default('open').notNull(),
  hostNote: text('host_note'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
}, (t) => ({
  providerIdx: index('delivery_requests_provider_created_idx').on(t.providerId, t.createdAt),
  userIdx: index('delivery_requests_user_created_idx').on(t.userId, t.createdAt),
}));

/** Feedback for aangan itself, from anyone signed in (the board's traveller dashboard). */
export const appFeedback = pgTable('app_feedback', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  rating: integer('rating'),
  message: text('message').notNull(),
  // Set when the suggestion came with a review after a finished trip.
  bookingId: text('booking_id'),
  status: text('status').default('open').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  userCreatedIdx: index('app_feedback_user_created_at_idx').on(t.userId, t.createdAt),
}));

/**
 * A person this user no longer wants to see. Their reviews are left out of every review list the
 * blocker reads. Required alongside reporting for apps with user-generated content.
 */
export const userBlocks = pgTable('user_blocks', {
  blockerId: text('blocker_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  blockedId: text('blocked_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.blockerId, t.blockedId] }),
}));

/**
 * The host feed: short posts a host writes about their place (what makes it special, what is new,
 * what is in season). Anyone can read them; only a live, verified host can write them. A post
 * leaves the feed on its own while its host's plan has lapsed or approval is pending, and an
 * admin can hide one (`hiddenAt`) after a report without deleting it.
 */
export const hostPosts = pgTable('host_posts', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').references(() => providers.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  body: text('body').notNull(),
  photos: jsonb('photos').$type<string[]>().default([]).notNull(),
  // Optional: the listing the post is about. Kept when the listing goes, as plain text without it.
  listingId: text('listing_id').references(() => listings.id, { onDelete: 'set null' }),
  // 'update' | 'offer' | 'event' | 'photo' (prototype feed.js post kinds).
  kind: text('kind').default('update').notNull(),
  hiddenAt: text('hidden_at'),
  hiddenReason: text('hidden_reason'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
}, (t) => ({
  createdIdx: index('host_posts_created_at_idx').on(t.createdAt),
  providerIdx: index('host_posts_provider_id_idx').on(t.providerId),
}));

/** A reader's reaction on a host post: one per person per post (see POST_REACTIONS in routes/posts.ts). */
export const postReactions = pgTable('post_reactions', {
  postId: text('post_id').references(() => hostPosts.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  // Which reaction. Every like from before reactions existed is a heart.
  kind: text('kind').default('heart').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.postId, t.userId] }),
}));

/** A comment on a host post. The writer, the post's author or an admin can delete it. */
export const postComments = pgTable('post_comments', {
  id: text('id').primaryKey(),
  postId: text('post_id').references(() => hostPosts.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  postIdx: index('post_comments_post_id_idx').on(t.postId, t.createdAt),
}));

/**
 * Co-owners of a business (the board's "Multiple Owners"). The main owner adds someone by phone;
 * when that number signs in with its WhatsApp OTP it can run the same business: listings,
 * bookings, profile, documents and posts. Paying for the plan and adding or removing owners stay
 * with the main owner (`providers.user_id`). `phoneKey` is the canonical number (lib/phone.ts),
 * so "+91 98765 43210" and "9876543210" are one person; `userId` is filled once they sign in.
 */
export const providerMembers = pgTable('provider_members', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').references(() => providers.id, { onDelete: 'cascade' }).notNull(),
  phoneKey: text('phone_key').notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name'),
  role: text('role').default('co_owner').notNull(),
  addedBy: text('added_by').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  providerPhoneUnique: uniqueIndex('provider_members_provider_phone_unique').on(t.providerId, t.phoneKey),
  phoneIdx: index('provider_members_phone_key_idx').on(t.phoneKey),
  userIdx: index('provider_members_user_id_idx').on(t.userId),
}));

/**
 * Shared trip plans (prototype plans.js): a traveller plans stops over some days, optionally with a
 * homestay and a driver from aangan, posts it to the Feed, and others ask to join or save it.
 * The organiser's phone is never stored on the plan; contact goes through the app.
 */
export const tripPlans = pgTable('trip_plans', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  cover: text('cover'),
  // Stops in travel order, and per-day notes.
  stops: jsonb('stops').$type<{ place: string; note?: string }[]>().default([]).notNull(),
  days: jsonb('days').$type<{ day: number; text: string }[]>().default([]).notNull(),
  startDate: text('start_date'),
  nights: integer('nights').default(1).notNull(),
  stayListingId: text('stay_listing_id').references(() => listings.id, { onDelete: 'set null' }),
  driverListingId: text('driver_listing_id').references(() => listings.id, { onDelete: 'set null' }),
  // How many people the plan is for, including the organiser.
  seats: integer('seats').default(2).notNull(),
  // Cost per person in rupees, as the organiser worked it out.
  costPerPerson: integer('cost_per_person'),
  notes: text('notes').default('').notNull(),
  // 'public' (in the Feed) or 'private' (only the organiser).
  visibility: text('visibility').default('public').notNull(),
  hiddenAt: text('hidden_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at'),
}, (t) => ({
  createdIdx: index('trip_plans_created_at_idx').on(t.createdAt),
  userIdx: index('trip_plans_user_id_idx').on(t.userId),
}));

/** People who asked to join a plan: 'pending' until the organiser accepts ('accepted') or declines ('declined'). */
export const tripPlanMembers = pgTable('trip_plan_members', {
  planId: text('plan_id').references(() => tripPlans.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  status: text('status').default('pending').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.planId, t.userId] }),
}));

/** Plans a traveller saved for later. */
export const tripPlanSaves = pgTable('trip_plan_saves', {
  planId: text('plan_id').references(() => tripPlans.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.planId, t.userId] }),
}));

/**
 * A traveller suggesting a place to see (prototype spots.js, Suggest a place). The team reviews it;
 * approving creates an unpublished spot listing the team can finish and publish.
 */
export const placeSuggestions = pgTable('place_suggestions', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  place: text('place').notNull(),
  details: text('details').default('').notNull(),
  entryPrice: integer('entry_price'),
  photos: jsonb('photos').$type<string[]>().default([]).notNull(),
  // 'pending' | 'approved' | 'rejected'
  status: text('status').default('pending').notNull(),
  reviewNote: text('review_note'),
  listingId: text('listing_id').references(() => listings.id, { onDelete: 'set null' }),
  createdAt: text('created_at').notNull(),
  reviewedAt: text('reviewed_at'),
  reviewedBy: text('reviewed_by'),
}, (t) => ({
  statusIdx: index('place_suggestions_status_idx').on(t.status, t.createdAt),
  userIdx: index('place_suggestions_user_id_idx').on(t.userId),
}));
