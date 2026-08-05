import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  GetBucketPolicyCommand,
  DeleteBucketPolicyCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import {
  MINIO_ENDPOINT,
  MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY,
  MINIO_BUCKET,
  MINIO_PUBLIC_URL,
  MINIO_KYC_BUCKET,
  log
} from '../config';

const s3Client = new S3Client({
  endpoint: MINIO_ENDPOINT,
  credentials: {
    accessKeyId: MINIO_ACCESS_KEY,
    secretAccessKey: MINIO_SECRET_KEY,
  },
  forcePathStyle: true, // Required for MinIO S3 emulation
  region: 'us-east-1',  // Ignored by MinIO but required by AWS SDK
});

/**
 * Can this server actually reach object storage?
 *
 * Used by GET /api/health. A HEAD on the public bucket is the cheapest call that proves both
 * network reachability and that the configured credentials are accepted — a wrong
 * MINIO_ACCESS_KEY fails here exactly as a stopped container does, which is the point: both
 * mean uploads are broken, and both were previously invisible until a provider tried to add a photo.
 */
export async function checkStorage(): Promise<void> {
  await s3Client.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET }));
}

/**
 * Create both buckets at startup, rather than waiting for the first upload to do it.
 *
 * Bucket creation used to happen *only* inside uploadToMinIO()/uploadPrivate(), so a freshly
 * deployed stack had no buckets at all until somebody happened to upload a photo. On
 * 1darjeeling.in nobody ever did — its listings were copied in from the other stack rather than
 * uploaded — so checkStorage()'s HeadBucket kept failing and GET /api/health reported `degraded`
 * for days on a stack whose storage configuration was entirely correct. An uptime monitor pointed
 * at that endpoint, which is exactly what it is for, would have paged continuously for a healthy
 * box. Lazy creation also meant the first provider to add a listing photo was the one who
 * discovered any bucket-level misconfiguration.
 *
 * Deliberately never throws. Storage being unreachable at boot must not stop the server starting:
 * every route that does not touch object storage still works, and /api/health goes on reporting
 * the truth to whoever is watching — which is strictly more useful than a container that exits.
 * The calls in the upload paths are left in place as the retry, so a MinIO that comes up late
 * still gets its buckets on first use.
 */
export async function ensureBucketsExist(): Promise<void> {
  // Settled independently: failing to create one bucket must not skip the attempt at the other.
  const [pub, kyc] = await Promise.allSettled([bootstrapBucket(), bootstrapKycBucket()]);

  if (pub.status === 'fulfilled' && kyc.status === 'fulfilled') {
    log.info(`Object storage ready — buckets "${MINIO_BUCKET}" and "${MINIO_KYC_BUCKET}" exist.`);
    return;
  }

  // The underlying failure is already logged with its message by the two bootstrap functions;
  // what this adds is the consequence, so the line is actionable on its own.
  log.error(
    'Object storage bootstrap failed at startup — uploads will retry on first use, and ' +
    'GET /api/health will report storage as down until it succeeds.'
  );
}

let bucketBootstrapped = false;

/**
 * What the public bucket is allowed to expose: fetching one object by its exact key, and nothing
 * else. Notably NOT s3:ListBucket — a browser loading a listing photo always knows the URL it
 * wants, so the ability to enumerate every key in the bucket buys nothing and gives away the full
 * index of everything ever uploaded, including images belonging to unpublished or deleted
 * listings. `mc anonymous set download`, the obvious thing to reach for when fixing this by hand,
 * grants both — which is how 1darjeeling.in ended up listable in August 2026.
 */
const publicReadPolicy = () => JSON.stringify({
  Version: '2012-10-17',
  Statement: [
    {
      Sid: 'PublicRead',
      Effect: 'Allow',
      Principal: '*',
      Action: ['s3:GetObject'],
      Resource: [`arn:aws:s3:::${MINIO_BUCKET}/*`],
    },
  ],
});

