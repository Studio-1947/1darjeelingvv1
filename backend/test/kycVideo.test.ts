import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/s3', () => ({
  uploadPrivate: vi.fn(async (_buffer: Buffer, key: string) => key),
  getPrivateObject: vi.fn(async () => {
    const { Readable } = await import('stream');
    return { stream: Readable.from([Buffer.from('test-file-bytes')]), contentType: 'video/mp4' };
  }),
  deletePrivate: vi.fn(async () => { }),
}));

import { app } from '../src/app';
import { uploadPrivate } from '../src/lib/s3';
import { onboardActiveProvider } from './helpers';

// The smallest thing the route will accept as MP4: a box whose type, at offset 4, is "ftyp".
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(32)]);
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const postVideo = (token: string, docType: string, body: Buffer, type = 'video/mp4') =>
  request(app)
    .post(`/api/providers/me/kyc/video?doc_type=${docType}`)
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', type)
    .set('X-Filename', 'walkaround.mp4')
    .send(body);

describe('driver verification video', () => {
  it('a driver can upload the vehicle video; it starts pending', async () => {
    const { token } = await onboardActiveProvider({ name: 'Vid One', businessType: 'driver' });
    const res = await postVideo(token, 'driver_vehicle_video', MP4);
    expect(res.status).toBe(200);
    expect(res.body.document.doc_type).toBe('driver_vehicle_video');
    expect(res.body.document.status).toBe('pending');
    expect(uploadPrivate).toHaveBeenCalled();
  });

  it('shows the video row in the checklist flagged as video', async () => {
    const { token } = await onboardActiveProvider({ name: 'Vid Two', businessType: 'driver' });
    const res = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${token}`);
    const row = res.body.checklist.find((c: any) => c.key === 'driver_vehicle_video');
    expect(row).toMatchObject({ kind: 'kyc', required: true, media: 'video' });
    expect(res.body.checklist.find((c: any) => c.key === 'driver_vehicle_photo').media).toBeUndefined();
  });

  it('rejects a non-video content type', async () => {
    const { token } = await onboardActiveProvider({ name: 'Vid Three', businessType: 'driver' });
    const res = await request(app)
      .post('/api/providers/me/kyc/video?doc_type=driver_vehicle_video')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/octet-stream')
      .send(MP4);
    expect(res.status).toBe(400);
  });

  it('rejects bytes that are not really an MP4', async () => {
    const { token } = await onboardActiveProvider({ name: 'Vid Four', businessType: 'driver' });
    const res = await postVideo(token, 'driver_vehicle_video', Buffer.from('definitely not a video file'));
    expect(res.status).toBe(400);
    expect(res.body.detail).toMatch(/do not match/);
  });

  it('rejects a video over 25 MB', async () => {
    const { token } = await onboardActiveProvider({ name: 'Vid Five', businessType: 'driver' });
    const big = Buffer.concat([MP4, Buffer.alloc(25 * 1024 * 1024)]);
    const res = await postVideo(token, 'driver_vehicle_video', big);
    expect(res.status).toBe(400);
    expect(res.body.detail).toMatch(/25 MB/);
  });

  it('refuses a photo slot on the video route and a video slot on the JSON route', async () => {
    const { token } = await onboardActiveProvider({ name: 'Vid Six', businessType: 'driver' });
    const wrongRoute = await postVideo(token, 'driver_vehicle_photo', MP4);
    expect(wrongRoute.status).toBe(400);
    const json = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'driver_vehicle_video', file: PNG_DATA_URL, filename: 'v.png' });
    expect(json.status).toBe(400);
  });

  it('a shop cannot upload a driver video', async () => {
    const { token } = await onboardActiveProvider({ name: 'Vid Seven', businessType: 'shop' });
    const res = await postVideo(token, 'driver_vehicle_video', MP4);
    expect(res.status).toBe(400);
  });

  it('needs a signed-in active provider', async () => {
    const anon = await request(app)
      .post('/api/providers/me/kyc/video?doc_type=driver_vehicle_video')
      .set('Content-Type', 'video/mp4')
      .send(MP4);
    expect(anon.status).toBe(401);
  });
});
