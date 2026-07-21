# Provider KYC & Profile Completion — Design

> Date: 2026-07-21
> Status: Approved for planning
> Scope: Add optional, admin-verified KYC and a blended profile-completion progress bar to the provider experience. Tourist experience is explicitly unchanged. Harden the file-upload pipeline and store KYC documents privately.

---

## 1. Goal

Providers, after onboarding + paying the ₹99 fee (unchanged), are invited to **complete their profile** — a blended meter that mixes profile richness with KYC document verification. KYC is **optional and never blocks anything**; completing it earns a **"Verified" badge** shown on the dashboard and public listings. KYC document requirements **differ per provider type** (driver / homestay / cafe / shop). Documents are **manually reviewed by an admin** in the existing `frontend-admin` app.

Tourists get **no KYC and no forced profile step** — their flow (phone+OTP login → Discover feed → book → dashboard) stays simple and unchanged.

## 2. Confirmed end-to-end flows

### Tourist (unchanged)
Phone + OTP login (name on first verify) → Discover feed → category → listing detail → book (₹1 platform fee) → Tourist Dashboard. No profile-completion, no KYC.

### Provider (new profile/KYC layer added; onboarding + payment unchanged)
1. `/provider/onboard` — type-specific form (driver / homestay / cafe / shop). Provider created `pending_payment`, user role → `provider`.
2. Pay ₹99 → status `active` → listing auto-created (all unchanged).
3. **New:** Provider Dashboard leads with a **"Complete your profile" card** — the blended progress bar + a checklist of missing items (profile fields + required KYC docs for that business type).
4. **New:** Provider uploads KYC docs → each doc row goes `pending`. Nothing is blocked while pending or missing.
5. **New:** When **all required KYC docs are admin-approved**, provider gains `kycStatus = 'verified'` and a **"Verified" badge** appears on the dashboard and the provider's public listing(s).

### Admin (new KYC review)
In `frontend-admin`: a **KYC review** view listing providers with pending docs; per-document **approve / reject (+ reason)**. Admin-JWT gated, consistent with existing `/admin/*` routes.

## 3. KYC document matrix (v1 — approved)

Required-doc config lives in **one shared module** (a plain TS map) that backend validation, the progress-bar computation, and admin review all import — single source of truth.

| Document (`docType`) | Driver | Homestay | Cafe | Shop |
|---|:--:|:--:|:--:|:--:|
| `aadhaar` — owner identity | required | required | required | required |
| `pan` | required | required | required | required |
| `owner_photo` — selfie/photo | required | required | required | required |
| `driving_license` | required | — | — | — |
| `vehicle_rc` | required | — | — | — |
| `commercial_permit` | required | — | — | — |
| `property_proof` (deed/rent/electricity bill) | — | required | — | — |
| `tourism_registration` (WB Tourism) | — | required | — | — |
| `fssai_license` | — | — | required | optional |
| `trade_license` (Shop & Establishment) | — | — | required | required |
| `gst_certificate` | — | optional | optional | optional |

Required-doc counts: **Driver 6, Homestay 5 (+1 optional), Cafe 5 (+1 optional), Shop 4 (+2 optional).** Optional docs do **not** gate 100% or the Verified badge; they contribute a small bonus and can show an extra chip.

Business types `event`, `spot`, `biodiversity` (admin-seeded, not self-onboarded) have **no** KYC requirements — treated as empty config.

## 4. Blended progress bar

Computed **server-side**, returned with the provider profile so the client never re-derives the rule.

- **Profile richness (~40%)** — presence checks: `avatar`/owner photo, `description` ≥ 60 chars, ≥ 1 gallery image, `priceFrom` > 0, location + map pin (`latitude`/`longitude`) set.
- **KYC (~60%)** — each **required** doc that is `approved` counts equally toward the KYC portion. A doc that is uploaded-but-`pending` shows as "in review" in the checklist but does **not** fill the bar until approved. `rejected` shows with the reason and an action to re-upload.
- Optional docs: small bonus, capped so the bar can reach 100% on required items alone.
- The endpoint returns both the numeric `completionPercent` and a structured `checklist` (each item: `key`, `label`, `state` ∈ `missing | in_review | done | rejected`, `kind` ∈ `profile | kyc`, `required`), so the UI renders the checklist without embedding the rules.

Exact weights are implementation detail; the split above is the intent. Weights live next to the shared config.

## 5. Data model (Drizzle / Postgres)

New table **`kyc_documents`**:

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | uuid |
| `providerId` | text FK → `providers.id` (cascade) | owner |
| `docType` | text | one of the `docType` values above |
| `fileKey` | text | **object key in the private bucket** (not a public URL) |
| `contentType` | text | stored mime |
| `status` | text | `pending` \| `approved` \| `rejected` (default `pending`) |
| `rejectionReason` | text nullable | set on reject |
| `uploadedAt` | text | ISO |
| `reviewedAt` | text nullable | ISO |
| `reviewedBy` | text nullable | admin user id |

Uniqueness: **one active row per (`providerId`, `docType`)** — re-upload replaces the file/row and resets `status` to `pending`.

Add to **`providers`**: `kycStatus` text — `none` \| `partial` \| `submitted` \| `verified` (denormalized rollup, default `none`), recomputed whenever a doc is uploaded/deleted/reviewed. `verified` = every **required** doc for the business type is `approved`.

