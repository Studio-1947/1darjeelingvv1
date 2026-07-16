# 1 Darjeeling — Product Requirements Document

> Rewritten 2026-07-16 against the actual codebase. The previous version of this document described a FastAPI + MongoDB backend that no longer exists (see `INVESTIGATION.md` §2.1 in the repo root) — everything below is verified against `backend/src/*`, `frontend/src/*`, and `frontend-admin/src/*` as they stand today, not against an earlier design doc.

---

## 1. What this is

**1 Darjeeling** ("One Darjeeling. Every experience.") is a full-stack tourism + local-marketplace web app for the Darjeeling hill region. It gives tourists a single discovery feed for the things they'd otherwise piece together from scattered blogs and word-of-mouth — sightseeing spots, homestays, local drivers, shops, cafes, cultural events, and biodiversity/wildlife info — and gives local businesses ("providers") a lightweight way to list themselves and receive bookings, without needing their own website.

It ships as three separate apps sharing one backend:
- **`frontend/`** — the public-facing tourist + provider web app (installable as a PWA)
- **`frontend-admin/`** — an internal ops dashboard (seed data, manage users/listings/providers/bookings/payments)
- **`backend/`** — the REST API both of the above talk to

## 2. Problem statement

Darjeeling tourism today is fragmented across informal channels — WhatsApp groups, word-of-mouth driver recommendations, unofficial homestay listings. There's no single place for a tourist to discover *and* book across categories, and no low-friction way for a small local business (a homestay with 3 rooms, a single driver, a family-run cafe) to get discovered online. 1 Darjeeling addresses both sides: a discovery-first app for tourists, and a near-zero-setup onboarding flow for providers.

## 3. Personas

| Persona | Who | What they do in the app |
|---|---|---|
| **Tourist** | Visitor planning or currently on a Darjeeling trip | Browses the discovery feed and category grids, views listing details, books homestays/drivers/spots, tracks bookings in a personal dashboard |
| **Service Provider** | Homestay/driver/shop/cafe owner | Onboards their business (one-time fee), manages their listing(s), sees incoming bookings + revenue in a provider dashboard |
| **Admin** | Internal ops/team member | Seeds/manages listings, moderates users and providers, reviews platform-wide stats and payments — via the separate `frontend-admin` app |

## 4. Core user journeys

### Tourist
1. Lands on **Discover** (`/`) — story-style avatar rail, a booking widget (Homestays/Drivers/Spots tabs), gradient deal cards, a horizontal spot rail, homestay quick-picks, and an Instagram-style feed of listings.
2. Drills into a **Category** page (`/spots`, `/homestays`, `/drivers`, `/shops`, `/cafes`, `/events`, `/biodiversity`) — grid or feed view, search, contextual CTA per tile (Book Now / Talk to Driver / Visit Shop / Join Event / Learn More / Explore).
3. Opens **Listing Detail** — hero image, heart/share, Get Directions (Google Maps deep link) + Call Now, and a booking sidebar (desktop) / sticky bottom bar (mobile) with the category-appropriate primary action.
4. **Logs in** via phone + OTP if not already (see §6).
5. **Books** (homestay/driver) — submits check-in/check-out (homestay only, validated check-out > check-in), guest count, notes → booking created as `pending_payment` → pays the ₹1 platform fee (see §7) → booking flips to `confirmed`, both tourist and provider see a **Booking Confirmation** screen (listing summary, booking ID with copy button, host contact with Call/WhatsApp CTAs).
6. Tracks everything from the **Tourist Dashboard** (`/dashboard`) — avatar header, stats (bookings / upcoming / trips taken), booking cards with status pills, quick actions.

### Service Provider
1. From the Discover page banner or bottom nav, goes to **Provider Onboarding** (`/provider/onboard`) — submits business name, type (homestay/driver/shop/cafe), description, location, contact phone, starting price, one image URL.
2. Provider profile is created as `pending_payment`, the user's `role` flips to `provider`.
3. Pays the **₹99 one-time registration fee** → profile flips to `active`, activation also **auto-creates a listing** from the provider profile so it's immediately discoverable.
4. Manages everything from the **Provider Dashboard** (`/provider/dashboard`) — status badge, 4 stat cards (total bookings, confirmed, revenue, live listings), tabs for Bookings / My Listings / Business Profile. Each booking row shows the customer, dates, notes, and Call/WhatsApp quick actions.

