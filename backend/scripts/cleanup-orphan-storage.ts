/**
 * Deletes stored files (MinIO buckets `one-darjeeling` and `one-darjeeling-kyc`) that nothing in
 * the database refers to any more.
 *
 * A file is in use when its name appears anywhere in the database, in any table or column (see
 * src/lib/storageRefs.ts). The first version only read listings.image, providers.images and
 * users.avatar, and deleted gallery photos that listings still showed.
 *
 * SAFE BY DEFAULT: it only reports. Add --execute to delete.
 *
 * Usage (from backend/; on the server, inside the backend container):
 *   npx tsx scripts/cleanup-orphan-storage.ts [--execute]
 */
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

import { findReferencedKeys } from '../src/lib/storageRefs';

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('[cleanup-storage] ERROR: DATABASE_URL environment variable is required.');
  process.exit(1);
}

const s3Client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadminpassword',
  },
  forcePathStyle: true,
  region: 'us-east-1',
});
const BUCKETS = [process.env.MINIO_KYC_BUCKET || 'one-darjeeling-kyc', process.env.MINIO_BUCKET || 'one-darjeeling'];

async function listBucketKeys(bucket: string): Promise<string[] | null> {
  const keys: string[] = [];
  let token: string | undefined;
  try {
    do {
      const res = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
      for (const item of res.Contents || []) if (item.Key) keys.push(item.Key);
      token = res.NextContinuationToken;
    } while (token);
  } catch (err: any) {
    console.error(`[cleanup-storage] Could not list "${bucket}", skipping it:`, err.message || err);
    return null;
  }
  return keys;
}

async function main() {
  const execute = process.argv.includes('--execute');
  console.log(`[cleanup-storage] ${execute ? 'DELETING unused files (--execute)' : 'REPORT ONLY (add --execute to delete)'}`);

  const db = new Client({ connectionString: dbUrl });
  await db.connect();
  try {
    let total = 0;
    for (const bucket of BUCKETS) {
      const keys = await listBucketKeys(bucket);
      if (!keys) continue;
      const used = await findReferencedKeys(db, keys);
      const unused = keys.filter((k) => !used.has(k));
      total += unused.length;
      console.log(`\n"${bucket}": ${keys.length} files, ${used.size} in use, ${unused.length} unused.`);
      for (const key of unused) {
        if (execute) {
          await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
          console.log(`  deleted ${key}`);
        } else {
          console.log(`  unused  ${key}`);
        }
      }
    }
    if (!execute && total > 0) console.log(`\nRun again with --execute to delete the ${total} unused files.`);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('[cleanup-storage] Failed:', err);
  process.exit(1);
});
