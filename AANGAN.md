# aangan — By studio 1947

> "aangan. Every experience." A tourism and local-marketplace platform for the Darjeeling hills.
> This file describes the product and codebase **as they are now**. It replaces the earlier
> "1 Darjeeling" docs. Current as of 2026-09-24 (pricing: ₹1 lifetime pass, free bookings, ₹1 then ₹499/year for hosts).

Tourists get one place to discover tourist spots, homestays, drivers, shops, cafés, events and
Himalayan biodiversity, and to book homestays. Local businesses sign up as providers, pass KYC and
list their services. An internal console runs the content, users, KYC review and refunds.

The product was originally built as **1 Darjeeling** and has been renamed **aangan**. The old name
still appears in some internal identifiers: the repo (`1darjeelingvv1`), the mobile folder
(`1-Darjeeling-Mobile-App`), database names (`one_darjeeling`), container names (`1darjeeling_*`)
and the MinIO buckets (`one-darjeeling`). These are not user-facing, and renaming them would break
existing volumes and deploys, so leave them as they are.

---

## 1. The pieces

| Path | What it is | Stack |
| --- | --- | --- |
| `backend/` | REST API used by every client | Node 20, Express 5, TypeScript, Drizzle ORM, PostgreSQL 15, MinIO (S3) |
| `frontend/` | Public web app for tourists and providers, installable as a PWA | React 19 (CRA + craco), Tailwind, react-router v7, react-i18next |
| `frontend-admin/` | "aangan Console", the internal admin dashboard | React 19, Vite, TypeScript, Tailwind |
| `1-Darjeeling-Mobile-App/` | Native app for Android and iOS (git submodule) | Expo SDK 57, expo-router, TypeScript |
| `deploy/` | Production Nginx config, backup script, `VPS-RUNBOOK.md` | Nginx, Docker |
| `.agents/` | AI coding-agent toolkit. Not part of the running app | — |

Both the website and the mobile app are **English-only**. The website removed its other locales
in Sep 2026 but still has i18next wired in. The mobile app removed its Hindi, Bengali and Nepali
tables and both language pickers; its `t()` helper stays so all copy lives in one file.

### Mobile app identity
- Name, slug and URL scheme: `aangan`. Android package and iOS bundle ID: `io.aangan.app`.
- Brand colour is `#03637E` (the teal of the logo/adaptive icon). The splash shows the logo, the
  "aangan" wordmark, "By studio 1947" and "Made in the hills".

---

## 2. What users can do

### Tourists
- **Onboard** (mobile): splash → log in with phone + OTP → pick interests.
- **Discover**: a home feed and category browsing across the seven listing types, with search and
  filters, then a listing detail page. The web app has `Discover`, `Category` and `ListingDetail`
  pages. The mobile app has `home`, `category/[type]`, `listing/[id]` and `stay/[id]`.
- **Book a homestay**: choose dates and guests → request → the provider confirms → confirmed.
  Mobile routes: `book/[stayId]`, `request-sent/[id]` and `confirmed/[id]`. Trips live under
  `trips` (mobile) and `MyTrips` (web). Guests can cancel a booking.
- **Save** listings (`saved`), **review** them, and see **notifications** in the Activity feed.
  Mobile also sends on-device local notifications.
- **Tourist pass**: **₹1 once, for life** (`platform_support`). The server refuses bookings,
  saves and reviews until it has been paid. A paid pass is stored as `support_expires_at =
  9999-12-31T23:59:59.999Z` (`LIFETIME_SUPPORT_EXPIRY`), so every existing "is it active?" check
  still works. On mobile the `pass` screen sells it. Registered providers and admins are exempt.
- **Bookings are free.** There is no booking fee: a booking confirms through
  `POST /api/bookings/:id/checkout`.
- **Refer** friends (`refer`, backed by `GET /api/users/me/referrals`). A referral gives both
  sides 90 days of access, which only matters to someone who hasn't bought the ₹1 pass yet: it
  never changes a lifetime pass. **Donate** (web
  `Donate` page, ₹10 to ₹1,00,000).
- **Profile** (mobile `profile`): profile photo (uploaded through `POST /api/listings/upload`, then
  saved with `PATCH /api/users/me`), a "finish your profile" checklist, the pass card, and a
  Traveller / Host switch for registered providers. **Account and privacy** (`account`) shows how
  the account signs in and holds account deletion (`DELETE /api/users/me`). There are also legal
  pages: privacy, terms, refunds, responsible tourism.

