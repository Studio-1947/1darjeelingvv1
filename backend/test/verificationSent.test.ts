import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { completeMandatoryProfile, onboardActiveProvider, uploadRequiredDocs } from './helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('verification: "Documents sent" only once every required document is in', () => {
  it('stays "not ready" with one required document missing, then "submitted"', async () => {
    const host = await onboardActiveProvider({ name: 'Half Sent Stay', awaitingApproval: true });
    await completeMandatoryProfile(host.token);
    const first = await request(app).post('/api/providers/me/kyc').set(auth(host.token))
      .send({ doc_type: 'aadhaar', file: PNG, filename: 'aadhaar.png' });
    expect(first.status).toBe(200);
    const partial = await request(app).get('/api/providers/me/profile').set(auth(host.token));
    expect(partial.body.verification.status).toBe('not_ready');

    await uploadRequiredDocs(host.token);
    const all = await request(app).get('/api/providers/me/profile').set(auth(host.token));
    expect(all.body.verification.status).toBe('submitted');
    // The checklist tells the website which box is a video.
    expect(all.body.checklist.some((c: any) => c.kind === 'kyc' && c.media === 'video')).toBe(true);
  });
});