### Admin
1. Logs in at the separate **admin app** (`frontend-admin`, port 5173 in dev) via username/password (`/auth/admin/login`), or bootstraps the very first DB-backed admin via a one-time secret (`/admin/bootstrap`).
2. From the **Admin** page: sees platform stats (users/providers/listings/bookings/paid-payments counts), can seed the 27 sample listings, list/delete users (except other admins) and listings, change a provider's status, and browse all bookings/payments.

## 5. Feature inventory (as implemented today)

| Area | Status | Notes |
|---|---|---|
| Discovery feed, category grids, listing detail | ✅ Done | 7 listing types: `spot`, `homestay`, `driver`, `shop`, `cafe`, `event`, `biodiversity` |
| Search | ✅ Done | Case-insensitive across title/description/location (`GET /listings?q=`) |
| Phone + OTP login (mocked) | ✅ Done | See §6 — no real SMS/WhatsApp delivery wired up |
| Google Sign-In | ❌ Not implemented | No button, no code path — earlier drafts of this doc claimed a placeholder button existed; it doesn't |
| Provider onboarding + activation | ✅ Done | ₹99 one-time, mocked or real Razorpay (see §7) |
| Booking + platform fee | ✅ Done | ₹1 flat fee per booking, homestay bookings require valid check-in/out dates |
| Provider dashboard (bookings, stats, revenue) | ✅ Done | |
| Tourist dashboard (bookings, stats) | ✅ Done | |
| Admin dashboard (separate app) | ✅ Done | Users, listings, providers, bookings, payments, seeding |
| Multi-language UI | ✅ Done | English, Bengali, Hindi, Nepali — `frontend/src/locales/{en,bn,hi,ne}.json` via `react-i18next` |
| PWA / installable | ✅ Done | `manifest.json` present (standalone display, theme `#2C5E3B`); Workbox service worker (`src/service-worker.ts`) precaches the app shell + remote listing images. Production build verified to fully render offline, including client-side route navigation |
| Privacy Policy / Responsible Tourism pages | ✅ Done | Static content pages (`Privacy.tsx`, `Responsible.tsx`) |
| Mobile bottom nav (5 tabs) | ✅ Done | Home / Explore(spots) / Book(homestays) / Green(responsible tourism) / Profile |
| Listing editing/multi-listing per provider | ✅ Done | Providers can add/edit/delete their own listings (ownership-checked); admins can manage any listing |
| Homestay double-booking prevention | ✅ Done | Overlapping date ranges against already-*confirmed* bookings on the same listing are rejected (409); overlapping *pending_payment* bookings are allowed to co-exist since they have no expiry and the first to actually pay wins the slot |
| Reviews & ratings | ❌ Not implemented | |
| In-app messaging | ❌ Not implemented | Contact is via Call/WhatsApp deep links only |
| Real WhatsApp/SMS OTP delivery | ❌ Not implemented | Mock only |
| Full local-shop checkout (cart, pay full order value) | ❌ Not implemented | Shops are discovery-only; no cart/order flow |
| Automated tests | ✅ Done | 45 Vitest + Supertest tests against an isolated Postgres test DB, covering auth, listings, bookings, payments, admin |

## 6. Auth model

- **Login is phone-number based**, no password for tourists/providers. `POST /auth/otp/send` issues a 6-digit OTP; delivery is **mocked** — the OTP is returned directly in the API response outside production, and the universal code `123456` is always accepted outside production. There is no real WhatsApp/SMS integration wired up despite the field being labelled `channel: 'whatsapp'`.
- `POST /auth/otp/verify` creates the user on first verification (name required) and returns a JWT (30-day expiry) + the user record.
- **Admin auth is separate**: either hardcoded `ADMIN_USERNAME`/`ADMIN_PASSWORD` (env-configured) via `POST /auth/admin/login`, or a DB-backed admin promoted via `POST /admin/bootstrap` (one-time, requires `ADMIN_BOOTSTRAP_SECRET`, blocked once any admin exists).
- Roles: `tourist`, `provider`, `admin`. A user starts as `tourist` and flips to `provider` the moment they submit `/providers/onboard` (before paying) — `providerPaid` only flips true after payment.

