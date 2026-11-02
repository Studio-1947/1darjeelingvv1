import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { requiredDocTypes, requirementsFor, requiresLocationVerification } from '../src/lib/kycRequirements';
import { onboardActiveProvider, registerUser } from './helpers';

// Guide: a host type of its own, booked by request like a driver.
describe('guide', () => {
  it('asks a guide for Aadhaar and a selfie, with a guide licence optional', () => {
    expect(requiredDocTypes('guide').sort()).toEqual(['aadhaar', 'owner_photo']);
    expect(requirementsFor('guide').find((r) => r.docType === 'guide_licence')?.required).toBe(false);
    expect(requiresLocationVerification('guide')).toBe(false);
  });

  it('lets a guide onboard and go live with a guide listing travellers can find', async () => {
    const { providerId } = await onboardActiveProvider({ name: 'Pemba Guide', businessType: 'guide' });
    const res = await request(app).get('/api/listings?type=guide');
    expect(res.status).toBe(200);
    const mine = res.body.items.find((l: { provider_id: string }) => l.provider_id === providerId);
    expect(mine?.type).toBe('guide');
  });

  it('takes a booking request for a guide, while an unpaid visitor keeps the number locked', async () => {
    const { providerId } = await onboardActiveProvider({ name: 'Dawa Guide', businessType: 'guide' });
    const list = await request(app).get('/api/listings?type=guide');
    const listing = list.body.items.find((l: { provider_id: string }) => l.provider_id === providerId);

    const { token } = await registerUser({ name: 'Guide Seeker', paySupport: false });
    const detail = await request(app).get(`/api/listings/${listing.id}`).set('Authorization', `Bearer ${token}`);
    expect(detail.body.item.provider_phone_locked).toBe(true);
    const { token: passHolder } = await registerUser({ name: 'Guide Pass Holder' });
    const booking = await request(app).post('/api/bookings')
      .set('Authorization', `Bearer ${passHolder}`)
      .send({ listing_id: listing.id, listing_type: 'guide', check_in: '2027-04-10', guests: 2, notes: 'Tiger Hill at dawn' });
    expect(booking.status).toBe(200);
    expect(booking.body.booking.listing_type).toBe('guide');
  });
});
