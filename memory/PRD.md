# 1 Darjeeling — Product Requirements Document

## Problem Statement (original)
Build a tourism + local marketplace app for Darjeeling. Tourists explore tourism spots, drivers, homestays, local shops, cafes, cultural events and biodiversity in one place. Architecture supports future online ordering + local services. Onboarding flows for service providers (homestays, drivers, shops) and tourists. Service provider registration fee: **₹99 one-time**. Tourist booking charge: **₹1 per booking** (stays + drivers). Design language: **light and bold**. All fonts must be Google Fonts. Available in **Bengali (base), Hindi, Nepali, English**. Login: Google Auth + WhatsApp OTP. Hostinger VPS deployment. Include **Privacy Policy** page and **Responsible Tourism** page.

## User Personas
1. **Tourist** — Traveller planning a Darjeeling trip. Wants curated homestays, drivers, cafes, events and cultural insight in one app. Speaks Bengali/Hindi/Nepali/English.
2. **Service Provider** — Local homestay owner, driver, shop owner, cafe. Pays ₹99 once, lists business, receives tourist bookings.
3. **Admin** — 1 Darjeeling operations team. Seeds content, monitors platform health.

## Core Requirements (static)
- Discovery-first UX with light-and-bold Google-fonts typography (Anek Bangla + Hind Siliguri + Anek Devanagari)
- Multi-language: **English default (Bengali/Hindi/Nepali available via language switcher)** + English, Hindi, Nepali (i18next)
- WhatsApp OTP login (mocked in dev — universal code `123456` accepted, plus per-session mock OTP)
- Google OAuth (deferred — button visible but disabled until keys supplied)
- Razorpay payments — ₹99 provider registration, ₹1 booking commission
- Server-side HMAC-SHA256 signature verification for every payment
- Privacy policy + Responsible tourism content pages
- Deployable on Hostinger VPS (standard React build + FastAPI + MongoDB)

## Architecture
- **Frontend**: React 19 (CRA + craco), Tailwind, framer-motion, react-i18next, react-router-dom v7, Radix/shadcn primitives
- **Backend**: FastAPI + motor (async MongoDB) + PyJWT + razorpay SDK
- **DB**: MongoDB (`one_darjeeling`) — collections: `users`, `otps`, `providers`, `listings`, `bookings`, `payments`
- **Auth**: JWT (30-day) signed with `JWT_SECRET`; stored in `localStorage` on frontend
- **Payments**: Razorpay Standard Checkout — order creation on backend, checkout on frontend, HMAC verify on backend

## Implemented (Jan 2026)
### Backend (`/app/backend/server.py`)
- `GET /api/` health
- Auth: `POST /api/auth/otp/send`, `POST /api/auth/otp/verify`, `GET /api/auth/me`
- Users: `PATCH /api/users/me`
- Providers: `POST /api/providers/onboard`, `GET /api/providers/me`
- Listings (unified for spot/homestay/driver/shop/cafe/event/biodiversity): `GET /api/listings?type=&q=`, `GET /api/listings/{id}`, `POST /api/listings`
- Bookings: `POST /api/bookings`, `GET /api/bookings/me`
- Payments (Razorpay): `POST /api/payments/order`, `POST /api/payments/verify`
- Admin: `POST /api/admin/seed` (idempotent — 27 items), `GET /api/admin/stats`
- Seed data (`/app/backend/seed_data.py`) — 6 spots + 4 homestays + 3 drivers + 3 shops + 3 cafes + 4 events + 4 biodiversity entries

### Frontend
- Light-bold design system with `Anek Bangla`, `Hind Siliguri`, `Anek Devanagari` Google fonts; Pine Green / Prayer Flag Red / Golden Yellow palette
- Pages: `Discover`, `Category` (per-type + search), `ListingDetail` (with booking sidebar), `Login` (WhatsApp OTP + role toggle + Google-soon), `ProviderOnboard`, `ProviderDashboard`, `Responsible`, `Privacy`, `Admin`
- Language switcher (Bengali/English/Hindi/Nepali) — English default (Bengali/Hindi/Nepali available via language switcher), persists in localStorage
- Razorpay checkout wired for provider registration (₹99) and booking commission (₹1)
- Mock OTP shown in the UI + universal `123456` for testing

### Testing (Iteration 1)
- Backend: **23/23 checks passed (100%)** — auth, listings, providers, bookings, Razorpay order creation on both flows, signature rejection, admin stats. All validated against public URL.

## Backlog / Next Actions (P0 → P2)

### P0
- Wire real WhatsApp OTP (MSG91/Twilio) — currently MOCKED
- Enable Google OAuth (needs `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`) — button placeholder in Login page
- Provider dashboard: list of bookings received + revenue summary
- Admin: content moderation (approve/reject provider listings)

### P1
- Online ordering for local shops (cart + Razorpay full-value payment, not just ₹1)
- Reviews & ratings on listings
- Provider image upload (currently URL-only) — needs S3/Cloudinary
- Map view for spots/homestays (Google Maps or Mapbox)
- Booking calendar (block dates already booked on homestays)

### P2
- Notification system (WhatsApp/email confirmations)
- Referral / promo codes
- Multi-currency for international tourists
- Blog/Journal for responsible tourism content
- Progressive Web App (offline discovery for spotty hill signal)

## Deployment (Hostinger VPS)
1. `git push` codebase (or `Save to GitHub` in Emergent chat)
2. On VPS: Node 20, Python 3.11, MongoDB 7, Nginx, PM2/systemd, Certbot for SSL
3. Frontend: `yarn build` → serve `build/` via Nginx
4. Backend: `uvicorn server:app` under systemd, proxied by Nginx at `/api`
5. Update `REACT_APP_BACKEND_URL` to production domain
6. Add Razorpay LIVE keys and production Google OAuth credentials
7. Configure Razorpay webhook for async payment confirmation

_Last updated: January 2026_
