import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand
} from '@aws-sdk/client-s3';
import {
  MINIO_ENDPOINT,
  MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY,
  MINIO_BUCKET,
  MINIO_PUBLIC_URL,
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

let bucketBootstrapped = false;

// Ensure bucket exists and has public read policy configured
async function bootstrapBucket() {
  if (bucketBootstrapped) return;
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET }));
    bucketBootstrapped = true;
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      log.info(`MinIO bucket "${MINIO_BUCKET}" not found. Bootstrapping bucket...`);
      // Create bucket
      await s3Client.send(new CreateBucketCommand({ Bucket: MINIO_BUCKET }));
      
      // Apply public read bucket policy so anybody can fetch files
      const policy = {
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
      };
      
      await s3Client.send(
        new PutBucketPolicyCommand({
          Bucket: MINIO_BUCKET,
          Policy: JSON.stringify(policy),
        })
      );
      
      log.info(`Bucket "${MINIO_BUCKET}" successfully created with public-read policy.`);
      bucketBootstrapped = true;
    } else {
      log.error(`Failed checking/creating MinIO bucket: ${err.message || err}`);
      throw err;
    }
  }
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
    })
  );

  // Return the public client-facing access URL
  return `${MINIO_PUBLIC_URL}/${MINIO_BUCKET}/${key}`;
}
