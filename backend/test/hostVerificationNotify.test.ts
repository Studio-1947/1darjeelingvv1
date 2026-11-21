import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/s3', () => ({
  uploadPrivate: vi.fn(async (_buffer: Buffer, key: string) => key),
  getPrivateObject: vi.fn(),
  deletePrivate: vi.fn(async () => {}),
}));

import { app } from '../src/app';
import { loginAdmin, nextPhone, onboardActiveProvider, uploadRequiredDocs } from './helpers';

/**
 * Hosts used to find out about their verification only by opening the app. Now the team's
 * decision reaches them (and any co-owners) as a notification: what to fix, or that they are live.
 */

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const feed = async (token: string) => (await request(app).get('/api/notifications').set(auth(token))).body.items as any[];

async function pendingDocs(admin: string, providerId: string) {
  const list = await request(app).get('/api/admin/kyc?status=pending').set(auth(admin));
  return list.body.documents.filter((d: any) => d.provider_id === providerId);
}

describe('host verification news', () => {
  it('tells the owner and a co-owner which document to change, and why', async () => {
    const admin = await loginAdmin();
    const owner = await onboardActiveProvider({ name: 'Guide Owner', businessType: 'guide', awaitingApproval: true });
    const coPhone = nextPhone();
    await request(app).post('/api/providers/me/owners').set(auth(owner.token)).send({ phone: coPhone });
    const co = (await request(app).post('/api/auth/otp/verify').send({ phone: coPhone, otp: '123456', name: 'Co Guide' })).body;

    await uploadRequiredDocs(owner.token);
    const [doc] = await pendingDocs(admin, owner.providerId);
    const r = await request(app).post(`/api/admin/kyc/${doc.id}/review`).set(auth(admin))
      .send({ decision: 'reject', reason: 'The photo is blurred' });
    expect(r.status).toBe(200);

    for (const token of [owner.token, co.token]) {
      const n = (await feed(token)).find((x) => x.kind === 'kyc_changes');
      expect(n).toBeTruthy();
      expect(n.body).toContain('The photo is blurred');
    }

    // The tracker on both apps reads this state.
    const profile = await request(app).get('/api/providers/me/profile').set(auth(owner.token));
    expect(profile.body.verification).toMatchObject({ status: 'changes_requested', action_message: 'The photo is blurred' });
    expect(typeof profile.body.verification.action_document).toBe('string');
  });

  it('tells the host once when they are approved and live', async () => {
    const admin = await loginAdmin();
    const owner = await onboardActiveProvider({ name: 'Guide Two', businessType: 'guide', awaitingApproval: true });
    await uploadRequiredDocs(owner.token);
    for (const d of await pendingDocs(admin, owner.providerId)) {
      await request(app).post(`/api/admin/kyc/${d.id}/review`).set(auth(admin)).send({ decision: 'approve' });
    }
    const approved = (await feed(owner.token)).filter((x) => x.kind === 'kyc_approved');
    expect(approved).toHaveLength(1);
    const profile = await request(app).get('/api/providers/me/profile').set(auth(owner.token));
    expect(profile.body.kyc_status).toBe('verified');
    expect(profile.body.verification.status).toBe('approved');
  });
});
