import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * These tests mock the S3 client itself rather than `src/lib/s3` wholesale, which is what every
 * other storage-touching test file does. That is deliberate: the behaviour under test *is* what
 * `src/lib/s3` sends, so stubbing the module would assert nothing.
 *
 * What they defend is a bug that shipped and stayed invisible. Bucket creation used to happen only
 * inside the upload functions, so a correctly-configured stack that had never received an upload
 * had no buckets — and `GET /api/health` therefore reported `degraded` indefinitely. That is the
 * worst possible failure for a readiness endpoint: it is the thing an uptime monitor watches, and
 * it was crying wolf on a healthy box.
 */
const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@aws-sdk/client-s3', () => {
  class Command {
    constructor(public readonly input: any) {}
  }
  return {
    S3Client: class {
      send = send;
    },
    HeadBucketCommand: class HeadBucketCommand extends Command {},
    CreateBucketCommand: class CreateBucketCommand extends Command {},
    PutBucketPolicyCommand: class PutBucketPolicyCommand extends Command {},
    GetBucketPolicyCommand: class GetBucketPolicyCommand extends Command {},
    DeleteBucketPolicyCommand: class DeleteBucketPolicyCommand extends Command {},
    PutObjectCommand: class PutObjectCommand extends Command {},
    GetObjectCommand: class GetObjectCommand extends Command {},
    DeleteObjectCommand: class DeleteObjectCommand extends Command {},
  };
});

// The defaults from config.ts — vitest.config.ts sets no MINIO_* variables.
const PUBLIC_BUCKET = 'one-darjeeling';
const KYC_BUCKET = 'one-darjeeling-kyc';

/** The over-permissive policy `mc anonymous set download` leaves behind — GetObject *and* the
 * ability to list every key in the bucket. This is what was live on 1darjeeling.in. */
