import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { registerUser, createListing } from './helpers';
import { readProfilePatch } from '../src/lib/travellerProfile';
import { isCompleted, POINTS } from '../src/lib/travellerDashboard';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('traveller profile fields', () => {
  it('reads and checks each field', () => {
    const now = new Date('2026-11-03T00:00:00Z');
    const ok = readProfilePatch({
      whatsapp: '98765 43210', gender: 'female', age: 30, address: 'Hill Cart Road, Darjeeling', pincode: '734101',
      liked_foods: ['momo', 'tea', 'momo'], traveller_type: 'family', diet: 'veg',
    }, now);
    expect(ok).toEqual({ patch: {
      whatsapp: '+919876543210', gender: 'female', birthYear: 1996, address: 'Hill Cart Road, Darjeeling', pincode: '734101',
      likedFoods: ['momo', 'tea'], travellerType: 'family', diet: 'veg',
    } });
    expect(readProfilePatch({ pincode: '12345' })).toHaveProperty('error');
    expect(readProfilePatch({ age: 5 })).toHaveProperty('error');
    expect(readProfilePatch({ diet: 'keto' })).toHaveProperty('error');
    expect(readProfilePatch({ liked_foods: ['pizza'] })).toHaveProperty('error');
    expect(readProfilePatch({ gender: '' })).toEqual({ patch: { gender: null } });
  });

  it('saves through PATCH /users/me and comes back on the user', async () => {
    const { token } = await registerUser({ name: 'Profile Pema' });
    const res = await request(app).patch('/api/users/me').set(auth(token))
      .send({ gender: 'female', age: 28, address: 'Ghum, Darjeeling', pincode: '734102', liked_foods: ['thukpa'], traveller_type: 'solo', diet: 'vegan', whatsapp: '9000011111' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ gender: 'female', pincode: '734102', likedFoods: ['thukpa'], travellerType: 'solo', diet: 'vegan', whatsapp: '+919000011111' });
    expect(typeof res.body.user.birthYear).toBe('number');

    const bad = await request(app).patch('/api/users/me').set(auth(token)).send({ pincode: 'abc' });
    expect(bad.status).toBe(400);
  });
});

describe('traveller dashboard', () => {
  it('counts a confirmed booking as done once its date has passed', () => {
    expect(isCompleted({ status: 'confirmed', checkIn: '2020-01-01', checkOut: '2020-01-03' })).toBe(true);
    expect(isCompleted({ status: 'confirmed', checkIn: '2999-01-01', checkOut: null })).toBe(false);
    expect(isCompleted({ status: 'cancelled', checkIn: '2020-01-01', checkOut: null })).toBe(false);
    expect(isCompleted({ status: 'confirmed', checkIn: null, checkOut: null })).toBe(true);
  });

  it('works out points, awards and totals from what the traveller has done', async () => {
    const { token, user } = await registerUser({ name: 'Dashboard Dorjee', paySupport: false });
    const listing = await createListing({ title: 'Old Trip Spot' });
    await db.insert(schema.bookings).values({
      id: uuidv4(), userId: user.id, listingId: listing.id, listingType: 'spot', listingTitle: 'Old Trip Spot',
      checkIn: '2020-01-01', checkOut: '2020-01-02', guests: 1, notes: '', status: 'confirmed', createdAt: new Date().toISOString(),
    } as any);

    const res = await request(app).get('/api/users/me/dashboard').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.totals.trips).toBe(1);
    expect(res.body.points).toBe(POINTS.completedTrip);
    expect(res.body.points_rules).toEqual({ completedTrip: 50, review: 20, referral: 100, profileComplete: 50, pass: 25 });
    expect(res.body.pass.active).toBe(false);
    const firstTrip = res.body.awards.find((a: any) => a.id === 'first_trip');
    expect(firstTrip).toMatchObject({ earned: true, progress: 1, goal: 1 });
    expect(res.body.profile.complete).toBe(false);
    expect(res.body.profile.missing).toContain('gender');
  });
});

describe('feedback for aangan', () => {
  it('takes a message with an optional rating and lists the sender’s own', async () => {
    const { token } = await registerUser({ name: 'Feedback Phurba' });
    expect((await request(app).post('/api/feedback/aangan').set(auth(token)).send({ message: 'no' })).status).toBe(400);
    expect((await request(app).post('/api/feedback/aangan').set(auth(token)).send({ message: 'Lovely app', rating: 9 })).status).toBe(400);
    const ok = await request(app).post('/api/feedback/aangan').set(auth(token)).send({ message: 'Lovely app, more cafes please', rating: 5 });
    expect(ok.status).toBe(201);
    const mine = await request(app).get('/api/feedback/aangan').set(auth(token));
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0]).toMatchObject({ rating: 5, status: 'open' });
  });
});
