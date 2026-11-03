import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// KYC storage is integration-tested separately. Keep this suite independent of a
// locally running MinIO instance, just like the other KYC route test suites.
vi.mock('../src/lib/s3', () => ({
  uploadPrivate: vi.fn(async (_buffer: Buffer, key: string) => key),
  getPrivateObject: vi.fn(),
  deletePrivate: vi.fn(async () => {}),
}));

import { app } from '../src/app';
import { missingMandatory, profilePatchFrom, startingPriceFor } from '../src/lib/hostProfile';
import { onboardActiveProvider, registerUser } from './helpers';

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const photos = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/p${i}.jpg`);

describe('host profile fields', () => {
  it('checks each field by host type and refuses ones that do not belong', () => {
    expect(profilePatchFrom('guide', { age: 30, gender: 'female', guide_types: ['trekking', 'birding'], seasons: ['autumn'] }))
      .toEqual({ age: 30, gender: 'female', guide_types: ['trekking', 'birding'], seasons: ['autumn'] });
    expect(profilePatchFrom('guide', { age: 12 })).toHaveProperty('error');
    expect(profilePatchFrom('guide', { guide_types: ['astronaut'] })).toHaveProperty('error');
    expect(profilePatchFrom('driver', { rooms: [] })).toHaveProperty('error');
    expect(profilePatchFrom('driver', { seats: 7, license_number: 'wb-7420150012345' })).toEqual({ seats: 7, license_number: 'WB-7420150012345' });
    expect(profilePatchFrom('homestay', { rooms: [{ name: 'Mountain-view double', price: 1800, unit: 'night' }], home_delivery: true }))
      .toEqual({ rooms: [{ name: 'Mountain-view double', price: 1800, unit: 'night' }], home_delivery: true });
    expect(profilePatchFrom('homestay', { social: { instagram: '@norbu' }, whatsapp: '9876543210', available: false }))
      .toEqual({ social: { instagram: '@norbu' }, whatsapp: '9876543210', available: false });
  });

  it('knows what each type must have before approval', () => {
    expect(missingMandatory('driver', { images: photos(5) }).map((m) => m.key)).toEqual(['images']);
    expect(missingMandatory('driver', { images: photos(6) })).toEqual([]);
    expect(missingMandatory('homestay', { images: photos(8) }).map((m) => m.key)).toEqual(['host_name']);
    expect(missingMandatory('homestay', { host_name: 'Pema', images: photos(8) })).toEqual([]);
    expect(missingMandatory('guide', { services: [{ name: 'Walk', price: 0 }] }).map((m) => m.key)).toEqual(['services']);
    expect(missingMandatory('guide', { services: [{ name: 'Walk', price: 800 }] })).toEqual([]);
    expect(missingMandatory('cafe', {})).toEqual([]);
  });

  it('derives the public price from the cheapest room, service or route', () => {
    expect(startingPriceFor('homestay', { rooms: [{ price: 2200 }, { price: 1800 }] })).toBe(1800);
    expect(startingPriceFor('guide', { services: [{ price: 0 }, { price: 900 }] })).toBe(900);
    expect(startingPriceFor('cafe', {})).toBeNull();
    expect(startingPriceFor('cafe', { menu: [{ price: 120 }, { price: 60 }] })).toBe(60);
    expect(startingPriceFor('shop', { goods: [{ price: 350 }] })).toBe(350);
  });

  it('takes a cafe menu and a shop goods list, capped at ten goods', () => {
    expect(profilePatchFrom('cafe', { menu: [{ name: 'Momo', price: 80 }], home_delivery: true }))
      .toEqual({ menu: [{ name: 'Momo', price: 80, unit: 'plate' }], home_delivery: true });
    expect(profilePatchFrom('shop', { shop_kind: 'Tea shop', goods: [{ name: 'First flush', price: 450, unit: 'pack' }] }))
      .toEqual({ shop_kind: 'Tea shop', goods: [{ name: 'First flush', price: 450, unit: 'pack' }] });
    const eleven = Array.from({ length: 11 }, (_, i) => ({ name: `Item ${i}`, price: 10 }));
    expect(profilePatchFrom('shop', { goods: eleven })).toHaveProperty('error');
    expect(profilePatchFrom('shop', { goods: [{ name: 'Tea', price: 10, unit: 'night' }] })).toHaveProperty('error');
    expect(profilePatchFrom('cafe', { goods: [] })).toHaveProperty('error');
  });
});

describe('PATCH /providers/me profile', () => {
  it('saves the profile and copies it onto the host listing travellers see', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Profile Guide', businessType: 'guide' });
    const res = await request(app).patch('/api/providers/me').set('Authorization', `Bearer ${token}`).send({
      profile: { services: [{ name: 'Tiger Hill sunrise walk', price: 1200, unit: 'trip' }], languages: ['Nepali', 'English'], experience_years: 8 },
      cover_image: 'https://example.com/cover.jpg',
    });
    expect(res.status).toBe(200);
    expect(res.body.provider.price_from).toBe(1200);
    expect(res.body.provider.profile_missing).toEqual([]);

    const list = await request(app).get('/api/listings?type=guide');
    const listing = list.body.items.find((l: { provider_id: string }) => l.provider_id === providerId);
    expect(listing.price).toBe(1200);
    expect(listing.image).toBe('https://example.com/cover.jpg');
    expect(listing.extras.services[0].name).toBe('Tiger Hill sunrise walk');
    expect(listing.extras.experience_years).toBe(8);
  });

  it('refuses a field that is not part of this host type', async () => {
    const { token } = await onboardActiveProvider({ name: 'Wrong Field Driver', businessType: 'driver' });
    const res = await request(app).patch('/api/providers/me').set('Authorization', `Bearer ${token}`).send({ profile: { rooms: [] } });
    expect(res.status).toBe(400);
  });
});

describe('mandatory items before approval', () => {
  it('holds back a new host\'s documents until the mandatory profile is in, then lets them through', async () => {
    const { token } = await onboardActiveProvider({ name: 'New Homestay', businessType: 'homestay', awaitingApproval: true });
    const blocked = await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: TINY_PNG, filename: 'aadhaar.png' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('profile_incomplete');
    expect(blocked.body.missing.map((m: { key: string }) => m.key).sort()).toEqual(['host_name', 'images']);

    await request(app).patch('/api/providers/me').set('Authorization', `Bearer ${token}`)
      .send({ profile: { host_name: 'Pema', images: photos(8) } });
    const ok = await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: TINY_PNG, filename: 'aadhaar.png' });
    expect(ok.status).toBe(200);
  });

  it('does not hold back a host who was already live', async () => {
    const { token } = await onboardActiveProvider({ name: 'Old Homestay', businessType: 'homestay' });
    const res = await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: TINY_PNG, filename: 'aadhaar.png' });
    expect(res.status).toBe(200);
  });
});

describe('availability', () => {
  it('takes no bookings while the host has switched availability off', async () => {
    const { token: hostToken, providerId } = await onboardActiveProvider({ name: 'Away Driver', businessType: 'driver' });
    await request(app).patch('/api/providers/me').set('Authorization', `Bearer ${hostToken}`).send({ profile: { available: false } });
    const list = await request(app).get('/api/listings?type=driver');
    const listing = list.body.items.find((l: { provider_id: string }) => l.provider_id === providerId);

    const { token } = await registerUser({ name: 'Rider' });
    const res = await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id, listing_type: 'driver', guests: 1 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('unavailable');
  });
});