// Ensure bucket exists and has public read policy configured
async function bootstrapBucket() {
  if (bucketBootstrapped) return;

  let created = false;
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET }));
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      log.info(`MinIO bucket "${MINIO_BUCKET}" not found. Bootstrapping bucket...`);
      await s3Client.send(new CreateBucketCommand({ Bucket: MINIO_BUCKET }));
      created = true;
    } else {
      log.error(`Failed checking/creating MinIO bucket: ${err.message || err}`);
      throw err;
    }
  }

  // Applied on BOTH paths — an existing bucket gets the policy re-asserted, not just a new one.
  // Previously the policy was set only at creation, so a bucket whose permissions were wrong
  // stayed wrong forever: no redeploy would ever look at them again, and the only repair was
  // somebody remembering to run mc by hand. Making this declarative means the code is the single
  // answer to "who can read this bucket", which is the property worth having when the bucket next
  // door holds Aadhaar and PAN scans. The trade-off is accepted deliberately: a manual policy
  // change is reverted on the next restart, because a manual policy change here is a mistake.
  await s3Client.send(
    new PutBucketPolicyCommand({ Bucket: MINIO_BUCKET, Policy: publicReadPolicy() })
  );

  log.info(
    created
      ? `Bucket "${MINIO_BUCKET}" successfully created with public-read policy.`
      : `Bucket "${MINIO_BUCKET}" exists; public-read policy re-applied.`
  );
  bucketBootstrapped = true;
}

/**
 * Uploads a file buffer directly to the MinIO bucket.
 * Returns the public HTTP URL for the browser.
 */
export async function uploadToMinIO(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  await bootstrapBucket();

  await s3Client.send(
    new PutObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // Keys are `<uuid>.<ext>` (see lib/imageUpload.ts) and are never reused or
      // overwritten, so an object at a given URL can never change - which is the
      // precondition `immutable` asks for. Without this MinIO stores no
      // Cache-Control at all and the browser falls back to heuristic caching:
      // it invents a freshness lifetime, and re-downloads full-size listing
      // photos far more often than it needs to. That cost lands on exactly the
      // connections this app is built for.
      //
      // deploy/nginx/app.conf sets the same value on the way out, which is what
      // covers the objects uploaded before this line existed.
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );

  // Return the public client-facing access URL
  return `${MINIO_PUBLIC_URL}/${MINIO_BUCKET}/${key}`;
}

let kycBucketBootstrapped = false;

// The KYC bucket is created WITHOUT any public-read policy — objects are only
// reachable through the authorized backend proxy, never a public URL.
async function bootstrapKycBucket() {
  if (kycBucketBootstrapped) return;

  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: MINIO_KYC_BUCKET }));
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      log.info(`MinIO KYC bucket "${MINIO_KYC_BUCKET}" not found. Creating (private)...`);
      await s3Client.send(new CreateBucketCommand({ Bucket: MINIO_KYC_BUCKET }));
      log.info(`Private KYC bucket "${MINIO_KYC_BUCKET}" created (no public policy).`);
      kycBucketBootstrapped = true;
      return;
    }
    log.error(`Failed checking/creating KYC bucket: ${err.message || err}`);
    throw err;
  }

  // The bucket already existed, so something other than this code has had the chance to change
  // its permissions. Check rather than assume: this bucket holds government identity documents,
  // and the adjacent public bucket is one mistyped bucket name away in any `mc anonymous` command.
  //
  // The expected answer is NoSuchBucketPolicy — no policy at all — which is why the quiet path
  // here logs nothing. Anything else is a finding, not a routine reconciliation, so it is logged
  // at error level before being removed: silently repairing this would hide the fact that
  // somebody's Aadhaar scans were reachable, and *that* is the part someone needs to know.
  try {
    await s3Client.send(new GetBucketPolicyCommand({ Bucket: MINIO_KYC_BUCKET }));
  } catch (err: any) {
    if (err.name === 'NoSuchBucketPolicy' || err.$metadata?.httpStatusCode === 404) {
      kycBucketBootstrapped = true;
      return;
    }
    // Couldn't read the policy (permissions, an older MinIO). Don't claim it's private.
    log.error(`Could not verify that KYC bucket "${MINIO_KYC_BUCKET}" is private: ${err.message || err}`);
    kycBucketBootstrapped = true;
    return;
  }

  log.error(
    `SECURITY: KYC bucket "${MINIO_KYC_BUCKET}" had an access policy attached. This bucket holds ` +
    `Aadhaar/PAN/licence scans and must never be publicly readable. Removing it now — check who ` +
    `set it and whether any document was fetched while it was in place.`
  );
  await s3Client.send(new DeleteBucketPolicyCommand({ Bucket: MINIO_KYC_BUCKET }));
  kycBucketBootstrapped = true;
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

/** Deletes a private KYC object (e.g. on re-upload or removal). Callers should tolerate failure. */
export async function deletePrivate(key: string): Promise<void> {
  await bootstrapKycBucket();
  await s3Client.send(new DeleteObjectCommand({ Bucket: MINIO_KYC_BUCKET, Key: key }));
}