const mcDownloadPreset = (bucket: string) => JSON.stringify({
  Version: '2012-10-17',
  Statement: [
    { Effect: 'Allow', Principal: '*', Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${bucket}/*`] },
    { Effect: 'Allow', Principal: '*', Action: ['s3:ListBucket'], Resource: [`arn:aws:s3:::${bucket}`] },
  ],
});

/**
 * A MinIO holding exactly `existing`, with `policies` attached. Both are mutated by the commands
 * the server sends, so a test can assert on them afterwards and read them as "the state the
 * server actually left this MinIO in".
 */
function minio(existing: Set<string>, policies = new Map<string, string>()) {
  return async (cmd: any) => {
    const bucket = cmd.input?.Bucket;
    switch (cmd.constructor.name) {
      case 'PutBucketPolicyCommand':
        policies.set(bucket, cmd.input.Policy);
        return {};
      case 'DeleteBucketPolicyCommand':
        policies.delete(bucket);
        return {};
      case 'GetBucketPolicyCommand': {
        const existingPolicy = policies.get(bucket);
        if (existingPolicy) return { Policy: existingPolicy };
        // No policy attached — MinIO's way of saying "nobody anonymous can touch this".
        const err: any = new Error('The bucket policy does not exist');
        err.name = 'NoSuchBucketPolicy';
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      case 'HeadBucketCommand': {
        if (existing.has(bucket)) return {};
        // What a real MinIO returns for a HEAD on a bucket that is not there: 404 with an empty
        // body. Note the message — a HEAD has no body for the SDK to parse, so it falls back to
        // the generic "UnknownError" regardless of status. That string is why the live diagnosis
        // could not read a cause out of /api/health, and the bootstrap must branch on
        // $metadata.httpStatusCode rather than on the message.
        const err: any = new Error('UnknownError');
        err.name = 'NotFound';
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      case 'CreateBucketCommand':
        existing.add(bucket);
        return {};
      default:
        return {};
    }
  };
}

const sent = (name: string) => send.mock.calls.map(([c]) => c).filter((c) => c.constructor.name === name);

/** s3.ts memoises "this bucket exists" in module state, so each test needs a fresh copy of it. */
async function freshStorage() {
  vi.resetModules();
  return import('../src/lib/s3');
}

describe('object storage bootstrap at startup', () => {
  // Spied here rather than inside the tests that need it: a spy restored on the last line of a
  // test body is not restored when that test fails, which leaks console calls into the next test
  // and turns one real failure into two. Found the hard way while checking these tests were not
  // vacuous.
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    send.mockReset();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('creates both buckets on a stack that has never received an upload', async () => {
    const existing = new Set<string>();
    send.mockImplementation(minio(existing));

    const { ensureBucketsExist } = await freshStorage();
    await ensureBucketsExist();

    expect(existing).toEqual(new Set([PUBLIC_BUCKET, KYC_BUCKET]));
  });

  it('makes a fresh stack report healthy — the regression this exists for', async () => {
    const existing = new Set<string>();
    send.mockImplementation(minio(existing));

    const { ensureBucketsExist, checkStorage } = await freshStorage();

    // Before: this is precisely what 1darjeeling.in did for days with a correct configuration.
    await expect(checkStorage()).rejects.toThrow();

    await ensureBucketsExist();

    await expect(checkStorage()).resolves.toBeUndefined();
  });

  it('gives public-read to the public bucket and to nothing else', async () => {
    send.mockImplementation(minio(new Set<string>()));

    const { ensureBucketsExist } = await freshStorage();
    await ensureBucketsExist();

    const policies = sent('PutBucketPolicyCommand');
    // The KYC bucket holds Aadhaar/PAN/licence scans. Exactly one bucket may be made anonymously
    // readable, and it must be the other one — asserted on the whole set, not just on the KYC
    // bucket's absence, so a future third bucket cannot quietly become public here either.
    expect(policies.map((p) => p.input.Bucket)).toEqual([PUBLIC_BUCKET]);
    expect(JSON.parse(policies[0].input.Policy)).toMatchObject({
      Statement: [{ Effect: 'Allow', Principal: '*', Action: ['s3:GetObject'] }],
    });
  });

  it('creates nothing on a redeploy, but re-asserts the public policy', async () => {
    send.mockImplementation(minio(new Set([PUBLIC_BUCKET, KYC_BUCKET])));

    const { ensureBucketsExist } = await freshStorage();
    await ensureBucketsExist();

    expect(sent('CreateBucketCommand')).toEqual([]);
    // The policy IS re-sent, and only for the public bucket. Setting it once at creation was the
    // original defect: a bucket whose permissions drifted could never be repaired by a deploy.
    expect(sent('PutBucketPolicyCommand').map((c) => c.input.Bucket)).toEqual([PUBLIC_BUCKET]);
  });

  it('repairs a public bucket left listable by `mc anonymous set download`', async () => {
    // The exact live state on 1darjeeling.in: the bucket was created by hand with mc's preset,
    // which grants s3:ListBucket on top of s3:GetObject, so anyone could enumerate every
    // uploaded key. Nothing in the old code would ever have looked at it again.
    const policies = new Map([[PUBLIC_BUCKET, mcDownloadPreset(PUBLIC_BUCKET)]]);
    send.mockImplementation(minio(new Set([PUBLIC_BUCKET, KYC_BUCKET]), policies));

    const { ensureBucketsExist } = await freshStorage();
    await ensureBucketsExist();

    const actions = JSON.parse(policies.get(PUBLIC_BUCKET)!).Statement.flatMap((s: any) => s.Action);
    expect(actions).toEqual(['s3:GetObject']);
    expect(actions).not.toContain('s3:ListBucket');
  });

  it('strips any policy found on the KYC bucket and says so loudly', async () => {
    // One mistyped bucket name in an `mc anonymous` command is all this takes, and the contents
    // are government identity documents. The removal is not the whole job — somebody has to be
    // told it happened, or the exposure is repaired and never investigated.
    const policies = new Map([[KYC_BUCKET, mcDownloadPreset(KYC_BUCKET)]]);
    send.mockImplementation(minio(new Set([PUBLIC_BUCKET, KYC_BUCKET]), policies));

    const { ensureBucketsExist } = await freshStorage();
    await ensureBucketsExist();

    expect(policies.has(KYC_BUCKET)).toBe(false);
    expect(consoleError.mock.calls.flat().join(' ')).toContain('SECURITY');
  });

  it('leaves the KYC bucket untouched when it has no policy, and stays quiet', async () => {
    // The normal case. A check that cried wolf on every boot would be ignored by the time it
    // mattered, so the healthy path must send no delete and log no error.
    send.mockImplementation(minio(new Set([PUBLIC_BUCKET, KYC_BUCKET])));

    const { ensureBucketsExist } = await freshStorage();
    await ensureBucketsExist();

    expect(sent('DeleteBucketPolicyCommand')).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('does not throw when storage is unreachable, so the server still starts', async () => {
    // A container that exits because MinIO is slow is worse than one that serves every route not
    // touching storage and reports the truth at /api/health.
    send.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED 172.20.0.4:9000'), {
      $metadata: {},
    }));

    const { ensureBucketsExist } = await freshStorage();

    await expect(ensureBucketsExist()).resolves.toBeUndefined();
  });

  it('still creates the bucket on first upload when the startup attempt failed', async () => {
    // The lazy path is the retry for a MinIO that comes up late, so moving creation to startup
    // must not have latched "already bootstrapped" on the way through a failure.
    send.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED 172.20.0.4:9000'), {
      $metadata: {},
    }));

    const { ensureBucketsExist, uploadToMinIO } = await freshStorage();
    await ensureBucketsExist();

    const existing = new Set<string>();
    send.mockImplementation(minio(existing));

    const url = await uploadToMinIO(Buffer.from('x'), 'k.jpg', 'image/jpeg');

    expect(existing.has(PUBLIC_BUCKET)).toBe(true);
    expect(url).toContain(`/${PUBLIC_BUCKET}/k.jpg`);
  });
});
