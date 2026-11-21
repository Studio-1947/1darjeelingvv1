import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// The video goes to the public bucket; stub storage so CI (which has no MinIO) can run this.
vi.mock('../src/lib/s3', () => ({
  uploadToMinIO: vi.fn(async (_buffer: Buffer, key: string) => `https://cdn.test/1darjeeling/${key}`),
  uploadPrivate: vi.fn(async (_buffer: Buffer, key: string) => key),
  getPrivateObject: vi.fn(),
  deletePrivate: vi.fn(async () => {}),
  checkStorage: vi.fn(async () => {}),
  ensureBucketsExist: vi.fn(async () => {}),
}));

import { app } from '../src/app';
import { onboardActiveProvider, registerUser } from './helpers';

/** The intro video is an uploaded file travellers can play, not a link (board: "Short Bio / Video"). */

const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(64)]);

describe('POST /providers/me/intro-video', () => {
  it('stores a host video publicly and lets the profile use it', async () => {
    const { token } = await onboardActiveProvider({ name: 'Video Host' });
    const up = await request(app).post('/api/providers/me/intro-video')
      .set('Authorization', `Bearer ${token}`).set('Content-Type', 'video/mp4').send(MP4);
    expect(up.status).toBe(200);
    expect(up.body.url).toMatch(/\/videos\/[0-9a-f-]+\.mp4$/);

    const save = await request(app).patch('/api/providers/me').set('Authorization', `Bearer ${token}`)
      .send({ profile: { intro_video: up.body.url } });
    expect(save.status).toBe(200);
    expect(save.body.provider.extras.intro_video).toBe(up.body.url);
  });

  it('refuses files that are not videos, and people without a business', async () => {
    const { token } = await onboardActiveProvider({ name: 'Video Host Two' });
    const fake = await request(app).post('/api/providers/me/intro-video')
      .set('Authorization', `Bearer ${token}`).set('Content-Type', 'video/mp4').send(Buffer.from('not a video at all, just text'));
    expect(fake.status).toBe(400);

    const traveller = await registerUser({ name: 'Just Visiting' });
    const nope = await request(app).post('/api/providers/me/intro-video')
      .set('Authorization', `Bearer ${traveller.token}`).set('Content-Type', 'video/mp4').send(MP4);
    expect(nope.status).toBe(404);
  });
});
