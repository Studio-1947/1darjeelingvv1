# 1 Darjeeling — Product Requirements Document

## Problem Statement (original)
Full-stack tourism + local marketplace for Darjeeling — tourists explore spots, homestays, drivers, shops, cafes, events & biodiversity; providers onboard (₹99 one-time); tourists pay ₹1 per stay/driver booking. Design: light and bold, Google Sans font, mixed MakeMyTrip + Instagram vibe. Base language English, also Bengali/Hindi/Nepali. Google Auth + WhatsApp OTP. Hostinger VPS deployable. Includes Privacy Policy + Responsible Tourism pages, and mobile-app installable (PWA).

## User Personas
- **Tourist** — Browses discovery feed, books homestays/drivers, keeps track of bookings in a personal dashboard.
- **Service Provider** — Homestay/driver/shop/cafe owner; onboards for ₹99, manages listings + received bookings + revenue in a provider dashboard.
- **Admin** — Ops team; seeds content, monitors stats.

## Core Requirements (static)
- Discovery-first, mobile-first UX; installable as PWA (Add to Home Screen on iOS/Android).
- Multi-language: English (default), Bengali, Hindi, Nepali (i18next, `Google Sans` + Noto scripts).
- WhatsApp OTP login (mocked; universal code `123456` accepted).
- Google OAuth (deferred — placeholder button in login).
- Razorpay payments — ₹99 provider registration + ₹1 per booking commission (server-side HMAC-SHA256 verification).
- Provider dashboard with bookings + revenue + listings management.
- Tourist dashboard with bookings history + stats + quick actions.
- Privacy policy + Responsible tourism pages.

## Architecture
- **Frontend**: React 19 (CRA/craco), Tailwind, framer-motion, react-i18next, react-router-dom v7. Google Sans + DM Sans + Noto Sans (Bengali/Devanagari) via Google Fonts.
- **Backend**: FastAPI + motor (async MongoDB) + PyJWT + razorpay SDK.
- **DB**: MongoDB (`one_darjeeling`) — collections: `users`, `otps`, `providers`, `listings`, `bookings`, `payments`.
- **PWA**: `manifest.json` with theme #2C5E3B + apple-mobile-web-app meta tags for standalone iOS install.

## Implemented (Jan 2026)
### Backend
- Auth: `POST /api/auth/otp/send`, `POST /api/auth/otp/verify`, `GET /api/auth/me`
- Providers: `POST /api/providers/onboard`, `GET /api/providers/me`
- Listings (all 7 types): `GET /api/listings?type=&q=`, `GET /api/listings/{id}`, `POST /api/listings`
- Bookings: `POST /api/bookings`, `GET /api/bookings/me` (with listing enrichment), `GET /api/bookings/provider` (with customer + stats + revenue)
- Payments: `POST /api/payments/order`, `POST /api/payments/verify` (HMAC signature check)
- Admin: `POST /api/admin/seed` (27 items), `GET /api/admin/stats`

### Frontend
- **Design system**: Google Sans font stack; Pine Green / Prayer-Flag Red / Golden Yellow; Light & bold with generous spacing; Instagram + MakeMyTrip hybrid.
- **Discover home**: Instagram-style perfectly circular story avatars with gradient rings, MMT-style booking widget (Homestays/Drivers/Spots tabs), gradient deal cards, horizontal spot rail with "Explore" pills, homestay quick-pick with "Book Now" buttons, Instagram feed with contextual CTAs, provider onboarding banner.
- **Category page**: Instagram Explore-style grid + Feed view toggle; each tile shows contextual CTA (Book Now / Talk to Driver / Visit Shop / Join Event / Learn More / Explore).
- **Listing detail**: Heart + Share floating buttons; Get Directions + Call Now action pills; contextual primary CTA in booking sidebar; mobile sticky bottom-bar CTA.
- **Login**: role toggle (Tourist / Provider), mock OTP with universal code display, Google button placeholder.
- **Provider Dashboard** (NEW): Status badge, 4 gradient stat cards (Total bookings, Confirmed, Revenue ₹, Listings live), tabs [Bookings | My listings | Business profile]. Each booking row shows customer + dates + notes + Call & WhatsApp quick actions.
- **Tourist Dashboard** (NEW): Avatar profile header, 3 gradient stats (Bookings / Upcoming / Trips taken), booking cards with status pills, Quick actions grid.
- **Clean minimal navbar**: Brand + prominent center search + language + user avatar circle (or Log-in pill). Provider CTA moved to home banner / bottom nav.
- **Mobile bottom tab nav** (Instagram-style): Home / Explore / Book / Green / Profile (5 tabs with safe-area padding).
- **PWA**: `manifest.json`, apple-touch-icon meta tags — installable on iOS/Android home screen.
- Pages: Discover, Category (7 types + search), ListingDetail, Login, ProviderOnboard, ProviderDashboard, TouristDashboard, Responsible, Privacy, Admin.

### Testing (Iteration 1)
- Backend: **23/23 checks passed** — auth, listings, providers, bookings, Razorpay orders (₹99 + ₹1), signature rejection, admin stats.

## Backlog / Next Actions

### P0
- Wire real WhatsApp OTP (MSG91/Twilio)
- Enable Google OAuth (needs GOOGLE_CLIENT_ID + SECRET)
- Test dashboards with real E2E (testing agent)
- Add PWA install prompt + service worker for offline shell

### P1
- Provider: edit/delete listings inline, add multiple listings per provider
- Tourist: saved/favourite listings screen, in-app messages with providers
- Booking calendar with date blocking
- Reviews & ratings

### P2
- Full local-shop online ordering (cart + Razorpay full value)
- Notification system (WhatsApp/email confirmations)
- Referral codes
- Full offline PWA with cached listings

## Deployment (Hostinger VPS)
Node 20 + Python 3.11 + MongoDB 7 + Nginx + systemd + Certbot.
- Frontend: `yarn build` → serve via Nginx
- Backend: `uvicorn` under systemd, proxied at `/api`
- Add Razorpay LIVE + production Google OAuth keys
- Configure Razorpay webhook

_Last updated: January 2026_

## Update — Jan 2026 (Iteration 2)
- **Dummy payment gateway** — added `MOCK_PAYMENTS=true` mode. Backend returns a mock order (no real Razorpay hit) and exposes `POST /api/payments/mock/complete` that marks payment paid + triggers same side-effects (provider activation OR booking confirmation).
- **MockPaymentModal** — branded "1 Darjeeling · Secure Pay" checkout with UPI / Card / Net Banking method toggle, pre-filled test data, 1.2s simulated processing, sandbox notice. Feels real but doesn't charge anything.
- **BookingConfirmation** — Full-screen success modal shown to tourist AND to provider (via updated booking status). Includes listing summary, booking ID with Copy button, host contact (Call + WhatsApp CTAs), and "View my bookings" primary CTA.
- **Provider onboarding** now uses the same dummy flow → shows a Provider welcome confirmation and routes to `/provider/dashboard`.
- Real Razorpay path preserved — set `MOCK_PAYMENTS=false` in `.env` to switch to production checkout (existing HMAC-verified flow).
