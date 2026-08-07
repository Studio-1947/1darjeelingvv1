/**
 * Scans MinIO object storage buckets (`one-darjeeling` and `one-darjeeling-kyc`) and compares
 * stored object keys against active database records (`kyc_documents`, `listings`, `providers`, `users`).
 *
 * Safe & Idempotent:
 * - Defaults to DRY RUN mode (previews orphans without deleting).
 * - Requires explicit `--execute` flag to perform deletions.
 *
 * Usage:
 *   npx tsx scripts/cleanup-orphan-storage.ts [--execute]
 */
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('[cleanup-storage] ERROR: DATABASE_URL environment variable is required.');
  process.exit(1);
}

const minioEndpoint = process.env.MINIO_ENDPOINT || 'http://localhost:9000';
const minioAccessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin';
const minioSecretKey = process.env.MINIO_SECRET_KEY || 'minioadminpassword';
const pubBucket = process.env.MINIO_BUCKET || 'one-darjeeling';
const kycBucket = process.env.MINIO_KYC_BUCKET || 'one-darjeeling-kyc';

const s3Client = new S3Client({
  endpoint: minioEndpoint,
  credentials: {
    accessKeyId: minioAccessKey,
    secretAccessKey: minioSecretKey,
  },
  forcePathStyle: true,
  region: 'us-east-1',
});

function parseArgs() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  return { execute };
}

async function listBucketKeys(bucket: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined = undefined;

  try {
    do {
      const res = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
        })
      );
      if (res.Contents) {
        for (const item of res.Contents) {
          if (item.Key) keys.push(item.Key);
        }
      }
      continuationToken = res.NextContinuationToken;
    } while (continuationToken);
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      console.log(`[cleanup-storage] Bucket "${bucket}" does not exist yet.`);
    } else {
      console.error(`[cleanup-storage] Error listing bucket "${bucket}":`, err.message || err);
    }
  }

  return keys;
}

async function main() {
  const { execute } = parseArgs();
  console.log(`[cleanup-storage] Execution mode: ${execute ? 'LIVE DELETION (--execute)' : 'DRY RUN (preview only)'}`);

  const pgClient = new Client({ connectionString: dbUrl });
  await pgClient.connect();

  try {
    // 1. Fetch active KYC document file keys from DB
    const kycDbRes = await pgClient.query('SELECT DISTINCT file_key FROM kyc_documents WHERE file_key IS NOT NULL');
    const activeKycKeys = new Set<string>(kycDbRes.rows.map(r => r.file_key));

    // 2. Fetch active listing, provider, user images from DB
    const listingRes = await pgClient.query('SELECT image FROM listings WHERE image IS NOT NULL');
    const providerRes = await pgClient.query('SELECT images FROM providers WHERE images IS NOT NULL');
    const userRes = await pgClient.query('SELECT avatar FROM users WHERE avatar IS NOT NULL');

    const activePubKeys = new Set<string>();

    const extractKeyFromUrl = (urlStr: string): string | null => {
      if (!urlStr) return null;
      // Extract basename key after bucket name or final slash
      const parts = urlStr.split('/');
      return parts[parts.length - 1] || null;
    };

    for (const r of listingRes.rows) {
      const key = extractKeyFromUrl(r.image);
      if (key) activePubKeys.add(key);
    }

    for (const r of providerRes.rows) {
      if (Array.isArray(r.images)) {
        for (const img of r.images) {
          const key = extractKeyFromUrl(img);
          if (key) activePubKeys.add(key);
        }
      }
    }

    for (const r of userRes.rows) {
      const key = extractKeyFromUrl(r.avatar);
      if (key) activePubKeys.add(key);
    }

    console.log(`[cleanup-storage] Active DB references: ${activeKycKeys.size} KYC document keys, ${activePubKeys.size} public image keys.`);

    // 3. Scan KYC Bucket
    console.log(`\n--- Scanning Private KYC Bucket: "${kycBucket}" ---`);
    const kycStorageKeys = await listBucketKeys(kycBucket);
    const orphanKycKeys = kycStorageKeys.filter(k => !activeKycKeys.has(k));

    console.log(`Found ${kycStorageKeys.length} total objects in "${kycBucket}". ${orphanKycKeys.length} are orphans.`);
    for (const orphan of orphanKycKeys) {
      console.log(`  [KYC Orphan] ${orphan}`);
      if (execute) {
        await s3Client.send(new DeleteObjectCommand({ Bucket: kycBucket, Key: orphan }));
        console.log(`  -> DELETED ${orphan}`);
      }
    }

    // 4. Scan Public Bucket
    console.log(`\n--- Scanning Public Bucket: "${pubBucket}" ---`);
    const pubStorageKeys = await listBucketKeys(pubBucket);
    const orphanPubKeys = pubStorageKeys.filter(k => {
      const filename = extractKeyFromUrl(k);
      return filename ? !activePubKeys.has(filename) && !activePubKeys.has(k) : true;
    });

    console.log(`Found ${pubStorageKeys.length} total objects in "${pubBucket}". ${orphanPubKeys.length} are orphans.`);
    for (const orphan of orphanPubKeys) {
      console.log(`  [Public Orphan] ${orphan}`);
      if (execute) {
        await s3Client.send(new DeleteObjectCommand({ Bucket: pubBucket, Key: orphan }));
        console.log(`  -> DELETED ${orphan}`);
      }
    }

    console.log('\n[cleanup-storage] Scan complete.');
    if (!execute && (orphanKycKeys.length > 0 || orphanPubKeys.length > 0)) {
      console.log('To perform real deletions, re-run with: npx tsx scripts/cleanup-orphan-storage.ts --execute');
    }

  } catch (err) {
    console.error('[cleanup-storage] Script execution error:', err);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

main();