### Providers (local businesses)
- **Join**: register the business and pay **₹1 for the first year** (`provider_registration`,
  payable once per business). Each year after that costs **₹499** (`provider_renewal`).
  Renewing early adds the year on top of what is left. When a year ends without renewal, the
  host's listings are hidden from the public feed and refuse new bookings until they renew
  (`providers.plan_expires_at`, `lib/hostPlan.ts`). Hosts who were active when this pricing
  arrived (Sep 2026) were given a year from that day by migration `0015`. Mobile flow: `provider/join` → `provider/setup` → `provider/plan`.
- **KYC**: upload Aadhaar, PAN or a business licence (`provider/kyc`). Files go to a **private**
  bucket and are reviewed by an admin.
- **Listings**: create, edit and upload photos (`provider/listings`, `provider/listing-editor`,
  web `MyListings`).
- **Dashboard**: incoming booking requests to confirm or decline, chats and account settings
  (mobile `(provider)/dashboard | bookings | chats | listing | account`, web
  `ProviderDashboard`).

### Admins (`frontend-admin`, served at `/admin` in production)
- Stats, users, listings, bookings and payments. Approve or reject providers. Review KYC documents
  (`KycReview`).
- **Tourist spots are admin-only editorial content.** Nobody owns Tiger Hill, so only an admin can
  create, edit, publish or delete a spot (see §4).
- Refund queue and retry. Seed sample data (27 listings across all 7 categories).

---

## 3. Money

All amounts come from `AMOUNTS` in `backend/src/config.ts` and are **never** taken from the
client:

| Flow | Amount | Who pays |
| --- | --- | --- |
| `platform_support` | ₹1, once, for life | Tourist (the "pass") |
| `provider_registration` | ₹1 | Host, for their first year |
| `provider_renewal` | ₹499 / year | Host, every year after |
| Bookings | Free | No fee |
| Donation | ₹10 to ₹1,00,000 | Anyone, optional |

`booking_commission` (the old ₹1 booking fee) is retired: a new order for it gets a **410**.
Its settlement code stays, so an order created before the change still confirms its booking, and
is refunded if that booking is cancelled or loses its dates.

Payments go through **Razorpay** and are **mocked by default** (`MOCK_PAYMENTS=true`). The
sequence is: create order → Razorpay Checkout → HMAC-verified `POST /api/payments/verify`
(sent by the browser) **and** `POST /api/payments/webhook` (sent by Razorpay). Whichever arrives
first settles the payment. Settlement is idempotent, so the second one is a no-op. The webhook is
the path that counts, because it still works if the customer closes the tab.

A booking becomes `confirmed` when the guest calls `POST /api/bookings/:id/checkout`. That runs
the same locked confirmation (and double-booking check) the paid path used to, with no payment.

---

## 4. Backend

### Data model (`backend/src/schema.ts`)
`users`, `referrals`, `otps`, `otp_send_counters`, `interakt_delivery_events`, `providers`,
`listings`, `bookings`, `favorites`, `reviews`, `payments`, `kyc_documents`.

`listings.type` is one of `spot`, `homestay`, `driver`, `shop`, `cafe`, `event` or
`biodiversity`. Type-specific fields go in the `extras` jsonb column. Spot fields are validated in
`backend/src/lib/spots.ts`.

### API surface (all under `/api`; full docs at `/api-docs`)
| Area | Routes |
| --- | --- |
| Auth | `POST /auth/otp/send`, `POST /auth/otp/verify`, `GET /auth/me`, `POST /auth/admin/login`, Google sign-in under `/auth/google` |
| Users | `PATCH /users/me`, `DELETE /users/me`, `GET /users/me/referrals` |
| Providers | `POST /providers/onboard`, `GET /providers/me`, `GET /providers/me/profile`, KYC `GET\|POST /providers/me/kyc`, `DELETE /providers/me/kyc/:docType`, `GET /providers/kyc/:id/file` (owner or admin only) |
| Listings | `GET /listings`, `GET /listings/:id`, `POST /listings`, `POST /listings/upload`, `PATCH\|PUT\|DELETE /listings/:id` |
| Bookings | `POST /bookings`, `POST /bookings/:id/checkout` (free confirmation), `GET /bookings/me`, `GET /bookings/provider`, `PATCH /bookings/:id/confirm` (host accepts), `PATCH /bookings/:id/cancel` |
| Favourites / reviews | `GET /favorites`, `GET /favorites/ids`, `POST /favorites`, `DELETE /favorites/:listingId`; `GET /reviews/listing/:listingId`, `POST /reviews`, `DELETE /reviews/:id` |
| Payments | `POST /payments/order` (flows: `platform_support`, `provider_registration`, `provider_renewal`, `donation`), `POST /payments/verify`, `POST /payments/webhook`, `POST /payments/mock/complete` (dev) |
| Utilities | `GET /geocode/search`, `GET /routes/estimate` (route and fare estimates), `POST /webhooks/interakt` |
| Admin | `/admin/stats`, `/admin/users`, `/admin/listings`, `/admin/bookings`, `/admin/payments`, `/admin/providers/:id/status`, `/admin/kyc`, `/admin/kyc/:id/review`, `/admin/refunds/pending`, `/admin/payments/:id/refund`, `/admin/seed`, `/admin/bootstrap`, `/admin/spots` (CRUD, `/publish`, `/upload`) |
| Health | `GET /api/health` checks the database and storage, and returns 503 naming whichever component failed. `GET /api` only proves the process is up. |

