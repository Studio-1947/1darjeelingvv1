import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, onboardActiveProvider, createConfirmedBooking, loginAdmin } from './helpers';

function nights(offsetDays: number) {
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  return { checkIn: day(offsetDays), checkOut: day(offsetDays + 2) };
}

async function listingFor(token: string, body: Record<string, unknown>) {
  const res = await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`).send(body);
  expect(res.status).toBe(200);
  return res.body.item.id as string;
}

async function detail(id: string, token?: string) {
  const req = request(app).get(`/api/listings/${id}`);
  if (token) req.set('Authorization', `Bearer ${token}`);
  const res = await req;
  expect(res.status).toBe(200);
  return res.body.item;
}

describe('provider phone on a listing', () => {
  it('is public for a café, which is never booked', async () => {
    const { token } = await onboardActiveProvider({ name: 'Phone Cafe', businessType: 'cafe' });
    const id = await listingFor(token, { title: 'Phone Cafe', type: 'cafe', description: 'Tea and momos', location: 'Darjeeling' });
    const item = await detail(id);
    expect(item.provider_phone).toBeTruthy();
    expect(item.provider_phone_locked).toBe(false);
  });

  it('is held back from the public for a homestay, but flagged as existing', async () => {
    const { token } = await onboardActiveProvider({ name: 'Phone Homestay' });
    const id = await listingFor(token, { title: 'Phone Homestay', type: 'homestay', description: 'A room with a view', location: 'Darjeeling', price: 1500 });
    const item = await detail(id);
    expect(item.provider_phone).toBeNull();
    expect(item.provider_phone_locked).toBe(true);
  });

  it('is shown to the host who owns the listing and to an admin', async () => {
    const { token, phone } = await onboardActiveProvider({ name: 'Phone Owner' });
    const id = await listingFor(token, { title: 'Phone Owner Stay', type: 'homestay', description: 'A room with a view', location: 'Darjeeling', price: 1500 });
    expect((await detail(id, token)).provider_phone).toBe(phone);
    expect((await detail(id, await loginAdmin())).provider_phone).toBe(phone);
  });

  it('is released to a signed-in guest with an active aangan pass', async () => {
    const { token: host, phone } = await onboardActiveProvider({ name: 'Phone Release' });
    const id = await listingFor(host, { title: 'Phone Release Stay', type: 'homestay', description: 'A room with a view', location: 'Darjeeling', price: 1500 });
    const { token: guest } = await registerUser({ name: 'Phone Guest' });

    expect((await detail(id, guest)).provider_phone).toBe(phone);
  });

  it('is not released to a different guest by someone else\'s booking', async () => {
    const { token: host } = await onboardActiveProvider({ name: 'Phone Isolation' });
    const id = await listingFor(host, { title: 'Phone Isolation Stay', type: 'homestay', description: 'A room with a view', location: 'Darjeeling', price: 1500 });
    const { token: booker } = await registerUser({ name: 'Phone Booker' });
    const { token: other } = await registerUser({ name: 'Phone Other', paySupport: false });
    await createConfirmedBooking({ token: booker, listingId: id, listingType: 'homestay', ...nights(50) });
    expect((await detail(id, other)).provider_phone).toBeNull();
  });

  it('treats a bad token as an anonymous caller rather than failing', async () => {
    const { token } = await onboardActiveProvider({ name: 'Phone Badtoken' });
    const id = await listingFor(token, { title: 'Phone Badtoken Stay', type: 'homestay', description: 'A room with a view', location: 'Darjeeling', price: 1500 });
    const res = await request(app).get(`/api/listings/${id}`).set('Authorization', 'Bearer not-a-token');
    expect(res.status).toBe(200);
    expect(res.body.item.provider_phone).toBeNull();
  });
});
