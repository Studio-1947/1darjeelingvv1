import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { REQUEST_EXPIRY_HOURS } from '../src/config';
import { coverAfterPhotosChange, listingCover } from '../src/lib/listingCover';
import { registerUser, onboardActiveProvider, createConfirmedBooking, inDays, loginAdmin } from './helpers';

// Persona test 2026-11-09: hosts' own photos were not used as the card picture, and a confirmed
// trip in My Trips carried no way to reach the host.

describe('listing cover', () => {
  it('uses the chosen cover, otherwise the first uploaded photo', () => {
    expect(listingCover('https://x/cover.png', { images: ['https://x/1.png'] })).toBe('https://x/cover.png');
    expect(listingCover('', { images: ['', 'https://x/1.png'] })).toBe('https://x/1.png');
    expect(listingCover(null, {})).toBe('');
  });

  it('follows the first photo only when the cover came from the photos', () => {
    // Derived cover: follows the new first photo.
    expect(coverAfterPhotosChange('https://x/1.png', { images: ['https://x/1.png'] }, { images: ['https://x/2.png'] })).toBe('https://x/2.png');
    // Empty cover: takes the first photo.
    expect(coverAfterPhotosChange('', {}, { images: ['https://x/2.png'] })).toBe('https://x/2.png');
    // A cover set some other way is kept.
    expect(coverAfterPhotosChange('https://x/own.png', { images: ['https://x/1.png'] }, { images: ['https://x/2.png'] })).toBe('https://x/own.png');
  });

  it('is set from the photos when a listing is created without one', async () => {
    const { token } = await onboardActiveProvider({ name: 'Cover Host' });
    const res = await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`).send({
      title: 'Cover Stay', type: 'homestay', description: 'A room with a view', location: 'Darjeeling', price: 1500,
      extras: { images: ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg'] },
    });
    expect(res.status).toBe(200);
    expect(res.body.item.image).toBe('https://cdn.example.com/a.jpg');
  });
});

describe('GET /bookings/me host contact', () => {
  it('carries the host contact and stay total on a confirmed booking only', async () => {
    const { token: host, phone } = await onboardActiveProvider({ name: 'Contact Host' });
    const created = await request(app).post('/api/listings').set('Authorization', `Bearer ${host}`).send({
      title: 'Contact Stay', type: 'homestay', description: 'A room with a view', location: 'Ghum, Darjeeling', price: 1500,
    });
    const listingId = created.body.item.id as string;
    const { token: guest } = await registerUser({ name: 'Contact Guest' });
    const confirmedId = await createConfirmedBooking({ token: guest, listingId, listingType: 'homestay', checkIn: inDays(30), checkOut: inDays(32) });

    // A second request that is still waiting for the host.
    const pending = await request(app).post('/api/bookings').set('Authorization', `Bearer ${guest}`)
      .send({ listing_id: listingId, listing_type: 'homestay', check_in: inDays(60), check_out: inDays(61) });
    expect(pending.status).toBe(200);

    const me = await request(app).get('/api/bookings/me').set('Authorization', `Bearer ${guest}`);
    expect(me.status).toBe(200);
    const confirmed = me.body.items.find((b: any) => b.id === confirmedId);
    expect(confirmed.host_contact.phone).toBe(phone);
    expect(confirmed.host_contact.whatsapp).toBeTruthy();
    expect(confirmed.host_contact.address).toBeTruthy();
    expect(confirmed.amount_due).toBe(1500 * 1 * 2);

    const waiting = me.body.items.find((b: any) => b.id === pending.body.booking.id);
    expect(waiting.host_contact).toBeNull();
    expect(waiting.amount_due).toBeNull();
  });
});

describe('rest of the persona gaps', () => {
  it('lets a cafe set opening hours, and caps their length', async () => {
    const { token } = await onboardActiveProvider({ name: 'Hours Cafe', businessType: 'cafe' });
    const ok = await request(app).patch('/api/providers/me').set('Authorization', `Bearer ${token}`)
      .send({ profile: { opening_hours: '8 am - 9 pm, closed Tuesday' } });
    expect(ok.status).toBe(200);
    expect(ok.body.provider.extras.opening_hours).toBe('8 am - 9 pm, closed Tuesday');
    const long = await request(app).patch('/api/providers/me').set('Authorization', `Bearer ${token}`)
      .send({ profile: { opening_hours: 'x'.repeat(121) } });
    expect(long.status).toBe(400);
  });

  it('tells the guest their request went out', async () => {
    const { token: host } = await onboardActiveProvider({ name: 'Notice Host' });
    const created = await request(app).post('/api/listings').set('Authorization', `Bearer ${host}`).send({
      title: 'Notice Stay', type: 'homestay', description: 'A room with a view', location: 'Darjeeling', price: 1500,
    });
    const { token: guest } = await registerUser({ name: 'Notice Guest' });
    const res = await request(app).post('/api/bookings').set('Authorization', `Bearer ${guest}`)
      .send({ listing_id: created.body.item.id, listing_type: 'homestay', check_in: inDays(40), check_out: inDays(41) });
    expect(res.status).toBe(200);
    expect(res.body.booking.awaiting_host).toBe(true);
    await new Promise((r) => setTimeout(r, 200)); // the notice is written without holding the reply
    const notes = await request(app).get('/api/notifications').set('Authorization', `Bearer ${guest}`);
    const items = notes.body.items || notes.body.notifications || [];
    expect(items.some((n: any) => n.kind === 'booking_requested' && n.title === 'Request sent')).toBe(true);
    // Carries the message key and details so the website/app can show it in other languages.
    const sentNote = items.find((n: any) => n.kind === 'booking_requested');
    expect(sentNote.msg).toEqual({ key: 'request_sent', params: { place: 'Notice Stay', hours: REQUEST_EXPIRY_HOURS } });
  });

  it('a booking problem reaches the team with the booking, and the team can cancel it', async () => {
    const { token: host } = await onboardActiveProvider({ name: 'Problem Host' });
    const created = await request(app).post('/api/listings').set('Authorization', `Bearer ${host}`).send({
      title: 'Problem Stay', type: 'homestay', description: 'A room with a view', location: 'Darjeeling', price: 1500,
    });
    const { token: guest } = await registerUser({ name: 'Problem Guest' });
    const bookingId = await createConfirmedBooking({ token: guest, listingId: created.body.item.id, listingType: 'homestay', checkIn: inDays(20), checkOut: inDays(21) });
    const sent = await request(app).post('/api/feedback/aangan').set('Authorization', `Bearer ${guest}`)
      .send({ message: 'Problem with this booking: the host does not answer', booking_id: bookingId });
    expect(sent.status).toBe(201);

    const admin = await loginAdmin();
    const list = await request(app).get('/api/feedback/aangan/all').set('Authorization', `Bearer ${admin}`);
    const item = list.body.items.find((f: any) => f.booking?.id === bookingId);
    expect(item.booking.status).toBe('confirmed');

    const cancel = await request(app).patch(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${admin}`);
    expect(cancel.status).toBe(200);
    const notes = await request(app).get('/api/notifications').set('Authorization', `Bearer ${guest}`);
    const items = notes.body.items || notes.body.notifications || [];
    expect(items.some((n: any) => n.kind === 'booking_cancelled' && /aangan team/.test(n.body))).toBe(true);
  });
});