### Rules the code enforces
- **Spots**: `POST /listings` with `type=spot` returns 403 for anyone who isn't an admin. Only
  admins can edit or delete a spot, and a listing's `type` can never change. Drafts
  (`extras.published === false`) are hidden from all public reads. The feed is ordered
  featured first, then by `sort_order`, then newest.
- **Homestay availability**: `POST /bookings` rejects dates that overlap a confirmed booking or
  another guest's checkout that is still inside its hold (`BOOKING_HOLD_MINUTES`, default 15).
  Checkout re-checks the dates under a `FOR UPDATE` lock (`lib/bookingConfirmation.ts`). If a
  booking loses that race it is cancelled and the guest gets a 409. A legacy paid booking that
  loses is also refunded automatically.
- **Lapsed hosts**: `GET /listings` and `GET /listings/:id` hide listings whose host's
  `plan_expires_at` has passed. `POST /bookings` and checkout refuse them with a 409. Listings
  with no provider row (spots, admin-authored listings) are never affected. A host's own listings
  still come back from `GET /bookings/provider`, so they can see what they need to renew.
- **Notifications**: a confirmed booking notifies both parties. Each delivery outcome is stamped on
  the row (`tourist_notified_at`, `provider_notified_at`, `notify_error`).
  `NOTIFY_BOOKINGS` must be set explicitly in production.
- **Refunds**: `lib/refunds.ts` is idempotent and never throws. If a refund can't be delivered,
  the payment stays `paid` with a `refund_reason` and shows up in the admin refund queue.
- **Uploads**: listing images go to the public bucket `one-darjeeling`. KYC documents go to the
  private bucket `one-darjeeling-kyc` and are only served through the authenticated proxy. The
  backend creates both buckets on boot.
- **Error reports** are scrubbed of phone numbers, OTPs, tokens and documents before they are sent
  (`lib/scrub.ts`).
- **Rate limits**: 300 requests/min globally, 10/min on OTP verify, 20/min on KYC and listing
  uploads.

### Login / OTP delivery
Delivery is pluggable through `MESSAGING_PROVIDER`. The providers are in
`backend/src/messaging/providers/`: `mock`, `interakt`, `msg91`, `whatsapp` (Meta Cloud API) and
`smtp`.
- **Dev**: `mock` sends nothing. It returns the code in the `/auth/otp/send` response, and the
  universal code `123456` works. In a mobile development build the access code `0000` maps to
  the mock OTP. None of this works in production.
- **Production**: **Interakt** WhatsApp, using the Meta Authentication template `aagan_otp`.
  No usable OTP is stored in the database. Delivery events arrive at `/api/webhooks/interakt`
  after being forwarded by the shared Elegant Sip dispatcher, which only passes on
  `aangan:otp:*` callbacks. Setup details: `WHATSAPP-OTP-INTERAKT-REFERENCE.md`,
  `docs/WHATSAPP_SETUP.md`, `docs/WHATSAPP_TEMPLATES.md`.
- Google sign-in is also available (`/api/auth/google`).

---

## 5. Mobile app specifics

- It talks to the backend when `EXPO_PUBLIC_API_URL` is set. On the Android emulator that is
  `http://10.0.2.2:8000`. Without it, the app falls back to bundled seed content so it can still
  be demoed.
- The API's data model is adapted in `src/api/adapt.ts`. A listing has one flat price, so the app
  derives a three-plan rate ladder from it and marks it on screen (`derivedRates`), unless the
  listing publishes `extras.rates`. The itemised fare breakdown is stored on the device, because
  the backend stores one price per listing. An instant-confirm booking takes two calls, with no
  payment: create booking → `checkout`.
- Code layout: `app/` (routes), `src/api`, `src/components`, `src/data` (hooks such as
  `useListings`, `useStays`, `useProviderInbox`, `useRouteEstimate`, `useWeather`),
  `src/state`, `src/theme`, `src/i18n`, `src/payments`, `src/notifications`.
- Release: EAS profiles `development`, `preview` (APK) and `production` (AAB/IPA). There are also
  `npm run build:apk` / `build:aab`. The Play Store checklist is in `docs/PLAY_STORE.md`, and E2E
  tests are in `e2e/`.

