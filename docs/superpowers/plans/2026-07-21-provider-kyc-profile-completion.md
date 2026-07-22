# Provider KYC & Profile Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional, admin-verified KYC and a blended profile-completion progress bar to the provider experience, storing sensitive documents in a private MinIO bucket served only through an authorized backend proxy.

**Architecture:** Two pure, unit-tested library modules (per-type doc requirements + completion/rollup math) drive both backend validation and the frontend UI. A new `kyc_documents` table plus a `providers.kycStatus` rollup column persist state. KYC files go to a new **private** MinIO bucket and are streamed only via an owner/admin-checked endpoint. Provider and admin REST routes wrap the pure logic; React components render the bar, checklist, and Verified badge from server-computed data.

**Tech Stack:** Node 20 + Express 5 + TypeScript + Drizzle ORM + PostgreSQL 15 (backend); Vitest + Supertest (backend tests); `@aws-sdk/client-s3` against MinIO; React 19 (CRA/craco) public app; React 19 + Vite admin app; Tailwind.

## Global Constraints

- **Backend package manager:** `npm` in `backend/`. Public frontend uses **Yarn** (`corepack yarn@1.22.22`), admin uses `npm`.
- **KYC is optional and never blocks** onboarding, listing visibility, bookings, or payments. It only awards a "Verified" badge.
- **Tourist experience is unchanged** — no KYC, no forced profile step.
- **Sensitive KYC files must never be served from a public URL.** They live in a private bucket with no public-read policy and are streamed only to the owning provider or an admin.
- **Allowed KYC mime types:** `image/jpeg`, `image/png`, `application/pdf`. **Max size:** 5 MB (decoded).
- **Existing `POST /listings/upload` is NOT reused for KYC** and is left unchanged.
- **Doc-requirement matrix is the approved v1 set** (see spec §3). It lives in ONE shared module imported everywhere.
- **Design palette:** Pine Green `#2C5E3B`, Prayer-Flag Red `#C42E2E`, Golden Yellow `#F0B90B`.
- Spec: `docs/superpowers/specs/2026-07-21-provider-kyc-profile-completion-design.md`.
- Run backend tests with `npm test` from `backend/` (requires the test DB — `npm run test:setup` once).

---

## File Structure

**Backend (create):**
- `backend/src/lib/kycRequirements.ts` — per-type doc matrix + helpers (pure).
- `backend/src/lib/profileCompletion.ts` — completion % + checklist + kycStatus rollup (pure).
- `backend/src/routes/kyc.ts` — provider-facing KYC endpoints (upload/list/delete/file/profile).
- `backend/test/kycRequirements.test.ts`, `backend/test/profileCompletion.test.ts`, `backend/test/kyc.test.ts`, `backend/test/adminKyc.test.ts`.

**Backend (modify):**
- `backend/src/schema.ts` — add `kycDocuments` table + `providers.kycStatus`.
- `backend/src/lib/s3.ts` — add private-bucket upload + object-stream helpers.
- `backend/src/config.ts` — add `MINIO_KYC_BUCKET`.
- `backend/src/app.ts` — mount the KYC router.
- `backend/src/routes/admin.ts` — add admin KYC list + review endpoints.
- `backend/test/helpers.ts` — allow choosing `business_type` when onboarding a test provider.
- `docker-compose.yml`, `.env.production.example` — add `MINIO_KYC_BUCKET`.

**Public frontend (create):**
- `frontend/src/lib/kyc.ts` — API calls + shared TS types.
- `frontend/src/components/provider/ProfileCompletionBar.tsx`
- `frontend/src/components/provider/VerifiedBadge.tsx`
- `frontend/src/components/provider/dashboard/KycSection.tsx`

**Public frontend (modify):**
- `frontend/src/pages/ProviderDashboard.tsx` — add "Complete your profile" card + KycSection on the Business Profile tab.
- `frontend/src/components/ListingCard.tsx`, `frontend/src/pages/ListingDetail.tsx` — show VerifiedBadge.
- `frontend/src/locales/{en,bn,hi,ne}.json` — new strings.

**Admin frontend (create/modify):**
- `frontend-admin/src/pages/KycReview.tsx` (create) + wire a nav entry/route in `frontend-admin/src/App.tsx`.

---

## Phase 1 — Backend pure logic (no DB, no HTTP)

### Task 1: Shared KYC requirements module

**Files:**
- Create: `backend/src/lib/kycRequirements.ts`
- Test: `backend/test/kycRequirements.test.ts`

**Interfaces:**
- Produces:
  - `type DocRequirement = { docType: string; label: string; required: boolean }`
  - `KYC_REQUIREMENTS: Record<string, DocRequirement[]>`
  - `requirementsFor(businessType: string): DocRequirement[]`
  - `isAllowedDocType(businessType: string, docType: string): boolean`
  - `requiredDocTypes(businessType: string): string[]`

- [ ] **Step 1: Write the failing test**

Create `backend/test/kycRequirements.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  requirementsFor,
  isAllowedDocType,
  requiredDocTypes,
} from '../src/lib/kycRequirements';

describe('kycRequirements', () => {
  it('driver requires 6 documents', () => {
    expect(requiredDocTypes('driver').sort()).toEqual(
      ['aadhaar', 'commercial_permit', 'driving_license', 'owner_photo', 'pan', 'vehicle_rc'].sort()
    );
  });

  it('homestay has tourism_registration required and gst_certificate optional', () => {
    const reqs = requirementsFor('homestay');
    expect(reqs.find(r => r.docType === 'tourism_registration')?.required).toBe(true);
    expect(reqs.find(r => r.docType === 'gst_certificate')?.required).toBe(false);
  });

  it('shop requires trade_license but fssai_license is optional', () => {
    expect(requiredDocTypes('shop')).toContain('trade_license');
    expect(requiredDocTypes('shop')).not.toContain('fssai_license');
    expect(isAllowedDocType('shop', 'fssai_license')).toBe(true);
  });

  it('rejects a docType not allowed for the type', () => {
    expect(isAllowedDocType('cafe', 'driving_license')).toBe(false);
  });

  it('returns empty requirements for non-onboardable types', () => {
    expect(requirementsFor('spot')).toEqual([]);
    expect(requiredDocTypes('event')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/kycRequirements.test.ts`
Expected: FAIL — cannot find module `../src/lib/kycRequirements`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/lib/kycRequirements.ts`:

```ts
export type DocRequirement = { docType: string; label: string; required: boolean };

// v1 matrix — approved in the design spec (§3). Single source of truth for
// backend validation, completion math, and the frontend checklist.
const IDENTITY: DocRequirement[] = [
  { docType: 'aadhaar', label: 'Aadhaar card', required: true },
  { docType: 'pan', label: 'PAN card', required: true },
  { docType: 'owner_photo', label: 'Owner photo / selfie', required: true },
];

export const KYC_REQUIREMENTS: Record<string, DocRequirement[]> = {
  driver: [
    ...IDENTITY,
    { docType: 'driving_license', label: 'Driving licence', required: true },
    { docType: 'vehicle_rc', label: 'Vehicle registration (RC)', required: true },
    { docType: 'commercial_permit', label: 'Commercial / tourist permit', required: true },
  ],
  homestay: [
    ...IDENTITY,
    { docType: 'property_proof', label: 'Property proof (deed / rent / electricity bill)', required: true },
    { docType: 'tourism_registration', label: 'Tourism / homestay registration', required: true },
    { docType: 'gst_certificate', label: 'GST certificate', required: false },
  ],
  cafe: [
    ...IDENTITY,
    { docType: 'fssai_license', label: 'FSSAI food licence', required: true },
    { docType: 'trade_license', label: 'Shop & Establishment / trade licence', required: true },
    { docType: 'gst_certificate', label: 'GST certificate', required: false },
  ],
  shop: [
    ...IDENTITY,
    { docType: 'trade_license', label: 'Shop & Establishment / trade licence', required: true },
    { docType: 'fssai_license', label: 'FSSAI food licence', required: false },
    { docType: 'gst_certificate', label: 'GST certificate', required: false },
  ],
};

