import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Storage is mocked because the suite has no MinIO, matching every other upload-touching test
// file. checkStorage is the only member these tests exercise; the rest are stubbed so importing
// app.ts does not reach for a real S3 client.
const checkStorage = vi.fn();
vi.mock('../src/lib/s3', () => ({
  checkStorage: (...args: unknown[]) => checkStorage(...args),
  uploadToMinIO: vi.fn(),
  uploadPrivate: vi.fn(),
  getPrivateObject: vi.fn(),
  deletePrivate: vi.fn(),
}));

const { app } = await import('../src/app');

/**
 * The distinction these tests defend is the reason the endpoint exists.
 *
 * `GET /api` returns `{"status":"ok"}` from a bare JSON literal — it is true whenever the process
 * is answering, and stays true with the database on fire. An uptime monitor pointed at it would
 * have reported this platform perfectly healthy while every booking, login and listing failed.
 * `GET /api/health` is the one that actually asks its dependencies, and it must keep doing so.
 */
describe('GET /api/health', () => {
  beforeEach(() => {
    checkStorage.mockReset();
  });

  it('answers 200 with per-dependency detail when everything is reachable', async () => {
    checkStorage.mockResolvedValue(undefined);

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database.ok).toBe(true);
    expect(res.body.checks.storage.ok).toBe(true);
    // Latency is reported so a monitor can alert on a database that is up but crawling.
    expect(typeof res.body.checks.database.ms).toBe('number');
  });

  it('answers 503 and names the failing component when storage is down', async () => {
    checkStorage.mockRejectedValue(new Error('connect ECONNREFUSED 172.20.0.4:9000'));

    const res = await request(app).get('/api/health');

    // 503, not 200-with-a-flag: an uptime monitor decides on the status code, and a monitor that
    // has to parse the body to notice an outage is a monitor that will not notice it.
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.storage.ok).toBe(false);
    expect(res.body.checks.storage.error).toContain('ECONNREFUSED');
    // One dependency failing must not mask the health of the others.
    expect(res.body.checks.database.ok).toBe(true);
  });

  it('does not let a broken dependency take the endpoint down with it', async () => {
    // A health check that throws is worse than useless: the monitor sees a connection error
    // rather than a structured answer, and cannot tell "app is down" from "app says it is sick".
    checkStorage.mockImplementation(() => {
      throw new Error('synchronous explosion');
    });

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.checks.storage.ok).toBe(false);
  });

  it('keeps GET /api as a dependency-free liveness check', async () => {
    // Deliberately unchanged: it answers "the container is up" even mid-outage, which is a
    // different and still-useful question. The runbook and deploy checks rely on it.
    checkStorage.mockRejectedValue(new Error('storage is gone'));

    const res = await request(app).get('/api');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