---

## 6. Running it locally

### Everything through Docker (simplest)
```sh
docker compose up -d --build postgres minio backend   # API on :8000, MinIO on :9000/:9001
docker compose up -d frontend                          # web app on :3000 (optional)
```
Dev defaults are already in `docker-compose.yml`: `APP_ENV=development`, `MOCK_PAYMENTS=true`,
`CORS_ORIGINS=*`, plus the MinIO credentials. Plain `docker compose` uses this dev file. The
production file is `docker-compose.in.yml` and must always be passed with `-f`.

### Mobile on the Android emulator
```sh
# AVD: Darjeeling_API36   (1-Darjeeling-Mobile-App/start-emulator.bat)
cd 1-Darjeeling-Mobile-App
npx expo run:android      # builds the dev client, installs io.aangan.app, starts Metro on :8081
adb reverse tcp:9000 tcp:9000   # uploaded images: see below
```
In dev, uploaded images are served from `http://localhost:9000` (MinIO). Inside the emulator,
`localhost` means the emulator itself, so those images fail to load until you run
`adb reverse tcp:9000 tcp:9000`. It has to be re-run after every emulator restart. This doesn't
affect production, where image URLs use the real domain.

### Without Docker for the apps
```sh
docker compose up -d postgres minio
cd backend && cp .env.example .env && npm ci && npm run db:migrate && npm run dev
cd frontend && cp .env.example .env && corepack yarn@1.22.22 install && corepack yarn@1.22.22 start
cd frontend-admin && npm install && npm run dev        # :5173
```
- In `backend/`, **use `npm ci`, not `npm install`**. On Windows, `npm install` removes Linux
  binaries from the lockfile, which breaks CI.
- `frontend/` is managed with Yarn. CRA's peer ranges reject `npm install` with the project's
  TypeScript 5.
- `APP_ENV` is required (`development`, `test` or `production`). In production the server refuses
  to boot with default or placeholder secrets, or with `CORS_ORIGINS=*`.

### Seed data and an admin
```sh
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/admin/login \
  -H "Content-Type: application/json" -d '{"phone":"admin","password":"adminpassword123"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))")
curl -X POST http://localhost:8000/api/admin/seed -H "Authorization: Bearer $TOKEN"
```

### Schema changes and tests
- Edit `src/schema.ts`, run `npm run db:generate`, review the generated SQL, run
  `npm run db:migrate`, then **commit both files**. Production runs `drizzle-kit migrate` on
  container start. Never run `db:push` against a database you care about.
- Tests: `npm run test:setup`, then `npm test` (vitest). They run against a separate database,
  `one_darjeeling_test`, which is truncated between tests.

---

## 7. Production

- **Domain**: `https://aanganerp.in`. There is exactly one production stack
  (`docker-compose.in.yml`, compose project `1darjeeling-in`). The old
  `onedarjeeling.duckdns.org` stack has been decommissioned.
- **Shape**: `postgres`, a `db-backup` sidecar, `backend`, and an `nginx` container that serves
  both frontend builds (the public app at `/`, the console at `/admin`) and proxies `/api` and
  `/api-docs`. It listens only on `127.0.0.1:8092`. The shared VPS's system Nginx and Certbot
  terminate TLS for `aanganerp.in` and proxy to it.
- **Deploys**: every push to the `prod` branch triggers `.github/workflows/deploy-prod.yml`. It
  runs the tests and typechecks, builds the images in CI, and pushes them to
  `ghcr.io/studio-1947/1darjeelingvv1-{backend,nginx}:<sha>`. It then SSHes into the VPS and runs
  `docker compose pull` and restarts the stack. To roll back, re-run the workflow with an older
  SHA as `IMAGE_TAG`.
- **Monitoring**: point an uptime check at `/api/health`, not at `/api`. Sentry is off unless
  `SENTRY_DSN` (backend) and the `FRONTEND_SENTRY_DSN` repo variable (built into the bundles)
  are set.
- **Backups**: a daily `pg_dump`, kept for 14 days, on the same disk. Copying the dumps off the box
  is still manual. MinIO objects (images and KYC documents) are **not** in these dumps.
- **Going live on payments**: complete Razorpay KYC. Then set `MOCK_PAYMENTS=false`,
  `RAZORPAY_KEY_ID` (`rzp_live_*`), `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`. Create
  a live-mode webhook to `https://aanganerp.in/api/payments/webhook` for `payment.captured` and
  `order.paid`. Finally, run one real low-value payment end to end.
- For first-time VPS setup, day-to-day operations, restores and anything touching the shared box,
  see **`deploy/VPS-RUNBOOK.md`**.