export function requirementsFor(businessType: string): DocRequirement[] {
  return KYC_REQUIREMENTS[businessType] ?? [];
}

export function isAllowedDocType(businessType: string, docType: string): boolean {
  return requirementsFor(businessType).some(d => d.docType === docType);
}

export function requiredDocTypes(businessType: string): string[] {
  return requirementsFor(businessType).filter(d => d.required).map(d => d.docType);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/kycRequirements.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/kycRequirements.ts backend/test/kycRequirements.test.ts
git commit -m "feat(kyc): add per-type KYC document requirements module"
```

---

### Task 2: Completion + rollup math module

**Files:**
- Create: `backend/src/lib/profileCompletion.ts`
- Test: `backend/test/profileCompletion.test.ts`

**Interfaces:**
- Consumes: `requirementsFor`, `requiredDocTypes` from `kycRequirements.ts`.
- Produces:
  - `type DocState = 'missing' | 'in_review' | 'done' | 'rejected'`
  - `type ChecklistItem = { key: string; label: string; kind: 'profile' | 'kyc'; required: boolean; state: DocState }`
  - `type KycStatus = 'none' | 'partial' | 'submitted' | 'verified'`
  - `type ProfileInput = { businessType: string; description: string; images: string[]; priceFrom: number; latitude: number | null; longitude: number | null }`
  - `type DocInput = { docType: string; status: 'pending' | 'approved' | 'rejected' }`
  - `computeCompletion(profile: ProfileInput, docs: DocInput[]): { completionPercent: number; checklist: ChecklistItem[]; kycStatus: KycStatus }`

- [ ] **Step 1: Write the failing test**

Create `backend/test/profileCompletion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeCompletion, ProfileInput } from '../src/lib/profileCompletion';

const richProfile: ProfileInput = {
  businessType: 'shop',
  description: 'x'.repeat(60),
  images: ['a.jpg'],
  priceFrom: 100,
  latitude: 27.0,
  longitude: 88.2,
};