## 7. Business model / monetization

Two flat fees, both processed through the same payment pipeline:

| Flow | Amount | When |
|---|---|---|
| `provider_registration` | ₹99 (9900 paise) | One-time, on provider onboarding |
| `booking_commission` | ₹1 (100 paise) | Per booking — a nominal platform fee, **not** the actual cost of the stay/ride/etc., which is settled directly between tourist and provider outside the app |

Payments go through Razorpay, with a **mock mode** (`MOCK_PAYMENTS=true`, the default) that simulates the entire flow with no real charge — a branded `MockPaymentModal` with UPI/Card/Net Banking toggle, 1.2s simulated processing, and a sandbox notice — so the product can be demoed and developed against without live payment credentials. Real payments use Razorpay Checkout with server-side HMAC-SHA256 signature verification (`POST /payments/verify`); switching modes is a single `.env` flag.

## 8. Data model

Postgres tables (`backend/src/schema.ts`, Drizzle ORM):

- **`users`** — `id, phone (unique), name, role, providerPaid, email, language, avatar, createdAt, password`. `password` is only ever set for DB-backed admins (via bootstrap).
- **`otps`** — `phone (PK), otp, channel, createdAt`. One row per phone; each new OTP request overwrites the previous.
- **`providers`** — `id, userId (FK→users, cascade), businessName, businessType, description, location, contactPhone, priceFrom, images (jsonb), extras (jsonb), status (pending_payment|active), createdAt, activatedAt`.
- **`listings`** — `id, title, type, description, location, price, image, tags (jsonb), providerId, extras (jsonb), createdAt`. `providerId` is a loose text reference (matches either a `providers.id` or, for seed data, the sentinel `admin-seed-provider`) — not an FK.
- **`bookings`** — `id, userId (FK→users, cascade), listingId (FK→listings, cascade), listingType, listingTitle, checkIn, checkOut, guests, notes, status (pending_payment|confirmed), createdAt, confirmedAt`.
- **`payments`** — `id, userId (FK→users, cascade), flow, referenceId, amount, orderId (unique), status (created|paid), paymentId, signature, mock, createdAt, paidAt`.

## 9. API surface

26 REST endpoints under `/api`, grouped as `auth`, `users`, `providers`, `listings`, `bookings`, `payments`, `admin`. **Full interactive documentation — request/response shapes, auth requirements, status codes — is served live at `http://localhost:8000/api-docs`** (Swagger UI, generated from `@openapi` JSDoc comments on each route; raw spec at `/api-docs.json`). This PRD intentionally doesn't duplicate that reference.

Authorization notes worth knowing at a glance (enforced as of 2026-07-16, see `INVESTIGATION.md` for history):
- Creating a listing (`POST /listings`) requires being an **active provider** (forced to your own `provider_id`) or an **admin**.
- Completing a payment (`/payments/mock/complete`, `/payments/verify`) requires the payment to belong to the calling user.
- All `/admin/*` routes require an admin JWT; there is no unauthenticated seeding route.

## 10. Tech stack & architecture

| Layer | Stack |
|---|---|
| Backend | Node 20, Express 5, TypeScript, Drizzle ORM, PostgreSQL 15, JWT (`jsonwebtoken`), Razorpay SDK, hand-rolled in-memory rate limiter |
| Public frontend | React 19, Create React App via `craco`, Tailwind CSS, Radix UI primitives, `framer-motion` + `gsap` for animation, `react-i18next`, `react-router-dom` v7, `@tanstack/react-query`/`swr`/`axios` for data fetching |
| Admin frontend | React 19, Vite, TypeScript, Tailwind CSS |
| Dev infra | Docker Compose (Postgres only — all three apps run natively via `npm`/`yarn` in dev) |
| API docs | `swagger-jsdoc` + `swagger-ui-express`, served at `/api-docs` |

