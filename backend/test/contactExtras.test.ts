import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { onboardActiveProvider, registerUser } from './helpers';

// A host's number must not leak through a listing's free-form extras, where onboarding has always
// copied the contact phone and the profile adds WhatsApp. It follows the provider_phone gate.
describe('contact numbers in listing extras', () => {
  async function guideWithNumbers(name: string) {
    const { token, providerId, phone } = await onboardActiveProvider({ name, businessType: 'guide' });
    await request(app).patch('/api/providers/me').set('Authorization', `Bearer ${token}`)
      .send({ profile: { whatsapp: '9876500011', services: [{ name: 'Walk', price: 900 }] } });
    const list = await request(app).get('/api/listings?type=guide');
    const listing = list.body.items.find((l: { provider_id: string }) => l.provider_id === providerId);
    return { listing, phone, providerId };
  }

  it('keeps them out of lists and out of a listing seen without the pass', async () => {
    const { listing } = await guideWithNumbers('Quiet Guide');
    expect(listing.extras.contact_phone).toBeUndefined();
    expect(listing.extras.whatsapp).toBeUndefined();

    const anonymous = await request(app).get(`/api/listings/${listing.id}`);
    expect(anonymous.body.item.extras.contact_phone).toBeUndefined();
    expect(anonymous.body.item.extras.whatsapp).toBeUndefined();

    const { token } = await registerUser({ name: 'No Pass Yet', paySupport: false });
    const unpaid = await request(app).get(`/api/listings/${listing.id}`).set('Authorization', `Bearer ${token}`);
    expect(unpaid.body.item.provider_phone).toBeNull();
    expect(unpaid.body.item.extras.whatsapp).toBeUndefined();
  });

  it('shows them to someone allowed to see the phone', async () => {
    const { listing } = await guideWithNumbers('Open Guide');
    const { token } = await registerUser({ name: 'Pass Holder' });
    const res = await request(app).get(`/api/listings/${listing.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.body.item.provider_phone).toBeTruthy();
    expect(res.body.item.extras.whatsapp).toBe('9876500011');
  });

  it('keeps them off the public business page', async () => {
    const { providerId } = await guideWithNumbers('Business Page Guide');
    const res = await request(app).get(`/api/providers/public/${providerId}`);
    expect(res.status).toBe(200);
    for (const l of res.body.listings) {
      expect(l.extras.contact_phone).toBeUndefined();
      expect(l.extras.whatsapp).toBeUndefined();
    }
  });

  it('does not show a business page for a host still awaiting approval', async () => {
    const { providerId } = await onboardActiveProvider({ name: 'Awaiting Guide', businessType: 'guide', awaitingApproval: true });
    const res = await request(app).get(`/api/providers/public/${providerId}`);
    expect(res.status).toBe(404);
  });
});