A Drizzle migration adds the table + column. `README`/`PRD` updated to reflect the new table and flow after implementation.

## 6. Storage & privacy (approved: separate private bucket + backend proxy)

MinIO already runs in `docker-compose.yml` and `backend/src/lib/s3.ts` already exposes `uploadToMinIO`. That path stays for **public listing images** (world-readable bucket, public URL).

KYC changes:
- **New private bucket** (e.g. `MINIO_KYC_BUCKET=one-darjeeling-kyc`) created **without** the public-read policy. `s3.ts` gains a bucket-aware upload helper (private variant that does **not** apply the public policy and returns the **object key**, not a public URL) plus a `getObjectStream(bucket, key)` for the proxy.
- KYC files are **never** served by a public URL. They are streamed only through `GET /api/providers/kyc/:id/file`, which authorizes **owner or admin** before streaming from the private bucket.
- New env vars: `MINIO_KYC_BUCKET` (+ reuse existing endpoint/creds). Added to `docker-compose.yml` backend env and `.env(.production).example`.

## 7. API surface (with every check)

All under `/api`. Reuses `authenticateToken`; admin routes reuse the admin-JWT middleware used by existing `/admin/*`.

| Endpoint | Method | Auth / ownership check | Validation |
|---|---|---|---|
| `/providers/me/profile` | GET | logged in + is a provider (owns profile) | returns profile + `completionPercent` + `checklist` + `kycStatus` |
| `/providers/me/kyc` | GET | owner only | list own docs with statuses |
| `/providers/me/kyc` | POST | logged in + role `provider` + owns the profile | `docType` must be valid **for this business type**; mime ∈ {`image/jpeg`,`image/png`,`application/pdf`}; size ≤ 5 MB; stored in **private** bucket; upserts row, status → `pending` |
| `/providers/kyc/:id/file` | GET | **owner OR admin** | streams from private bucket; 403 otherwise; never a public URL |
| `/providers/me/kyc/:docType` | DELETE | owner only | deletes row + object; recompute rollup + bar |
| `/admin/kyc` | GET | admin JWT | filter `?status=pending`; joins provider + user for context |
| `/admin/kyc/:id/review` | POST | admin JWT | body `{ decision: 'approve'\|'reject', reason? }`; sets status/reviewedAt/reviewedBy; recompute provider `kycStatus`/verified |

Cross-cutting rules:
- Re-uploading a `docType` that is currently `approved` **resets it to `pending`** (no stale approvals after a swap).
- Uploading a `docType` not required/allowed for the business type → 400.
- The existing loose `POST /listings/upload` is left as-is for images but is **not** used for KYC.

### Upload-pipeline hardening (applies to the new KYC endpoint; noted for images)
The current `/listings/upload` has no role/ownership check, no mime allow-list, and no size cap, and writes to a public bucket. The KYC endpoint **must not** inherit those looseness properties — it enforces role, ownership, mime allow-list, size cap, and private storage as tabled above. (Tightening `/listings/upload` itself is out of scope here but flagged.)

## 8. Frontend

**Public app (`frontend/`):**
- **`ProfileCompletionBar`** — reusable bar + percentage.
- **`KycSection`** — rendered on the Provider Dashboard "Business Profile" tab. Reads the per-type checklist from the shared config/endpoint; each row is an upload control (reusing `AvatarUploader`/`GalleryUploader` interaction patterns, but posting to the KYC endpoint and accepting PDF) with a status pill (`missing` / `in review` / `verified` / `rejected + reason → re-upload`).
- **"Complete your profile" card** at the top of the dashboard surfacing the bar + count of remaining items, linking to `KycSection`.
- **"Verified" badge** component surfaced on `ProviderDashboard`, `ListingCard`, and `ListingDetail` when `kycStatus === 'verified'`.
- i18n: new strings added to `en/bn/hi/ne` locale files.

**Admin app (`frontend-admin/`):**
- New **KYC review** page/tab: table of pending docs (provider, business type, docType, uploaded time), inline document viewer (via the proxied file endpoint), approve/reject with reason.

## 9. Testing

Backend Vitest + Supertest (matching the existing 45-test suite, isolated Postgres):
- Upload requires provider role + ownership; tourist is rejected.
- `docType` invalid for business type → 400.
- mime / size validation.
- File endpoint: owner ✓, admin ✓, other provider ✗ (403).
- Review flow: upload → `pending`; approve last required doc → provider `verified`; reject → reason surfaced.
- Re-upload of an `approved` doc resets to `pending`.
- `completionPercent` / checklist math for each business type.

## 10. Explicitly out of scope (v1)

- Third-party / automated KYC (DigiLocker, Signzy, Aadhaar API) — manual admin review only.
- KYC gating listings, bookings, or payouts — KYC is optional/badge-only.
- Tourist KYC or forced tourist profile completion.
- Retrofitting `/listings/upload` hardening (flagged, not done here).
- Document expiry / re-verification cycles.

## 11. Open items to finalize during planning

- Exact numeric weights for the 40/60 blend and the per-item profile checks (documented next to the shared config).
- Whether the "Verified" badge also requires the optional docs for a "fully verified plus" tier — v1: **no**, required-only.