See root `README.md` for local setup and `INVESTIGATION.md` for known dependency/tooling issues (a `date-fns`/`react-day-picker` peer conflict, CRA+React 19 via manual patching, etc.) — none of that is repeated here since it's process/tooling, not product.

## 11. Design system

- **Palette**: Pine Green `#2C5E3B` (primary — tea gardens/forests), Prayer-Flag Red `#C42E2E` (secondary/high-visibility), Golden Yellow `#F0B90B` (accent/highlights), Mist White `#FAFAFA` (background).
- **Typography**: `Anek Bangla` for headings, `Hind Siliguri` for body — chosen specifically for legible multi-script support across Latin, Bengali, and Devanagari (Hindi/Nepali).
- **Tone**: "light and bold" — generous spacing, pill-shaped buttons, `rounded-2xl` cards, soft shadows, Instagram-grid/MakeMyTrip-booking-widget hybrid. Full detail in `design_guidelines.json`.
- **Default language**: **English**, decided 2026-07-16. The original design brief (`design_guidelines.json`) specified Bengali-first, but the shipped implementation (`frontend/src/i18n.ts:22-23`: `fallbackLng: 'en'`, `lng: localStorage.getItem('lang') || 'en'`) had already defaulted to English — resolved by updating the design brief to match, since English is the more universal choice for an app serving both domestic and international visitors. Language is still auto-detected from browser/localStorage on top of that fallback, and Bengali/Hindi/Nepali remain fully supported via the language switcher.

## 12. Non-functional / operational notes

- **i18n**: 4 languages shipped (`en`, `bn`, `hi`, `ne`) via `react-i18next`, translation files in `frontend/src/locales/`.
- **PWA**: installable (manifest present, standalone display, themed), and now has a real offline app shell — a Workbox service worker (only registered in production builds, never in `yarn start` dev mode) precaches the built JS/CSS/HTML and remote listing images, with an SPA navigation fallback so client-side routing keeps working offline. API data itself is deliberately *not* cached (offline shell, not offline data — full cached-listings support is still P2, see §13).
- **Security posture**: tracked separately and in more depth in `INVESTIGATION.md` at the repo root — that document is the living record of what's been fixed and what's still open (as of this writing: authorization gaps on listings/payments/seeding have been fixed; stale `.env.example`/dependency issues remain open).
- **Automated backend test suite** exists (Vitest + Supertest, isolated test database) covering auth, listings, bookings, payments, and admin — 45 tests as of this writing. No frontend automated tests yet.

## 13. Backlog / next actions

### P0
- Real WhatsApp/SMS OTP delivery (currently fully mocked)
- Google OAuth (not started — no placeholder exists despite earlier claims)
- ~~Service worker + offline shell for the PWA~~ — done, see §12
- ~~Automated test coverage, starting with auth/payments/bookings~~ — done, see §12

### P1
- ~~Provider: edit/delete listings inline, support multiple listings per provider~~ — done: `PATCH/DELETE /api/listings/:id` (ownership-checked) plus an Add/Edit/Delete UI on the Provider Dashboard's "My listings" tab
- Tourist: saved/favourited listings, in-app messaging with providers (currently Call/WhatsApp deep-link only)
- ~~Booking calendar with date blocking~~ — double-booking prevention done (see §5); a visual calendar UI showing blocked dates is still not built
- Reviews & ratings

### P2
- Full local-shop checkout (cart + pay full order value — shops are discovery-only today)
- Notification system (WhatsApp/email booking confirmations — currently in-app only)
- Referral codes
- Full offline PWA with cached listings

## 14. Explicit non-goals (for now)

- Real-time chat/messaging between tourist and provider
- Multi-currency support (INR only)
- Provider-side analytics beyond the 4 basic stat cards
- Anything resembling a marketplace "cart" for physical goods (shops are discovery/contact-only)
