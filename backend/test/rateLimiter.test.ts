import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { rateLimiter } from '../src/middleware/rateLimiter';
import { app as realApp } from '../src/app';

let prefixCounter = 0;
const uniquePrefix = () => `unit_test_${prefixCounter++}`;

/**
 * Mini app standing in for the production topology. Supertest connects over loopback, so the
 * socket address is 127.0.0.1 and X-Forwarded-For supplies the hops in front of it — the same
 * shape Express sees behind system Nginx -> nginx container.
 */
function makeApp(opts: { trustProxy: number | boolean; limit?: number }) {
  const app = express();
  app.set('trust proxy', opts.trustProxy);
  app.get(
    '/limited',
    rateLimiter(opts.limit ?? 2, 60_000, uniquePrefix(), { enabled: true }),
    (req, res) => res.json({ ip: req.ip })
  );
  return app;
}

// Mimics what the backend actually receives: "<client>, <host nginx>" appended by the two layers.
const asClient = (clientIp: string) => `${clientIp}, 10.10.0.1`;

describe('rateLimiter client attribution', () => {
  it('gives each real client its own bucket behind two proxy hops', async () => {
    const app = makeApp({ trustProxy: 2, limit: 2 });

    // Client A burns its allowance.
    expect((await request(app).get('/limited').set('X-Forwarded-For', asClient('203.0.113.5'))).status).toBe(200);
    expect((await request(app).get('/limited').set('X-Forwarded-For', asClient('203.0.113.5'))).status).toBe(200);
    expect((await request(app).get('/limited').set('X-Forwarded-For', asClient('203.0.113.5'))).status).toBe(429);

    // Client B must be unaffected — this is what breaks in production without trust proxy.
    const otherClient = await request(app).get('/limited').set('X-Forwarded-For', asClient('198.51.100.9'));
    expect(otherClient.status).toBe(200);
  });

  it('resolves req.ip to the real client, not the proxy', async () => {
    const app = makeApp({ trustProxy: 2 });
    const res = await request(app).get('/limited').set('X-Forwarded-For', asClient('203.0.113.77'));
    expect(res.body.ip).toBe('203.0.113.77');
  });

  it('ignores a client-forged X-Forwarded-For prefix (no spoofing past the limiter)', async () => {
    const app = makeApp({ trustProxy: 2, limit: 1 });

    // Attacker sends their own XFF; Nginx appends the real client + host, so the forged entry
    // ends up further left and must be ignored. Counting hops from the right is what ensures that.
    const spoof = (n: number) => request(app).get('/limited').set('X-Forwarded-For', `10.0.0.${n}, 203.0.113.99, 10.10.0.1`);

    expect((await spoof(1)).status).toBe(200);
    // A different forged prefix must NOT buy a fresh bucket — same real client.
    expect((await spoof(2)).status).toBe(429);
  });

  it('documents the bug: without trust proxy, unrelated clients share one bucket', async () => {
    const app = makeApp({ trustProxy: false, limit: 2 });

    // Every request looks like it came from 127.0.0.1 (the proxy), so distinct clients collide.
    expect((await request(app).get('/limited').set('X-Forwarded-For', asClient('203.0.113.5'))).status).toBe(200);
    expect((await request(app).get('/limited').set('X-Forwarded-For', asClient('198.51.100.9'))).status).toBe(200);

    const thirdClient = await request(app).get('/limited').set('X-Forwarded-For', asClient('192.0.2.4'));
    expect(thirdClient.status).toBe(429); // locked out by two strangers' requests
  });

  it('is disabled by default under APP_ENV=test so the suite is not self-limiting', async () => {
    const app = express();
    app.get('/open', rateLimiter(1, 60_000, uniquePrefix()), (_req, res) => res.json({ ok: true }));
    for (let i = 0; i < 5; i++) {
      expect((await request(app).get('/open')).status).toBe(200);
    }
  });

  it('sets Retry-After when limiting', async () => {
    const app = makeApp({ trustProxy: 2, limit: 1 });
    await request(app).get('/limited').set('X-Forwarded-For', asClient('203.0.113.200'));
    const limited = await request(app).get('/limited').set('X-Forwarded-For', asClient('203.0.113.200'));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('configures the real app with a hop count, never `true`', async () => {
    // `true` would trust the leftmost (attacker-supplied) XFF entry.
    expect(realApp.get('trust proxy')).not.toBe(true);
    expect(typeof realApp.get('trust proxy')).toBe('number');
  });
});
