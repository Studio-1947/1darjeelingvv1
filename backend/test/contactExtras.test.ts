import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { createConfirmedBooking, inDays, onboardActiveProvider, registerUser } from './helpers';
import { publicExtras } from '../src/lib/listingContact';

// A host's number must not leak through a listing's free-form extras, where onboarding has always
// copied the contact phone and the profile adds WhatsApp and social links. They follow the
// provider_phone gate: only a confirmed booking opens them, with or without the aangan pass.
describe('contact numbers in listing extras', () => {
  it('drops the licence number and UPI id before a confirmed booking, and keeps them after', () => {
    const extras = { license_number: 'WB-74 2019 0001234', upi: 'host@okaxis', vehicle_number: 'WB 74 A 1234', rooms: [] };
    const shut = publicExtras(extras, false);
    expect(shut.license_number).toBeUndefined();
    expect(shut.upi).toBeUndefined();
    expect(shut.vehicle_number).toBe('WB 74 A 1234');
    const open = publicExtras(extras, true);
    expect(open.license_number).toBe('WB-74 2019 0001234');
    expect(open.upi).toBe('host@okaxis');
  });

  async function guideWithNumbers(name: string) {
    const { token, providerId, phone } = await onboardActiveProvider({ name, businessType: 'guide' });
    await request(app).patch('/api/providers/me').set('Authorization', `Bearer ${token}`)
      .send({ profile: { whatsapp: '9876500011', social: { instagram: '@hillguide', website: 'https://hillguide.in' }, services: [{ name: 'Walk', price: 900 }] } });
    const list = await request(app).get('/api/listings?type=guide');
    const listing = list.body.items.find((l: { provider_id: string }) => l.provider_id === providerId);
    return { listing, phone, providerId, token };
  }

  it('keeps them out of lists and out of a listing seen without a booking', async () => {
    const { listing } = await guideWithNumbers('Quiet Guide');
    expect(listing.extras.contact_phone).toBeUndefined();
    expect(listing.extras.whatsapp).toBeUndefined();
    expect(listing.extras.social).toEqual({ website: 'https://hillguide.in' });

    const anonymous = await request(app).get(`/api/listings/${listing.id}`);
    expect(anonymous.body.item.extras.contact_phone).toBeUndefined();
    expect(anonymous.body.item.extras.whatsapp).toBeUndefined();
    expect(anonymous.body.item.extras.social).toEqual({ website: 'https://hillguide.in' });

    const { token } = await registerUser({ name: 'No Pass Yet', paySupport: false });
    const unpaid = await request(app).get(`/api/listings/${listing.id}`).set('Authorization', `Bearer ${token}`);
    expect(unpaid.body.item.provider_phone).toBeNull();
    expect(unpaid.body.item.extras.whatsapp).toBeUndefined();
  });

  it('keeps them from a pass holder who has not booked', async () => {
    const { listing } = await guideWithNumbers('Member Guide');
    const { token } = await registerUser({ name: 'Pass Holder' });
    const res = await request(app).get(`/api/listings/${listing.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.body.item.provider_phone).toBeNull();
    expect(res.body.item.provider_phone_locked).toBe(true);
    expect(res.body.item.extras.whatsapp).toBeUndefined();
    expect(res.body.item.extras.social).toEqual({ website: 'https://hillguide.in' });
  });

  it('shows them to a guest whose booking is confirmed', async () => {
    const { listing } = await guideWithNumbers('Open Guide');
    const { token } = await registerUser({ name: 'Booked Guest' });
    await createConfirmedBooking({ token, listingId: listing.id, listingType: 'guide', checkIn: inDays(20) });
    const res = await request(app).get(`/api/listings/${listing.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.body.item.provider_phone).toBeTruthy();
    expect(res.body.item.extras.whatsapp).toBe('9876500011');
    expect(res.body.item.extras.social).toEqual({ instagram: '@hillguide', website: 'https://hillguide.in' });
  });

  it('keeps the number and social links off the host page until a booking is confirmed', async () => {
    const { listing, token: hostToken } = await guideWithNumbers('Page Guide');
    const path = (await request(app).get('/api/providers/me').set('Authorization', `Bearer ${hostToken}`)).body.provider.page_path;
    const { token: member } = await registerUser({ name: 'Page Member' });
    const { token: otherHost } = await onboardActiveProvider({ name: 'Nosy Driver', businessType: 'driver' });

    for (const viewer of [member, otherHost]) {
      const page = await request(app).get(`/api/providers/page${path}`).set('Authorization', `Bearer ${viewer}`);
      expect(page.status).toBe(200);
      expect(page.body.contact).toEqual({ phone: null, whatsapp: null, locked: true });
      expect(page.body.page.social).toEqual({ website: 'https://hillguide.in' });
    }

    await createConfirmedBooking({ token: member, listingId: listing.id, listingType: 'guide', checkIn: inDays(30) });
    const after = await request(app).get(`/api/providers/page${path}`).set('Authorization', `Bearer ${member}`);
    expect(after.body.contact.locked).toBe(false);
    expect(after.body.contact.whatsapp).toBe('9876500011');
    expect(after.body.page.social).toEqual({ instagram: '@hillguide', website: 'https://hillguide.in' });

    // The host still sees their own page whole.
    const own = await request(app).get(`/api/providers/page${path}`).set('Authorization', `Bearer ${hostToken}`);
    expect(own.body.contact.locked).toBe(false);
  });

  it('keeps them off the public business page', async () => {
    const { providerId } = await guideWithNumbers('Business Page Guide');
    const res = await request(app).get(`/api/providers/public/${providerId}`);
    expect(res.status).toBe(200);
    for (const l of res.body.listings) {
      expect(l.extras.contact_phone).toBeUndefined();
      expect(l.extras.whatsapp).toBeUndefined();
      expect(l.extras.social).toEqual({ website: 'https://hillguide.in' });
    }
  });

  it('does not show a business page for a host still awaiting approval', async () => {
    const { providerId } = await onboardActiveProvider({ name: 'Awaiting Guide', businessType: 'guide', awaitingApproval: true });
    const res = await request(app).get(`/api/providers/public/${providerId}`);
    expect(res.status).toBe(404);
  });
});