describe('computeCompletion', () => {
  it('empty shop profile with no docs is 0% and kycStatus none', () => {
    const r = computeCompletion(
      { businessType: 'shop', description: '', images: [], priceFrom: 0, latitude: null, longitude: null },
      []
    );
    expect(r.completionPercent).toBe(0);
    expect(r.kycStatus).toBe('none');
  });

  it('rich profile with no KYC gives the profile portion (40%)', () => {
    const r = computeCompletion(richProfile, []);
    expect(r.completionPercent).toBe(40);
    expect(r.kycStatus).toBe('none');
  });

  it('rich profile with all required shop docs approved is 100% and verified', () => {
    const docs = [
      { docType: 'aadhaar', status: 'approved' as const },
      { docType: 'pan', status: 'approved' as const },
      { docType: 'owner_photo', status: 'approved' as const },
      { docType: 'trade_license', status: 'approved' as const },
    ];
    const r = computeCompletion(richProfile, docs);
    expect(r.completionPercent).toBe(100);
    expect(r.kycStatus).toBe('verified');
  });

  it('all required docs uploaded but pending is submitted, not verified', () => {
    const docs = [
      { docType: 'aadhaar', status: 'pending' as const },
      { docType: 'pan', status: 'pending' as const },
      { docType: 'owner_photo', status: 'pending' as const },
      { docType: 'trade_license', status: 'pending' as const },
    ];
    const r = computeCompletion(richProfile, docs);
    expect(r.kycStatus).toBe('submitted');
    // pending docs do not fill the KYC portion
    expect(r.completionPercent).toBe(40);
    const aadhaar = r.checklist.find(c => c.key === 'aadhaar');
    expect(aadhaar?.state).toBe('in_review');
  });

  it('some docs present is partial; rejected surfaces as rejected state', () => {
    const docs = [{ docType: 'aadhaar', status: 'rejected' as const }];
    const r = computeCompletion(richProfile, docs);
    expect(r.kycStatus).toBe('partial');
    expect(r.checklist.find(c => c.key === 'aadhaar')?.state).toBe('rejected');
  });

  it('optional docs do not block 100%', () => {
    const docs = [
      { docType: 'aadhaar', status: 'approved' as const },
      { docType: 'pan', status: 'approved' as const },
      { docType: 'owner_photo', status: 'approved' as const },
      { docType: 'trade_license', status: 'approved' as const },
    ];
    const r = computeCompletion(richProfile, docs); // gst_certificate + fssai_license optional, absent
    expect(r.completionPercent).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/profileCompletion.test.ts`
Expected: FAIL — cannot find module `../src/lib/profileCompletion`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/lib/profileCompletion.ts`:

```ts
import { requirementsFor, requiredDocTypes } from './kycRequirements';

export type DocState = 'missing' | 'in_review' | 'done' | 'rejected';
export type KycStatus = 'none' | 'partial' | 'submitted' | 'verified';

export type ChecklistItem = {
  key: string;
  label: string;
  kind: 'profile' | 'kyc';
  required: boolean;
  state: DocState;
};

export type ProfileInput = {
  businessType: string;
  description: string;
  images: string[];
  priceFrom: number;
  latitude: number | null;
  longitude: number | null;
};

export type DocInput = { docType: string; status: 'pending' | 'approved' | 'rejected' };

const PROFILE_WEIGHT = 40;
const KYC_WEIGHT = 60;

// Presence checks that make up the "profile richness" portion of the bar.
function profileChecks(p: ProfileInput): { key: string; label: string; done: boolean }[] {
  return [
    { key: 'description', label: 'Add a description (60+ characters)', done: p.description.trim().length >= 60 },
    { key: 'photos', label: 'Add at least one photo', done: p.images.length >= 1 },
    { key: 'price', label: 'Set a starting price', done: p.priceFrom > 0 },
    { key: 'location', label: 'Pin your location on the map', done: p.latitude != null && p.longitude != null },
  ];
}

function docState(doc: DocInput | undefined): DocState {
  if (!doc) return 'missing';
  if (doc.status === 'approved') return 'done';
  if (doc.status === 'rejected') return 'rejected';
  return 'in_review';
}

export function computeCompletion(
  profile: ProfileInput,
  docs: DocInput[]
): { completionPercent: number; checklist: ChecklistItem[]; kycStatus: KycStatus } {
  const byType = new Map(docs.map(d => [d.docType, d]));

  // Profile portion
  const pChecks = profileChecks(profile);
  const profileDone = pChecks.filter(c => c.done).length;
  const profileScore = pChecks.length ? (profileDone / pChecks.length) * PROFILE_WEIGHT : PROFILE_WEIGHT;

  // KYC portion (required docs only count toward the bar)
  const reqs = requirementsFor(profile.businessType);
  const requiredTypes = requiredDocTypes(profile.businessType);
  const approvedRequired = requiredTypes.filter(t => byType.get(t)?.status === 'approved').length;
  const kycScore = requiredTypes.length
    ? (approvedRequired / requiredTypes.length) * KYC_WEIGHT
    : KYC_WEIGHT; // no requirements → treat KYC portion as complete

  const completionPercent = Math.min(100, Math.round(profileScore + kycScore));

  // Checklist: profile items then KYC items
  const checklist: ChecklistItem[] = [
    ...pChecks.map(c => ({
      key: c.key,
      label: c.label,
      kind: 'profile' as const,
      required: true,
      state: (c.done ? 'done' : 'missing') as DocState,
    })),
    ...reqs.map(r => ({
      key: r.docType,
      label: r.label,
      kind: 'kyc' as const,
      required: r.required,
      state: docState(byType.get(r.docType)),
    })),
  ];

  // kycStatus rollup
  let kycStatus: KycStatus;
  if (requiredTypes.length === 0) {
    kycStatus = 'none';
  } else if (requiredTypes.every(t => byType.get(t)?.status === 'approved')) {
    kycStatus = 'verified';
  } else if (requiredTypes.every(t => byType.has(t))) {
    kycStatus = 'submitted';
  } else if (docs.length > 0) {
    kycStatus = 'partial';
  } else {
    kycStatus = 'none';
  }

  return { completionPercent, checklist, kycStatus };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/profileCompletion.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/profileCompletion.ts backend/test/profileCompletion.test.ts
git commit -m "feat(kyc): add profile-completion and kycStatus computation"
```

---

## Phase 2 — Schema, storage, and config

### Task 3: Add `kyc_documents` table and `providers.kycStatus`

**Files:**
- Modify: `backend/src/schema.ts`
- Generate: `backend/drizzle/*.sql` (via drizzle-kit)

**Interfaces:**
- Produces: `schema.kycDocuments` Drizzle table; `providers.kycStatus` column.

- [ ] **Step 1: Add the column to `providers` and the new table**

In `backend/src/schema.ts`, add `kycStatus` to the `providers` table (after `status`):

```ts
  status: text('status').notNull(),
  kycStatus: text('kyc_status').default('none').notNull(),
  createdAt: text('created_at').notNull(),
```

Append the new table at the end of `backend/src/schema.ts`:

```ts
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
});
```

- [ ] **Step 2: Generate the migration**

Run: `cd backend && npm run db:generate`
Expected: a new file `backend/drizzle/0003_*.sql` is created adding `kyc_status` to `providers` and creating `kyc_documents`.

- [ ] **Step 3: Apply the migration to the dev DB**

Run: `cd backend && npm run db:migrate`
Expected: migration applied with no error.

- [ ] **Step 4: Refresh the test DB**

Run: `cd backend && npm run test:setup`
Expected: completes without error (test DB now has the new table/column).

- [ ] **Step 5: Commit**

```bash
git add backend/src/schema.ts backend/drizzle/
git commit -m "feat(kyc): add kyc_documents table and providers.kycStatus"
```

---

### Task 4: Config + docker-compose for the private KYC bucket

**Files:**
- Modify: `backend/src/config.ts`, `docker-compose.yml`, `.env.production.example`

**Interfaces:**
- Produces: `MINIO_KYC_BUCKET` export from `config.ts`.

- [ ] **Step 1: Add the config export**

In `backend/src/config.ts`, after the `MINIO_PUBLIC_URL` line (~151):

```ts
export const MINIO_KYC_BUCKET = process.env.MINIO_KYC_BUCKET || 'one-darjeeling-kyc';
```

- [ ] **Step 2: Add the env var to docker-compose**

In `docker-compose.yml`, under the `backend` service `environment:` list, after `MINIO_PUBLIC_URL`:

```yaml
      - MINIO_KYC_BUCKET=one-darjeeling-kyc
```

- [ ] **Step 3: Document it in the prod example**

In `.env.production.example`, add near the other `MINIO_` vars:

```
MINIO_KYC_BUCKET=one-darjeeling-kyc
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/config.ts docker-compose.yml .env.production.example
git commit -m "feat(kyc): configure private KYC bucket name"
```

---

### Task 5: Private-bucket S3 helpers

**Files:**
- Modify: `backend/src/lib/s3.ts`

**Interfaces:**
- Consumes: `MINIO_KYC_BUCKET` from config.
- Produces:
  - `uploadPrivate(buffer: Buffer, key: string, contentType: string): Promise<string>` — uploads to the private bucket, returns the **object key** (not a URL).
  - `getPrivateObject(key: string): Promise<{ stream: Readable; contentType?: string }>` — fetches an object for streaming.

- [ ] **Step 1: Extend `s3.ts`**

At the top of `backend/src/lib/s3.ts`, extend the imports:

```ts
import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
```

Add `MINIO_KYC_BUCKET` to the config import line:

```ts
import {
  MINIO_ENDPOINT,
  MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY,
  MINIO_BUCKET,
  MINIO_PUBLIC_URL,
  MINIO_KYC_BUCKET,
  log
} from '../config';
```

Append to the end of `backend/src/lib/s3.ts`:

```ts
let kycBucketBootstrapped = false;

// The KYC bucket is created WITHOUT any public-read policy — objects are only
// reachable through the authorized backend proxy, never a public URL.
async function bootstrapKycBucket() {
  if (kycBucketBootstrapped) return;
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: MINIO_KYC_BUCKET }));
    kycBucketBootstrapped = true;
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      log.info(`MinIO KYC bucket "${MINIO_KYC_BUCKET}" not found. Creating (private)...`);
      await s3Client.send(new CreateBucketCommand({ Bucket: MINIO_KYC_BUCKET }));
      log.info(`Private KYC bucket "${MINIO_KYC_BUCKET}" created (no public policy).`);
      kycBucketBootstrapped = true;
    } else {
      log.error(`Failed checking/creating KYC bucket: ${err.message || err}`);
      throw err;
    }
  }
}

/** Uploads a private KYC object. Returns the object KEY (never a public URL). */
export async function uploadPrivate(buffer: Buffer, key: string, contentType: string): Promise<string> {
  await bootstrapKycBucket();
  await s3Client.send(
    new PutObjectCommand({
      Bucket: MINIO_KYC_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return key;
}

/** Fetches a private KYC object for streaming to an authorized caller. */
export async function getPrivateObject(key: string): Promise<{ stream: Readable; contentType?: string }> {
  await bootstrapKycBucket();
  const out = await s3Client.send(new GetObjectCommand({ Bucket: MINIO_KYC_BUCKET, Key: key }));
  return { stream: out.Body as Readable, contentType: out.ContentType };
}
```

- [ ] **Step 2: Type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/s3.ts
git commit -m "feat(kyc): add private-bucket upload and object-stream helpers"
```

---

## Phase 3 — Backend routes

### Task 6: Test helper — onboard a provider of a chosen type

**Files:**
- Modify: `backend/test/helpers.ts`

**Interfaces:**
- Produces: `onboardActiveProvider` accepts an optional `businessType`; returns `{ token, providerId, phone }` (unchanged shape).

- [ ] **Step 1: Make the helper type-aware**

In `backend/test/helpers.ts`, change the signature and the `business_type` it sends:

```ts
export async function onboardActiveProvider(opts: { name: string; businessType?: string }) {
  const businessType = opts.businessType || 'homestay';
  const { token, phone } = await registerUser({ name: opts.name, role: 'provider' });

  const onboardRes = await request(app)
    .post('/api/providers/onboard')
    .set('Authorization', `Bearer ${token}`)
    .send({
      business_name: `${opts.name}'s Business`,
      business_type: businessType,
      description: 'A lovely place to stay',
      location: 'Darjeeling',
      contact_phone: phone,
    });
```

(Leave the rest of the function body unchanged.)

- [ ] **Step 2: Verify existing tests still pass**

Run: `cd backend && npx vitest run test/payments.test.ts`
Expected: PASS (the default `homestay` keeps current callers working).

- [ ] **Step 3: Commit**

```bash
git add backend/test/helpers.ts
git commit -m "test(kyc): let onboardActiveProvider pick a business type"
```

---

### Task 7: Provider KYC router — profile, list, upload, delete, file

**Files:**
- Create: `backend/src/routes/kyc.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/test/kyc.test.ts`

**Interfaces:**
- Consumes: `authenticateToken` (auth.ts); `computeCompletion` (profileCompletion.ts); `isAllowedDocType` (kycRequirements.ts); `uploadPrivate`, `getPrivateObject` (s3.ts); `schema.providers`, `schema.kycDocuments`, `db` (db.ts).
- Produces routes mounted at `/api/providers`:
  - `GET /providers/me/profile`
  - `GET /providers/me/kyc`
  - `POST /providers/me/kyc`
  - `DELETE /providers/me/kyc/:docType`
  - `GET /providers/kyc/:id/file`
- Produces exported helper: `recomputeKycStatus(providerId: string): Promise<string>` (also used by admin routes in Task 8).

- [ ] **Step 1: Write the failing test**

Create `backend/test/kyc.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { onboardActiveProvider, registerUser } from './helpers';

// 1x1 transparent PNG as a data URL
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('provider KYC', () => {
  it('provider can upload an allowed doc; it starts pending', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc One', businessType: 'shop' });
    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'aadhaar.png' });
    expect(res.status).toBe(200);
    expect(res.body.document.doc_type).toBe('aadhaar');
    expect(res.body.document.status).toBe('pending');
  });

  it('rejects a doc_type not allowed for the business type', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Two', businessType: 'shop' });
    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'driving_license', file: PNG_DATA_URL, filename: 'dl.png' });
    expect(res.status).toBe(400);
  });

  it('rejects a disallowed mime type', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Three', businessType: 'shop' });
    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: 'data:text/plain;base64,aGVsbG8=', filename: 'x.txt' });
    expect(res.status).toBe(400);
  });

  it('a tourist cannot upload KYC', async () => {
    const { token } = await registerUser({ name: 'Tourist', role: 'tourist' });
    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    expect(res.status).toBe(403);
  });

  it('me/profile returns completion percent and checklist', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Four', businessType: 'shop' });
    const res = await request(app)
      .get('/api/providers/me/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.completion_percent).toBe('number');
    expect(Array.isArray(res.body.checklist)).toBe(true);
    expect(res.body.kyc_status).toBe('none');
  });

  it('re-uploading replaces the doc and keeps it pending', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Five', businessType: 'shop' });
    await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'pan', file: PNG_DATA_URL, filename: 'pan.png' });
    await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'pan', file: PNG_DATA_URL, filename: 'pan2.png' });
    const list = await request(app).get('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`);
    const panDocs = list.body.documents.filter((d: any) => d.doc_type === 'pan');
    expect(panDocs.length).toBe(1);
    expect(panDocs[0].status).toBe('pending');
  });

  it('owner can fetch their file; another provider gets 403', async () => {
    const a = await onboardActiveProvider({ name: 'Owner A', businessType: 'shop' });
    const up = await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${a.token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    const docId = up.body.document.id;

    const ownerFetch = await request(app).get(`/api/providers/kyc/${docId}/file`).set('Authorization', `Bearer ${a.token}`);
    expect(ownerFetch.status).toBe(200);

    const b = await onboardActiveProvider({ name: 'Other B', businessType: 'shop' });
    const otherFetch = await request(app).get(`/api/providers/kyc/${docId}/file`).set('Authorization', `Bearer ${b.token}`);
    expect(otherFetch.status).toBe(403);
  });

  it('owner can delete a doc', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Six', businessType: 'shop' });
    await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    const del = await request(app).delete('/api/providers/me/kyc/aadhaar').set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    const list = await request(app).get('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`);
    expect(list.body.documents.find((d: any) => d.doc_type === 'aadhaar')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/kyc.test.ts`
Expected: FAIL — routes return 404 (router not mounted yet).

- [ ] **Step 3: Write the router**

Create `backend/src/routes/kyc.ts`:

```ts
import { Router, Request, Response } from 'express';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { isAllowedDocType } from '../lib/kycRequirements';
import { computeCompletion } from '../lib/profileCompletion';
import { uploadPrivate, getPrivateObject } from '../lib/s3';

const router = Router();

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_BYTES = 5 * 1024 * 1024;
// KYC uploads carry a base64 file, which is ~33% larger than the raw bytes.
const kycJson = express.json({ limit: '8mb' });

async function ownActiveProvider(userId: string) {
  const rows = await db.select().from(schema.providers).where(eq(schema.providers.userId, userId));
  return rows.find(p => p.status === 'active') || null;
}

function docOut(d: typeof schema.kycDocuments.$inferSelect) {
  return {
    id: d.id,
    doc_type: d.docType,
    status: d.status,
    rejection_reason: d.rejectionReason,
    uploaded_at: d.uploadedAt,
    reviewed_at: d.reviewedAt,
  };
}

/** Recompute and persist providers.kycStatus from current docs. Returns the new status. */
export async function recomputeKycStatus(providerId: string): Promise<string> {
  const [provider] = await db.select().from(schema.providers).where(eq(schema.providers.id, providerId)).limit(1);
  if (!provider) return 'none';
  const docs = await db.select().from(schema.kycDocuments).where(eq(schema.kycDocuments.providerId, providerId));
  const { kycStatus } = computeCompletion(
    {
      businessType: provider.businessType,
      description: provider.description,
      images: provider.images,
      priceFrom: provider.priceFrom,
      latitude: provider.latitude,
      longitude: provider.longitude,
    },
    docs.map(d => ({ docType: d.docType, status: d.status as any }))
  );
  await db.update(schema.providers).set({ kycStatus }).where(eq(schema.providers.id, providerId));
  return kycStatus;
}

// GET /providers/me/profile — profile + completion + checklist + kycStatus
router.get('/me/profile', authenticateToken, async (req: Request, res: Response) => {
  const provider = await ownActiveProvider(req.user.id);
  if (!provider) return res.status(404).json({ detail: 'No active provider profile' });
  const docs = await db.select().from(schema.kycDocuments).where(eq(schema.kycDocuments.providerId, provider.id));
  const { completionPercent, checklist, kycStatus } = computeCompletion(
    {
      businessType: provider.businessType,
      description: provider.description,
      images: provider.images,
      priceFrom: provider.priceFrom,
      latitude: provider.latitude,
      longitude: provider.longitude,
    },
    docs.map(d => ({ docType: d.docType, status: d.status as any }))
  );
  res.json({
    provider_id: provider.id,
    business_type: provider.businessType,
    completion_percent: completionPercent,
    kyc_status: kycStatus,
    checklist,
    documents: docs.map(docOut),
  });
});

// GET /providers/me/kyc — list own docs
router.get('/me/kyc', authenticateToken, async (req: Request, res: Response) => {
  const provider = await ownActiveProvider(req.user.id);
  if (!provider) return res.status(404).json({ detail: 'No active provider profile' });
  const docs = await db.select().from(schema.kycDocuments).where(eq(schema.kycDocuments.providerId, provider.id));
  res.json({ documents: docs.map(docOut) });
});

// POST /providers/me/kyc — upload/replace a doc
router.post('/me/kyc', authenticateToken, kycJson, async (req: Request, res: Response) => {
  const provider = await ownActiveProvider(req.user.id);
  if (!provider) return res.status(403).json({ detail: 'Only active providers can upload KYC documents' });

  const { doc_type, file, filename } = req.body || {};
  if (!doc_type || !file || !filename) {
    return res.status(400).json({ detail: 'doc_type, file, and filename are required' });
  }
  if (!isAllowedDocType(provider.businessType, doc_type)) {
    return res.status(400).json({ detail: `doc_type "${doc_type}" is not valid for a ${provider.businessType}` });
  }

  const match = String(file).match(/^data:([\w/+.-]+);base64,/);
  const contentType = match ? match[1] : '';
  if (!ALLOWED_MIME.has(contentType)) {
    return res.status(400).json({ detail: 'File must be a JPEG, PNG, or PDF' });
  }
  const base64Data = String(file).replace(/^data:[\w/+.-]+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length === 0) return res.status(400).json({ detail: 'Empty file' });
  if (buffer.length > MAX_BYTES) return res.status(400).json({ detail: 'File exceeds 5 MB limit' });

  const ext = path.extname(filename) || (contentType === 'application/pdf' ? '.pdf' : '.jpg');
  const key = `${provider.id}/${doc_type}/${uuidv4()}${ext}`;
  await uploadPrivate(buffer, key, contentType);

  // One row per (provider, docType): replace any existing row, resetting to pending.
  const existing = await db.select().from(schema.kycDocuments)
    .where(and(eq(schema.kycDocuments.providerId, provider.id), eq(schema.kycDocuments.docType, doc_type)));
  for (const row of existing) {
    await db.delete(schema.kycDocuments).where(eq(schema.kycDocuments.id, row.id));
  }

  const doc = {
    id: uuidv4(),
    providerId: provider.id,
    docType: doc_type,
    fileKey: key,
    contentType,
    status: 'pending',
    rejectionReason: null,
    uploadedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
  };
  await db.insert(schema.kycDocuments).values(doc);
  await recomputeKycStatus(provider.id);
  res.json({ document: docOut(doc as any) });
});

// DELETE /providers/me/kyc/:docType — owner removes a doc
router.delete('/me/kyc/:docType', authenticateToken, async (req: Request, res: Response) => {
  const provider = await ownActiveProvider(req.user.id);
  if (!provider) return res.status(403).json({ detail: 'Only active providers can manage KYC documents' });
  await db.delete(schema.kycDocuments)
    .where(and(eq(schema.kycDocuments.providerId, provider.id), eq(schema.kycDocuments.docType, req.params.docType)));
  await recomputeKycStatus(provider.id);
  res.json({ ok: true });
});

// GET /providers/kyc/:id/file — stream a private doc to owner or admin
router.get('/kyc/:id/file', authenticateToken, async (req: Request, res: Response) => {
  const [doc] = await db.select().from(schema.kycDocuments).where(eq(schema.kycDocuments.id, req.params.id)).limit(1);
  if (!doc) return res.status(404).json({ detail: 'Not found' });

  let allowed = req.user.role === 'admin';
  if (!allowed) {
    const [provider] = await db.select().from(schema.providers).where(eq(schema.providers.id, doc.providerId)).limit(1);
    allowed = !!provider && provider.userId === req.user.id;
  }
  if (!allowed) return res.status(403).json({ detail: 'Forbidden' });

  const { stream, contentType } = await getPrivateObject(doc.fileKey);
  res.setHeader('Content-Type', contentType || doc.contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  stream.pipe(res);
});

export default router;
```

- [ ] **Step 4: Mount the router**

In `backend/src/app.ts`, add the import next to the other route imports (after line 15):

```ts
import kycRouter from './routes/kyc';
```

And mount it **before** the existing providers router so its `/me/...` and `/kyc/...` paths resolve first (near line 90):

```ts
app.use('/api/providers', kycRouter);
app.use('/api/providers', providersRouter);
```

- [ ] **Step 5: Run the KYC test**

Run: `cd backend && npx vitest run test/kyc.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/kyc.ts backend/src/app.ts backend/test/kyc.test.ts
git commit -m "feat(kyc): provider KYC upload/list/delete/file + profile endpoints"
```

---

### Task 8: Admin KYC list + review endpoints

**Files:**
- Modify: `backend/src/routes/admin.ts`
- Test: `backend/test/adminKyc.test.ts`

**Interfaces:**
- Consumes: `authenticateToken`, `requireAdmin` (auth.ts); `recomputeKycStatus` (routes/kyc.ts); `db`, `schema`.
- Produces routes: `GET /admin/kyc?status=`, `POST /admin/kyc/:id/review`.

- [ ] **Step 1: Write the failing test**

Create `backend/test/adminKyc.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { onboardActiveProvider, loginAdmin } from './helpers';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function uploadAllShopDocs(token: string) {
  for (const t of ['aadhaar', 'pan', 'owner_photo', 'trade_license']) {
    await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: t, file: PNG_DATA_URL, filename: `${t}.png` });
  }
}

describe('admin KYC review', () => {
  it('lists pending documents', async () => {
    const { token } = await onboardActiveProvider({ name: 'Prov P', businessType: 'shop' });
    await uploadAllShopDocs(token);
    const admin = await loginAdmin();
    const res = await request(app).get('/api/admin/kyc?status=pending').set('Authorization', `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.documents.length).toBeGreaterThanOrEqual(4);
  });

  it('non-admin cannot list KYC', async () => {
    const { token } = await onboardActiveProvider({ name: 'Prov Q', businessType: 'shop' });
    const res = await request(app).get('/api/admin/kyc').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('approving all required docs makes the provider verified', async () => {
    const prov = await onboardActiveProvider({ name: 'Prov R', businessType: 'shop' });
    await uploadAllShopDocs(prov.token);
    const admin = await loginAdmin();

    const list = await request(app).get('/api/admin/kyc?status=pending').set('Authorization', `Bearer ${admin}`);
    const mine = list.body.documents.filter((d: any) => d.provider_id === prov.providerId);
    for (const d of mine) {
      const r = await request(app).post(`/api/admin/kyc/${d.id}/review`)
        .set('Authorization', `Bearer ${admin}`).send({ decision: 'approve' });
      expect(r.status).toBe(200);
    }
    const profile = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${prov.token}`);
    expect(profile.body.kyc_status).toBe('verified');
    expect(profile.body.completion_percent).toBeGreaterThanOrEqual(60);
  });

  it('rejecting a doc records the reason', async () => {
    const prov = await onboardActiveProvider({ name: 'Prov S', businessType: 'shop' });
    await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${prov.token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    const admin = await loginAdmin();
    const list = await request(app).get('/api/admin/kyc?status=pending').set('Authorization', `Bearer ${admin}`);
    const doc = list.body.documents.find((d: any) => d.provider_id === prov.providerId);
    const r = await request(app).post(`/api/admin/kyc/${doc.id}/review`)
      .set('Authorization', `Bearer ${admin}`).send({ decision: 'reject', reason: 'Blurry scan' });
    expect(r.status).toBe(200);
    expect(r.body.document.status).toBe('rejected');
    expect(r.body.document.rejection_reason).toBe('Blurry scan');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/adminKyc.test.ts`
Expected: FAIL — `/api/admin/kyc` returns 404.

- [ ] **Step 3: Implement the endpoints**

In `backend/src/routes/admin.ts`, add imports at the top (the file already imports `db`, `schema`, `eq`, `and`, `authenticateToken`, `requireAdmin`):

```ts
import { recomputeKycStatus } from './kyc';
```

Add these routes to the router (before `export default router;`):

```ts
// GET /admin/kyc?status=pending — list KYC documents with provider/user context
router.get('/admin/kyc', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
  const rows = await db.select().from(schema.kycDocuments);
  const providers = await db.select().from(schema.providers);
  const users = await db.select().from(schema.users);
  const pById = new Map(providers.map(p => [p.id, p]));
  const uById = new Map(users.map(u => [u.id, u]));

  const documents = rows
    .filter(d => !statusFilter || d.status === statusFilter)
    .map(d => {
      const p = pById.get(d.providerId);
      const u = p ? uById.get(p.userId) : undefined;
      return {
        id: d.id,
        provider_id: d.providerId,
        doc_type: d.docType,
        status: d.status,
        rejection_reason: d.rejectionReason,
        uploaded_at: d.uploadedAt,
        business_name: p?.businessName || null,
        business_type: p?.businessType || null,
        owner_name: u?.name || null,
        file_url: `/api/providers/kyc/${d.id}/file`,
      };
    });
  res.json({ documents });
});

// POST /admin/kyc/:id/review — approve or reject a document
router.post('/admin/kyc/:id/review', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const { decision, reason } = req.body || {};
  if (decision !== 'approve' && decision !== 'reject') {
    return res.status(400).json({ detail: "decision must be 'approve' or 'reject'" });
  }
  const [doc] = await db.select().from(schema.kycDocuments).where(eq(schema.kycDocuments.id, req.params.id)).limit(1);
  if (!doc) return res.status(404).json({ detail: 'Not found' });

  const status = decision === 'approve' ? 'approved' : 'rejected';
  await db.update(schema.kycDocuments).set({
    status,
    rejectionReason: decision === 'reject' ? (reason || null) : null,
    reviewedAt: new Date().toISOString(),
    reviewedBy: req.user.id,
  }).where(eq(schema.kycDocuments.id, doc.id));

  const kycStatus = await recomputeKycStatus(doc.providerId);
  res.json({
    document: { id: doc.id, doc_type: doc.docType, status, rejection_reason: decision === 'reject' ? (reason || null) : null },
    provider_kyc_status: kycStatus,
  });
});
```

- [ ] **Step 4: Run the admin KYC test**

Run: `cd backend && npx vitest run test/adminKyc.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full backend suite (no regressions)**

Run: `cd backend && npm test`
Expected: all tests pass (existing 45 + the new KYC tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/admin.ts backend/test/adminKyc.test.ts
git commit -m "feat(kyc): admin KYC listing and approve/reject review endpoints"
```

---

## Phase 4 — Public frontend

### Task 9: KYC API client + types

**Files:**
- Create: `frontend/src/lib/kyc.ts`

**Interfaces:**
- Consumes: default `api` axios instance from `frontend/src/lib/api.ts`.
- Produces:
  - `type ChecklistItem = { key: string; label: string; kind: 'profile' | 'kyc'; required: boolean; state: 'missing' | 'in_review' | 'done' | 'rejected' }`
  - `type KycProfile = { provider_id: string; business_type: string; completion_percent: number; kyc_status: 'none'|'partial'|'submitted'|'verified'; checklist: ChecklistItem[]; documents: KycDoc[] }`
  - `type KycDoc = { id: string; doc_type: string; status: string; rejection_reason: string | null; uploaded_at: string; reviewed_at: string | null }`
  - `getMyProfile(): Promise<KycProfile>`
  - `uploadKycDoc(docType: string, file: File): Promise<KycDoc>`
  - `deleteKycDoc(docType: string): Promise<void>`

- [ ] **Step 1: Write the client**

Create `frontend/src/lib/kyc.ts`:

```ts
import api from '@/lib/api';

export type DocState = 'missing' | 'in_review' | 'done' | 'rejected';
export interface ChecklistItem {
  key: string;
  label: string;
  kind: 'profile' | 'kyc';
  required: boolean;
  state: DocState;
}
export interface KycDoc {
  id: string;
  doc_type: string;
  status: string;
  rejection_reason: string | null;
  uploaded_at: string;
  reviewed_at: string | null;
}
export interface KycProfile {
  provider_id: string;
  business_type: string;
  completion_percent: number;
  kyc_status: 'none' | 'partial' | 'submitted' | 'verified';
  checklist: ChecklistItem[];
  documents: KycDoc[];
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject('File reading failed');
    reader.readAsDataURL(file);
  });
}

export async function getMyProfile(): Promise<KycProfile> {
  const { data } = await api.get('/providers/me/profile');
  return data;
}

export async function uploadKycDoc(docType: string, file: File): Promise<KycDoc> {
  const dataUrl = await toDataUrl(file);
  try {
    const { data } = await api.post('/providers/me/kyc', { doc_type: docType, file: dataUrl, filename: file.name });
    return data.document;
  } catch (err: any) {
    throw err?.response?.data?.detail || 'Upload failed';
  }
}

export async function deleteKycDoc(docType: string): Promise<void> {
  await api.delete(`/providers/me/kyc/${docType}`);
}
```

- [ ] **Step 2: Type-check the frontend**

Run: `cd frontend && corepack yarn@1.22.22 tsc --noEmit`
Expected: no new errors from `src/lib/kyc.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/kyc.ts
git commit -m "feat(kyc): frontend KYC API client and types"
```

---

### Task 10: ProfileCompletionBar + VerifiedBadge components

**Files:**
- Create: `frontend/src/components/provider/ProfileCompletionBar.tsx`
- Create: `frontend/src/components/provider/VerifiedBadge.tsx`

**Interfaces:**
- Produces:
  - `ProfileCompletionBar({ percent }: { percent: number })`
  - `VerifiedBadge({ size?: 'sm' | 'md' })`

- [ ] **Step 1: Write ProfileCompletionBar**

Create `frontend/src/components/provider/ProfileCompletionBar.tsx`:

```tsx
import React from 'react';

/** A pine-green progress bar with a percentage label. */
export default function ProfileCompletionBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-ink-soft">Profile completion</span>
        <span className="text-xs font-bold text-pine">{clamped}%</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-[var(--line)] overflow-hidden">
        <div
          className="h-full rounded-full bg-pine transition-all duration-500"
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write VerifiedBadge**

Create `frontend/src/components/provider/VerifiedBadge.tsx`:

```tsx
import React from 'react';
import { BadgeCheck } from 'lucide-react';

/** Shown when a provider's kyc_status is 'verified'. */
export default function VerifiedBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const px = size === 'md' ? 16 : 13;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-pine/10 text-pine font-bold px-2 py-0.5 text-[11px]"
      title="KYC verified by 1 Darjeeling"
    >
      <BadgeCheck size={px} /> Verified
    </span>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && corepack yarn@1.22.22 tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/provider/ProfileCompletionBar.tsx frontend/src/components/provider/VerifiedBadge.tsx
git commit -m "feat(kyc): profile completion bar and verified badge components"
```

---

### Task 11: KycSection component

**Files:**
- Create: `frontend/src/components/provider/dashboard/KycSection.tsx`

**Interfaces:**
- Consumes: `getMyProfile`, `uploadKycDoc`, `deleteKycDoc`, `KycProfile`, `ChecklistItem` from `@/lib/kyc`; `ProfileCompletionBar`.
- Produces: `KycSection({ onProfileChange }: { onProfileChange?: (p: KycProfile) => void })` — self-contained; fetches its own data.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/provider/dashboard/KycSection.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Upload, CheckCircle2, Clock, XCircle, Circle } from 'lucide-react';
import { getMyProfile, uploadKycDoc, deleteKycDoc, KycProfile, ChecklistItem } from '@/lib/kyc';
import ProfileCompletionBar from '../ProfileCompletionBar';

const stateMeta: Record<ChecklistItem['state'], { icon: React.ReactNode; label: string; cls: string }> = {
  done: { icon: <CheckCircle2 size={16} />, label: 'Verified', cls: 'text-pine' },
  in_review: { icon: <Clock size={16} />, label: 'In review', cls: 'text-golden' },
  rejected: { icon: <XCircle size={16} />, label: 'Rejected', cls: 'text-flag' },
  missing: { icon: <Circle size={16} />, label: 'Missing', cls: 'text-ink-soft' },
};

export default function KycSection({ onProfileChange }: { onProfileChange?: (p: KycProfile) => void }) {
  const [profile, setProfile] = useState<KycProfile | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = async () => {
    const p = await getMyProfile();
    setProfile(p);
    onProfileChange?.(p);
  };
  useEffect(() => { load().catch(() => setError('Could not load your profile')); }, []);

  const onPick = async (docType: string, file?: File) => {
    if (!file) return;
    setBusyKey(docType);
    setError(null);
    try {
      await uploadKycDoc(docType, file);
      await load();
    } catch (e) {
      setError(typeof e === 'string' ? e : 'Upload failed');
    } finally {
      setBusyKey(null);
    }
  };

  const onDelete = async (docType: string) => {
    setBusyKey(docType);
    try { await deleteKycDoc(docType); await load(); }
    finally { setBusyKey(null); }
  };

  if (!profile) return <div className="text-sm text-ink-soft">Loading…</div>;

  const kycItems = profile.checklist.filter(c => c.kind === 'kyc');
  const profileItems = profile.checklist.filter(c => c.kind === 'profile');

  return (
    <div className="space-y-6">
      <ProfileCompletionBar percent={profile.completion_percent} />
      {error && <div className="text-sm text-flag font-semibold">{error}</div>}

      <div>
        <h3 className="font-bold text-ink mb-2">Complete your listing</h3>
        <ul className="space-y-2">
          {profileItems.map(item => {
            const m = stateMeta[item.state];
            return (
              <li key={item.key} className="flex items-center gap-2 text-sm">
                <span className={m.cls}>{m.icon}</span>
                <span className={item.state === 'done' ? 'text-ink-soft line-through' : 'text-ink'}>{item.label}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-ink mb-1">Verification (KYC)</h3>
        <p className="text-xs text-ink-soft mb-3">Optional — upload these to earn a Verified badge. JPEG, PNG, or PDF, up to 5&nbsp;MB.</p>
        <ul className="space-y-3">
          {kycItems.map(item => {
            const m = stateMeta[item.state];
            const doc = profile.documents.find(d => d.doc_type === item.key);
            return (
              <li key={item.key} className="rounded-2xl border border-[var(--line)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={m.cls}>{m.icon}</span>
                    <div>
                      <div className="text-sm font-semibold text-ink">
                        {item.label}{!item.required && <span className="text-ink-soft font-normal"> (optional)</span>}
                      </div>
                      <div className={`text-xs ${m.cls}`}>{m.label}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 text-xs font-bold text-pine cursor-pointer">
                      <Upload size={12} /> {busyKey === item.key ? 'Uploading…' : (item.state === 'missing' ? 'Upload' : 'Replace')}
                      <input
                        ref={el => { fileInputs.current[item.key] = el; }}
                        type="file"
                        accept="image/jpeg,image/png,application/pdf"
                        className="hidden"
                        disabled={busyKey === item.key}
                        onChange={e => onPick(item.key, e.target.files?.[0])}
                      />
                    </label>
                    {doc && (
                      <button className="text-xs text-flag font-semibold" onClick={() => onDelete(item.key)} disabled={busyKey === item.key}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                {item.state === 'rejected' && doc?.rejection_reason && (
                  <div className="mt-2 text-xs text-flag">Reason: {doc.rejection_reason}. Please re-upload.</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && corepack yarn@1.22.22 tsc --noEmit`
Expected: no new errors. (If `text-golden`/`text-flag`/`text-pine`/`bg-pine` are not already Tailwind tokens in this repo, confirm they exist in `tailwind.config`/`index.css`; they are used by existing provider components per the design system, so they should resolve.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/provider/dashboard/KycSection.tsx
git commit -m "feat(kyc): KycSection with per-type checklist and upload controls"
```

---

### Task 12: Wire KycSection + completion card into the Provider Dashboard

**Files:**
- Modify: `frontend/src/pages/ProviderDashboard.tsx`

**Interfaces:**
- Consumes: `KycSection`, `KycProfile`, `VerifiedBadge`.

- [ ] **Step 1: Read the dashboard to find the Business Profile tab and header**

Run: `grep -n "Business Profile\|activeTab\|tab ===\|status badge\|kycStatus\|<Header\|businessName" frontend/src/pages/ProviderDashboard.tsx`
Expected: identifies where tabs render and where the status badge/header sits.

- [ ] **Step 2: Import the new pieces**

At the top of `frontend/src/pages/ProviderDashboard.tsx`, add:

```tsx
import KycSection from '@/components/provider/dashboard/KycSection';
import VerifiedBadge from '@/components/provider/VerifiedBadge';
import type { KycProfile } from '@/lib/kyc';
```

- [ ] **Step 3: Track the profile and show the badge**

Add state near the other `useState` hooks:

```tsx
const [kycProfile, setKycProfile] = useState<KycProfile | null>(null);
```

Next to the provider's business name/status badge in the header, render the badge when verified:

```tsx
{kycProfile?.kyc_status === 'verified' && <VerifiedBadge size="md" />}
```

- [ ] **Step 4: Render KycSection on the Business Profile tab**

Inside the Business Profile tab's content, add the section (adapt the conditional to the file's tab variable found in Step 1):

```tsx
<div className="rounded-2xl bg-white p-4 shadow-soft mb-6">
  <KycSection onProfileChange={setKycProfile} />
</div>
```

- [ ] **Step 5: Verify it renders (build)**

Run: `cd frontend && corepack yarn@1.22.22 build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ProviderDashboard.tsx
git commit -m "feat(kyc): show completion bar, KYC section, and verified badge on provider dashboard"
```

---

### Task 13: Surface the Verified badge on public listings

**Files:**
- Modify: `frontend/src/components/ListingCard.tsx`, `frontend/src/pages/ListingDetail.tsx`

**Interfaces:**
- Consumes: `VerifiedBadge`. Depends on listing/provider data exposing `kyc_status` or a `verified` flag.

- [ ] **Step 1: Confirm whether listing payloads expose provider verification**

Run: `grep -rn "kyc_status\|provider_id\|verified" backend/src/routes/listings.ts`
Expected: determine if a listing response already carries the owning provider's `kycStatus`.

- [ ] **Step 2: If not present, expose it from the listings endpoint**

In `backend/src/routes/listings.ts`, where a listing is serialized for `GET /listings` and `GET /listings/:id`, look up the owning provider (`schema.providers` where `id === listing.providerId`) and add `provider_verified: provider?.kycStatus === 'verified'` to the returned object. (Seed listings whose `providerId` is `admin-seed-provider` have no provider row → `provider_verified: false`.)

Add a backend test in `backend/test/listings.test.ts`:

```ts
it('listing payload includes provider_verified flag', async () => {
  const listing = await createListing({ title: 'Verified flag listing' });
  const res = await request(app).get(`/api/listings/${listing.id}`);
  expect(res.status).toBe(200);
  expect(res.body.item).toHaveProperty('provider_verified');
});
```

Run: `cd backend && npx vitest run test/listings.test.ts`
Expected: PASS.

- [ ] **Step 3: Render the badge in ListingCard**

In `frontend/src/components/ListingCard.tsx`, import and render conditionally near the title:

```tsx
import VerifiedBadge from '@/components/provider/VerifiedBadge';
// ...where the title/meta renders:
{listing.provider_verified && <VerifiedBadge />}
```

- [ ] **Step 4: Render the badge in ListingDetail**

In `frontend/src/pages/ListingDetail.tsx`, near the listing title/host info:

```tsx
import VerifiedBadge from '@/components/provider/VerifiedBadge';
// ...
{listing.provider_verified && <VerifiedBadge size="md" />}
```

- [ ] **Step 5: Build**

Run: `cd frontend && corepack yarn@1.22.22 build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/listings.ts backend/test/listings.test.ts frontend/src/components/ListingCard.tsx frontend/src/pages/ListingDetail.tsx
git commit -m "feat(kyc): expose and show provider verified badge on public listings"
```

---

### Task 14: i18n strings

**Files:**
- Modify: `frontend/src/locales/en.json`, `frontend/src/locales/bn.json`, `frontend/src/locales/hi.json`, `frontend/src/locales/ne.json`

**Interfaces:** none (translation keys only).

- [ ] **Step 1: Add keys to `en.json`**

Add a `kyc` block (place alongside existing top-level sections):

```json
"kyc": {
  "profileCompletion": "Profile completion",
  "completeYourListing": "Complete your listing",
  "verification": "Verification (KYC)",
  "verificationHelp": "Optional — upload these to earn a Verified badge. JPEG, PNG, or PDF, up to 5 MB.",
  "verified": "Verified",
  "inReview": "In review",
  "rejected": "Rejected",
  "missing": "Missing",
  "upload": "Upload",
  "replace": "Replace",
  "remove": "Remove",
  "optional": "optional"
}
```

- [ ] **Step 2: Mirror the block into `bn.json`, `hi.json`, `ne.json`**

Add the same `kyc` block to each of the other three locale files. Translate the values (English fallback is acceptable if a translation is unavailable, since `fallbackLng: 'en'` is configured). At minimum, keep identical keys so lookups don't miss.

- [ ] **Step 3: Build to confirm JSON validity**

Run: `cd frontend && corepack yarn@1.22.22 build`
Expected: build succeeds (no JSON parse errors).

> Note: The `KycSection` component in Task 11 uses literal English strings for speed. Swapping them to `t('kyc.*')` is a nice-to-have refinement; the keys added here make that a drop-in change and cover the dashboard copy either way. If you prefer full i18n now, replace the literals in `KycSection.tsx` with `useTranslation()` lookups in this task.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/locales/
git commit -m "feat(kyc): add KYC i18n strings across locales"
```

---

## Phase 5 — Admin app

### Task 15: Admin KYC review page

**Files:**
- Create: `frontend-admin/src/pages/KycReview.tsx`
- Modify: `frontend-admin/src/App.tsx` (add route/nav entry)

**Interfaces:**
- Consumes: admin `api` from `frontend-admin/src/lib/api.ts` (base URL already `.../api`, token auto-attached).

- [ ] **Step 1: Inspect admin routing/nav conventions**

Run: `grep -n "Route\|path=\|nav\|Link\|Admin" frontend-admin/src/App.tsx`
Expected: shows how existing pages (`Admin`, `AdminLogin`) are routed and how nav links are declared, so the new page follows the same pattern.

- [ ] **Step 2: Write the page**

Create `frontend-admin/src/pages/KycReview.tsx`:

```tsx
import { useEffect, useState } from 'react';
import api from '../lib/api';

interface AdminKycDoc {
  id: string;
  provider_id: string;
  doc_type: string;
  status: string;
  rejection_reason: string | null;
  uploaded_at: string;
  business_name: string | null;
  business_type: string | null;
  owner_name: string | null;
  file_url: string;
}

const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/api$/, '');

export default function KycReview() {
  const [docs, setDocs] = useState<AdminKycDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await api.get('/admin/kyc', { params: { status: 'pending' } });
    setDocs(data.documents);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const review = async (id: string, decision: 'approve' | 'reject') => {
    let reason: string | undefined;
    if (decision === 'reject') {
      reason = window.prompt('Reason for rejection?') || '';
      if (!reason) return;
    }
    setBusy(id);
    try {
      await api.post(`/admin/kyc/${id}/review`, { decision, reason });
      await load();
    } finally {
      setBusy(null);
    }
  };

  // The proxied file endpoint needs the admin token; open via fetch → blob URL.
  const openFile = async (fileUrl: string) => {
    const token = localStorage.getItem('admin_token');
    const res = await fetch(`${API_ORIGIN}${fileUrl}`, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), '_blank');
  };

  if (loading) return <div className="p-6">Loading KYC queue…</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">KYC Review ({docs.length} pending)</h1>
      {docs.length === 0 && <p>No pending documents.</p>}
      <div className="space-y-2">
        {docs.map(d => (
          <div key={d.id} className="flex items-center justify-between border rounded-lg p-3">
            <div>
              <div className="font-semibold">{d.business_name} · {d.business_type}</div>
              <div className="text-sm text-gray-600">{d.owner_name} — {d.doc_type}</div>
              <button className="text-blue-600 text-sm underline" onClick={() => openFile(d.file_url)}>View document</button>
            </div>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 rounded bg-green-600 text-white disabled:opacity-50"
                disabled={busy === d.id}
                onClick={() => review(d.id, 'approve')}
              >Approve</button>
              <button
                className="px-3 py-1 rounded bg-red-600 text-white disabled:opacity-50"
                disabled={busy === d.id}
                onClick={() => review(d.id, 'reject')}
              >Reject</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Register the route and nav link**

In `frontend-admin/src/App.tsx`, following the pattern found in Step 1, add a route to `/kyc` rendering `<KycReview />` (guarded like the existing admin pages) and a nav link labeled "KYC Review". Import at top:

```tsx
import KycReview from './pages/KycReview';
```

- [ ] **Step 4: Build the admin app**

Run: `cd frontend-admin && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend-admin/src/pages/KycReview.tsx frontend-admin/src/App.tsx
git commit -m "feat(kyc): admin KYC review page"
```

---

## Phase 6 — Full verification & docs

### Task 16: End-to-end verification and doc updates

**Files:**
- Modify: `README.md`, `memory/PRD.md`

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend && npm test`
Expected: all tests pass (existing + kycRequirements + profileCompletion + kyc + adminKyc + listings).

- [ ] **Step 2: Build both frontends**

Run: `cd frontend && corepack yarn@1.22.22 build`
Then: `cd frontend-admin && npm run build`
Expected: both succeed.

- [ ] **Step 3: Manual smoke test with the stack up**

Run: `docker compose up -d postgres minio` then start backend/frontends per README. Verify:
1. Onboard a provider (e.g. shop), pay ₹99 → dashboard shows the completion bar at ~40%.
2. Upload the four required shop docs → each shows "In review"; bar stays ~40%.
3. In admin app `/kyc`, view a document (opens the private file via the token-authenticated proxy), approve all four.
4. Reload provider dashboard → "Verified" badge appears, bar reaches 100%.
5. Verify the public listing shows the Verified badge.
6. Confirm KYC files are NOT reachable without auth: `curl http://localhost:9000/one-darjeeling-kyc/<key>` should be denied (private bucket).

- [ ] **Step 4: Update documentation**

In `memory/PRD.md`: add the `kyc_documents` table + `providers.kycStatus` to §8, note KYC/verification in the provider journey (§4) and feature inventory (§5, "Done"), and the new endpoints in §9. In `README.md`: note the private `MINIO_KYC_BUCKET` env var.

- [ ] **Step 5: Commit**

```bash
git add README.md memory/PRD.md
git commit -m "docs(kyc): document KYC tables, endpoints, and env in PRD and README"
```

---

## Self-Review

**Spec coverage:**
- §1 goal / §2 flows → Tasks 7–13, 15 (provider KYC layer; tourist untouched). ✓
- §3 matrix (shared config) → Task 1. ✓
- §4 blended 40/60 bar (server-side) → Task 2 (math) + Task 7 (`/me/profile`) + Task 10/11 (UI). ✓
- §5 data model (`kyc_documents` + `kycStatus`) → Task 3. ✓
- §6 private bucket + proxy → Tasks 4, 5, 7 (`/kyc/:id/file`). ✓
- §7 API surface + every check → Tasks 7 (upload role/ownership/mime/size, owner/admin file, delete) + 8 (admin-gated list/review). ✓
- §8 frontend (bar, section, badge, admin) → Tasks 9–13, 15; i18n → Task 14. ✓
- §9 tests → Tasks 1, 2, 7, 8, 13. ✓
- §10 out-of-scope respected (no gating, no tourist KYC, `/listings/upload` untouched). ✓
- §11 open items: blend weights fixed in Task 2; verified = required-only (Task 2 rollup). ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. Tasks 12, 13-step-2, 15-step-3 reference reading an existing file first because exact insertion points are file-specific — each still specifies the exact code to insert and where. ✓

**Type consistency:** `computeCompletion` signature matches between Task 2 (def) and Task 7 (call). `recomputeKycStatus` defined in Task 7, imported in Task 8. `KycProfile`/`ChecklistItem`/`KycDoc` defined in Task 9, consumed in Tasks 11–12. `provider_verified` produced in Task 13-step-2, consumed in 13-steps 3–4. Response field names (`doc_type`, `completion_percent`, `kyc_status`, `checklist`, `documents`) consistent across backend routes, tests, and frontend client. ✓
