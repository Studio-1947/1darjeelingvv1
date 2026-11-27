import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { bookingGrossAmount } from '../src/lib/bookingAmount';
import { checkDriverTrip, isLateCancel, pickRoom } from '../src/lib/bookingDetails';
import { profilePatchFrom } from '../src/lib/hostProfile';
import { createConfirmedBooking, createListing, inDays, onboardActiveProvider, registerUser } from './helpers';

const ROOMS = [
  { name: 'Valley Room', price: 2400, unit: 'night', occ: 2 },
  { name: 'Family Room', price: 900, unit: 'head', occ: 5 },
  { name: 'Attic', price: 1500, unit: 'night' },
];
const ROUTES = [
  { route: 'NJP to Darjeeling', price: 3200, unit: 'trip' },
  { route: 'Darjeeling sightseeing', price: 2500, unit: 'day' },
];

const book = (token: string, body: Record<string, unknown>) =>
  request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`).send(body);

describe('room rule on the host profile', () => {
  it('takes an optional occ per room and refuses a bad one', () => {
    const ok = profilePatchFrom('homestay', { rooms: ROOMS }) as any;
    expect(ok.rooms[0]).toEqual({ name: 'Valley Room', price: 2400, unit: 'night', occ: 2 });
    expect(ok.rooms[2]).toEqual({ name: 'Attic', price: 1500, unit: 'night' });
    expect(profilePatchFrom('homestay', { rooms: [{ name: 'X', price: 10, occ: 0 }] })).toHaveProperty('error');
    expect(profilePatchFrom('homestay', { rooms: [{ name: 'X', price: 10, occ: 'two' }] })).toHaveProperty('error');
  });

  it('takes up to two extra mattresses per room, with an optional price, only once the room says what it sleeps', () => {
    const ok = profilePatchFrom('homestay', { rooms: [
      { name: 'Valley Room', price: 2400, unit: 'night', occ: 2, extra_beds: 1, extra_bed_price: 400 },
      { name: 'Loft', price: 1800, unit: 'night', occ: 2, extra_beds: 2 },
      { name: 'Box', price: 900, unit: 'night', occ: 1, extra_beds: 0, extra_bed_price: 300 },
    ] }) as any;
    expect(ok.rooms[0]).toEqual({ name: 'Valley Room', price: 2400, unit: 'night', occ: 2, extra_beds: 1, extra_bed_price: 400 });
    expect(ok.rooms[1]).toEqual({ name: 'Loft', price: 1800, unit: 'night', occ: 2, extra_beds: 2 });
    // No extra mattress: its price means nothing and is not kept.
    expect(ok.rooms[2]).toEqual({ name: 'Box', price: 900, unit: 'night', occ: 1 });
    // A room is always priced a night for the whole room: an older client's "head" is stored as "night".
    expect((profilePatchFrom('homestay', { rooms: [{ name: 'Dorm', price: 600, unit: 'head', occ: 4, extra_beds: 1, extra_bed_price: 300 }] }) as any).rooms[0])
      .toEqual({ name: 'Dorm', price: 600, unit: 'night', occ: 4, extra_beds: 1, extra_bed_price: 300 });
    expect(profilePatchFrom('homestay', { rooms: [{ name: 'X', price: 10, occ: 2, extra_beds: 3 }] })).toHaveProperty('error');
    expect(profilePatchFrom('homestay', { rooms: [{ name: 'X', price: 10, extra_beds: 1 }] })).toHaveProperty('error');
    expect(profilePatchFrom('homestay', { rooms: [{ name: 'X', price: 10, occ: 2, extra_beds: 1, extra_bed_price: 50001 }] })).toHaveProperty('error');
  });

  it('keeps a room\'s bed, bathroom and food included when each is one of its list', () => {
    const ok = profilePatchFrom('homestay', { rooms: [
      { name: 'Valley Room', price: 2400, occ: 2, bed: 'double', bath: 'attached', food: 'breakfast' },
      { name: 'Loft', price: 1800, occ: 3, bed: '', bath: null, food: 'none' },
    ] }) as any;
    expect(ok.rooms[0]).toEqual({ name: 'Valley Room', price: 2400, unit: 'night', occ: 2, bed: 'double', bath: 'attached', food: 'breakfast' });
    expect(ok.rooms[1]).toEqual({ name: 'Loft', price: 1800, unit: 'night', occ: 3, food: 'none' });
    expect(profilePatchFrom('homestay', { rooms: [{ name: 'X', price: 10, occ: 2, bed: 'king' }] })).toHaveProperty('error');
    expect(profilePatchFrom('homestay', { rooms: [{ name: 'X', price: 10, occ: 2, bath: 'outside' }] })).toHaveProperty('error');
    expect(profilePatchFrom('homestay', { rooms: [{ name: 'X', price: 10, occ: 2, food: 'lunch' }] })).toHaveProperty('error');
  });
});

describe('booking amount with a room or a quoted fare', () => {
  it('uses the room price for the nights, and a driver\'s quoted fare', () => {
    expect(bookingGrossAmount({ listingType: 'homestay', price: 1000, guests: 2, checkIn: '2026-12-01', checkOut: '2026-12-04', roomPrice: 2400 })).toBe(7200);
    expect(bookingGrossAmount({ listingType: 'homestay', price: 1000, guests: 2, checkIn: '2026-12-01', checkOut: '2026-12-04', roomPrice: null })).toBe(6000);
    expect(bookingGrossAmount({ listingType: 'driver', price: 2000, quotedFare: 7500 })).toBe(7500);
    expect(bookingGrossAmount({ listingType: 'driver', price: 2000, quotedFare: null })).toBe(2000);
  });

  it('prices a room as one price for the room (a room saved per head too) and caps people at the room size', () => {
    const r = pickRoom(ROOMS, 'family room', 3);
    expect(r.ok && r.room).toMatchObject({ name: 'Family Room', nightly: 900, occ: 5, unit: 'night' });
    const tooMany = pickRoom(ROOMS, 'Valley Room', 3);
    expect(tooMany.ok).toBe(false);
    expect(!tooMany.ok && tooMany.code).toBe('room_too_small');
    const unknown = pickRoom(ROOMS, 'Penthouse', 1);
    expect(!unknown.ok && unknown.code).toBe('bad_room');
    expect(pickRoom(ROOMS, '', 9)).toEqual({ ok: true, room: null });
  });

  it('lets a room take its extra mattress guests and charges each of them a night', () => {
    const rooms = [
      { name: 'Valley Room', price: 2400, unit: 'night', occ: 2, extra_beds: 1, extra_bed_price: 400 },
      { name: 'Free Extra', price: 2000, unit: 'night', occ: 2, extra_beds: 2 },
      { name: 'Was Per Head', price: 900, unit: 'head', occ: 2, extra_beds: 1, extra_bed_price: 400 },
      { name: 'No Extra', price: 1500, unit: 'night', occ: 2 },
    ];
    expect(pickRoom(rooms, 'Valley Room', 2)).toMatchObject({ ok: true, room: { nightly: 2400, extraGuests: 0 } });
    expect(pickRoom(rooms, 'Valley Room', 3)).toMatchObject({ ok: true, room: { nightly: 2800, extraGuests: 1 } });
    const four = pickRoom(rooms, 'Valley Room', 4);
    expect(!four.ok && four.code).toBe('room_too_small');
    expect(!four.ok && four.detail).toMatch(/sleeps 2, and up to 3 with an extra mattress/);
    expect(pickRoom(rooms, 'Free Extra', 4)).toMatchObject({ ok: true, room: { nightly: 2000, extraGuests: 2 } });
    // A room once saved per head is one price for the room now, plus the mattress.
    expect(pickRoom(rooms, 'Was Per Head', 3)).toMatchObject({ ok: true, room: { nightly: 1300 } });
    // No extra mattress set: nobody beyond what the room sleeps.
    expect(pickRoom(rooms, 'No Extra', 2)).toMatchObject({ ok: true, room: { nightly: 1500 } });
    expect(pickRoom(rooms, 'No Extra', 3)).toMatchObject({ ok: false, code: 'room_too_small' });
    // A free room with a paid mattress: the night is just the mattress, as the website shows.
    expect(pickRoom([{ name: 'Free', price: 0, unit: 'night', occ: 2, extra_beds: 1, extra_bed_price: 300 }], 'Free', 3))
      .toMatchObject({ ok: true, room: { nightly: 300 } });
  });

  it('works out a driver fare: per trip, day rate x days, else the listing price', () => {
    const listing = { price: 2000, extras: { routes: ROUTES } };
    const trip = checkDriverTrip(listing, 'NJP to Darjeeling', { days: 4 });
    expect(trip.ok && trip.value).toMatchObject({ quotedFare: 3200, days: null });
    const day = checkDriverTrip(listing, 'Darjeeling sightseeing', { days: 3 }, { checkIn: '2026-12-01', checkOut: null });
    expect(day.ok && day.value).toMatchObject({ quotedFare: 7500, days: 3, checkOut: '2026-12-03' });
    const fromDates = checkDriverTrip(listing, 'Darjeeling sightseeing', {}, { checkIn: '2026-12-01', checkOut: '2026-12-02' });
    expect(fromDates.ok && fromDates.value).toMatchObject({ quotedFare: 5000, days: 2 });
    const none = checkDriverTrip(listing, null, {});
    expect(none.ok && none.value).toMatchObject({ quotedFare: 2000, days: null });
    expect(checkDriverTrip(listing, null, { pickup_time: '25:00' })).toMatchObject({ ok: false, code: 'bad_time' });
    expect(checkDriverTrip(listing, 'Darjeeling sightseeing', { days: 31 })).toMatchObject({ ok: false, code: 'bad_days' });
    expect(checkDriverTrip(listing, null, { pickup_place: 'x'.repeat(121) })).toMatchObject({ ok: false, code: 'bad_place' });
  });

  it('calls a cancel late under 24 hours before the start (India time, pickup time when set)', () => {
    const at = new Date('2026-12-01T10:00:00+05:30');
    expect(isLateCancel({ checkIn: '2026-12-02' }, at)).toBe(true);
    expect(isLateCancel({ checkIn: '2026-12-03' }, at)).toBe(false);
    expect(isLateCancel({ checkIn: '2026-12-02', pickupTime: '11:00' }, at)).toBe(false);
    expect(isLateCancel({ checkIn: null }, at)).toBe(false);
  });
});

describe('homestay room on POST /bookings', () => {
  it('stores the room and its price, prices the booking from it, and shows it to both sides', async () => {
    const { token: hostToken } = await onboardActiveProvider({ name: 'Room Host' });
    const created = await request(app).post('/api/listings').set('Authorization', `Bearer ${hostToken}`)
      .send({ title: 'Room House', type: 'homestay', description: 'x', location: 'Darjeeling', price: 1000, extras: { rooms: ROOMS } });
    expect(created.status).toBe(200);
    const listingId = created.body.item.id;
    const { token } = await registerUser({ name: 'Room Guest' });

    const res = await book(token, { listing_id: listingId, check_in: inDays(10), check_out: inDays(13), guests: 2, room: 'Valley Room' });
    expect(res.status).toBe(200);
    expect(res.body.booking).toMatchObject({ room_name: 'Valley Room', room_price: 2400, amount: 7200 });

    const mine = await request(app).get('/api/bookings/me').set('Authorization', `Bearer ${token}`);
    expect(mine.body.items[0]).toMatchObject({ room_name: 'Valley Room', room_price: 2400 });
    const host = await request(app).get('/api/bookings/provider').set('Authorization', `Bearer ${hostToken}`);
    expect(host.body.items[0]).toMatchObject({ room_name: 'Valley Room', room_price: 2400, amount: 7200 });
  });

  it('refuses an unknown room and more people than the room sleeps', async () => {
    const listing = await createListing({ title: 'Small Rooms', type: 'homestay', extras: { rooms: ROOMS } });
    const { token } = await registerUser({ name: 'Picky Guest' });
    const bad = await book(token, { listing_id: listing.id, check_in: inDays(5), check_out: inDays(6), room: 'Penthouse' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('bad_room');
    const big = await book(token, { listing_id: listing.id, check_in: inDays(5), check_out: inDays(6), guests: 3, room: 'Valley Room' });
    expect(big.status).toBe(400);
    expect(big.body.code).toBe('room_too_small');
    const noRoom = await book(token, { listing_id: listing.id, check_in: inDays(5), check_out: inDays(6), guests: 3 });
    expect(noRoom.status).toBe(200);
    expect(noRoom.body.booking.room_name).toBeNull();
  });

  it('books a group of 3 into a room for 2 with +1 extra mattress, and adds the mattress to the amount', async () => {
    const rooms = [{ name: 'Valley Room', price: 2400, unit: 'night', occ: 2, extra_beds: 1, extra_bed_price: 400 }];
    const listing = await createListing({ title: 'Mattress House', type: 'homestay', extras: { rooms, capacity: 3 } });
    const { token } = await registerUser({ name: 'Group Of Three' });
    const three = await book(token, { listing_id: listing.id, check_in: inDays(8), check_out: inDays(10), guests: 3, room: 'Valley Room' });
    expect(three.status).toBe(200);
    // (2,400 + 400 for the third guest) x 2 nights
    expect(three.body.booking).toMatchObject({ room_name: 'Valley Room', room_price: 2800, amount: 5600 });
    const four = await book(token, { listing_id: listing.id, check_in: inDays(12), check_out: inDays(13), guests: 4, room: 'Valley Room' });
    expect(four.status).toBe(400);
  });

  it('falls back to the provider profile rooms when the listing has none of its own', async () => {
    const { token: hostToken, providerId } = await onboardActiveProvider({ name: 'Profile Rooms Host' });
    await db.update(schema.providers).set({ extras: { rooms: ROOMS } }).where(eq(schema.providers.id, providerId));
    const created = await request(app).post('/api/listings').set('Authorization', `Bearer ${hostToken}`)
      .send({ title: 'Bare Listing', type: 'homestay', description: 'x', location: 'Darjeeling', price: 800 });
    const listingId = created.body.item.id;
    await db.update(schema.listings).set({ extras: {} }).where(eq(schema.listings.id, listingId));
    const { token } = await registerUser({ name: 'Fallback Guest' });
    const res = await book(token, { listing_id: listingId, check_in: inDays(8), check_out: inDays(9), guests: 2, room: 'Attic' });
    expect(res.status).toBe(200);
    expect(res.body.booking).toMatchObject({ room_name: 'Attic', room_price: 1500, amount: 1500 });
  });
});

describe('driver trip on POST /bookings', () => {
  it('stores pickup, drop, time and days, and quotes the fare on the server', async () => {
    const { token: hostToken } = await onboardActiveProvider({ name: 'Trip Driver', businessType: 'driver' });
    const created = await request(app).post('/api/listings').set('Authorization', `Bearer ${hostToken}`)
      .send({ title: 'Trip Car', type: 'driver', description: 'x', location: 'Darjeeling', price: 2000, extras: { routes: ROUTES, seats: 4 } });
    expect(created.status).toBe(200);
    const listingId = created.body.item.id;
    const { token } = await registerUser({ name: 'Trip Guest' });

    const day = await book(token, {
      listing_id: listingId, check_in: inDays(12), route_name: 'Darjeeling sightseeing', days: 3,
      pickup_place: 'Chowrasta', drop_place: 'Tiger Hill', pickup_time: '05:30', quoted_fare: 1,
    });
    expect(day.status).toBe(200);
    expect(day.body.booking).toMatchObject({
      pickup_place: 'Chowrasta', drop_place: 'Tiger Hill', pickup_time: '05:30', days: 3, quoted_fare: 7500,
      amount: 7500, check_out: inDays(14),
    });

    const oneWay = await book(token, { listing_id: listingId, check_in: inDays(20), route_name: 'NJP to Darjeeling', days: 5 });
    expect(oneWay.body.booking).toMatchObject({ days: null, quoted_fare: 3200 });

    const host = await request(app).get('/api/bookings/provider').set('Authorization', `Bearer ${hostToken}`);
    const row = host.body.items.find((b: any) => b.id === day.body.booking.id);
    expect(row).toMatchObject({ pickup_place: 'Chowrasta', pickup_time: '05:30', days: 3, quoted_fare: 7500, amount: 7500 });
    const mine = await request(app).get('/api/bookings/me').set('Authorization', `Bearer ${token}`);
    expect(mine.body.items.find((b: any) => b.id === oneWay.body.booking.id)).toMatchObject({ quoted_fare: 3200 });
  });

  it('refuses a bad pickup time or day count', async () => {
    const listing = await createListing({ title: 'Strict Car', type: 'driver', extras: { routes: ROUTES } });
    const { token } = await registerUser({ name: 'Bad Time Guest' });
    const t = await book(token, { listing_id: listing.id, check_in: inDays(4), pickup_time: '9am' });
    expect(t.status).toBe(400);
    expect(t.body.code).toBe('bad_time');
    const d = await book(token, { listing_id: listing.id, check_in: inDays(4), route_name: 'Darjeeling sightseeing', days: 0 });
    expect(d.status).toBe(400);
    expect(d.body.code).toBe('bad_days');
  });
});

describe('GET /listings?type=driver&available_on', () => {
  it('leaves out drivers who are off or already booked that day', async () => {
    const free = await createListing({ title: 'Free Driver', type: 'driver' });
    const off = await createListing({ title: 'Off Driver', type: 'driver', extras: { available: false } });
    const busy = await createListing({ title: 'Busy Driver', type: 'driver' });
    const { token } = await registerUser({ name: 'Ride Booker' });
    const day = inDays(15);
    await createConfirmedBooking({ token, listingId: busy.id, listingType: 'driver', checkIn: inDays(14), checkOut: inDays(16) });

    const ids = async (q: string) => {
      const res = await request(app).get(`/api/listings?type=driver&limit=100${q}`);
      expect(res.status).toBe(200);
      return res.body.items.map((i: any) => i.id);
    };
    const onDay = await ids(`&available_on=${day}`);
    expect(onDay).toContain(free.id);
    expect(onDay).not.toContain(off.id);
    expect(onDay).not.toContain(busy.id);
    // Another day the busy driver is free again; without the filter everyone is listed.
    expect(await ids(`&available_on=${inDays(20)}`)).toContain(busy.id);
    expect(await ids('')).toEqual(expect.arrayContaining([free.id, off.id, busy.id]));

    const bad = await request(app).get('/api/listings?type=driver&available_on=tomorrow');
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('bad_date');
  });

  it('ignores a request still waiting for the host', async () => {
    const { token: hostToken } = await onboardActiveProvider({ name: 'Asked Driver', businessType: 'driver' });
    const created = await request(app).post('/api/listings').set('Authorization', `Bearer ${hostToken}`)
      .send({ title: 'Asked Car', type: 'driver', description: 'x', location: 'Darjeeling', price: 1500 });
    const { token } = await registerUser({ name: 'Asking Guest' });
    const asked = await book(token, { listing_id: created.body.item.id, check_in: inDays(9) });
    expect(asked.body.booking.status).toBe('pending_payment');
    const res = await request(app).get(`/api/listings?type=driver&limit=100&available_on=${inDays(9)}`);
    expect(res.body.items.map((i: any) => i.id)).toContain(created.body.item.id);
  });
});

describe('a room the host marks full', () => {
  it('keeps available:false on the profile, drops true, and refuses anything else', () => {
    const ok = profilePatchFrom('homestay', { rooms: [
      { name: 'Booked Offline', price: 2000, occ: 2, available: false },
      { name: 'Open Room', price: 1800, occ: 2, available: true },
    ] }) as any;
    expect(ok.rooms[0]).toMatchObject({ name: 'Booked Offline', available: false });
    expect(ok.rooms[1]).not.toHaveProperty('available');
    expect(profilePatchFrom('homestay', { rooms: [{ name: 'X', price: 10, available: 'no' }] })).toHaveProperty('error');
  });

  it('refuses a full room, and a request with no room when every room is full', () => {
    const rooms = [{ name: 'Valley Room', price: 2400, occ: 2, available: false }, { name: 'Attic', price: 1500, occ: 2 }];
    const full = pickRoom(rooms, 'Valley Room', 2);
    expect(full.ok).toBe(false);
    expect((full as any).code).toBe('room_full');
    expect(pickRoom(rooms, 'Attic', 2).ok).toBe(true);
    expect(pickRoom(rooms, undefined, 2)).toEqual({ ok: true, room: null });
    const allFull = pickRoom(rooms.map((r) => ({ ...r, available: false })), undefined, 2);
    expect((allFull as any).code).toBe('rooms_full');
  });

  it('refuses the booking on POST /bookings', async () => {
    const rooms = [{ name: 'Valley Room', price: 2400, unit: 'night', occ: 2, available: false }, { name: 'Attic', price: 1500, unit: 'night', occ: 2 }];
    const listing = await createListing({ title: 'Half Full House', type: 'homestay', extras: { rooms } });
    const { token } = await registerUser({ name: 'Late Guest' });
    const res = await book(token, { listing_id: listing.id, check_in: inDays(5), check_out: inDays(6), guests: 2, room: 'Valley Room' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('room_full');
    const ok = await book(token, { listing_id: listing.id, check_in: inDays(5), check_out: inDays(6), guests: 2, room: 'Attic' });
    expect(ok.status).toBe(200);
  });
});

describe('rooms belong to each property (PATCH /providers/me)', () => {
  it('saves rooms to the property asked for, the first one by default, and business fields to all', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Two Homes Host' });
    for (const title of ['Upper House', 'Lower House']) {
      const r = await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`)
        .send({ title, type: 'homestay', description: 'x', location: 'Darjeeling', price: 1000 });
      expect(r.status).toBe(200);
    }
    const listings = async () => (await db.select().from(schema.listings).where(eq(schema.listings.providerId, providerId)))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const own = await listings();
    const first = own[0];
    const last = own[own.length - 1];
    expect(first.id).not.toBe(last.id);
    const patch = (body: Record<string, unknown>) =>
      request(app).patch('/api/providers/me').set('Authorization', `Bearer ${token}`).send(body);

    const lowerRooms = [{ name: 'Garden Room', price: 3000, occ: 3 }];
    const one = await patch({ listing_id: last.id, profile: { rooms: lowerRooms, languages: ['Nepali'] } });
    expect(one.status).toBe(200);
    let now = await listings();
    expect(now.find((l) => l.id === last.id)!.extras.rooms).toEqual([{ name: 'Garden Room', price: 3000, unit: 'night', occ: 3 }]);
    expect(now.find((l) => l.id === last.id)!.price).toBe(3000);
    expect(now.find((l) => l.id === first.id)!.extras.rooms).toBeUndefined();
    for (const l of now) expect(l.extras.languages).toEqual(['Nepali']);

    const upperRooms = [{ name: 'Valley Room', price: 2400, occ: 2 }];
    expect((await patch({ profile: { rooms: upperRooms } })).status).toBe(200);
    now = await listings();
    expect(now.find((l) => l.id === first.id)!.extras.rooms[0].name).toBe('Valley Room');
    expect(now.find((l) => l.id === last.id)!.extras.rooms[0].name).toBe('Garden Room');
    expect(now.find((l) => l.id === last.id)!.price).toBe(3000);

    expect((await patch({ listing_id: 'not-mine', profile: { rooms: upperRooms } })).status).toBe(400);
  });
});
