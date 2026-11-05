import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';

/**
 * With host approval, a booking only moves when the host presses Accept and then the guest
 * confirms. Both of those people used to hear about it only inside the app (and the push copy
 * only reaches the mobile app), so a website host never knew a request was waiting.
 * Now the request reaches the host, and the host's yes reaches the guest, by WhatsApp.
 */

const sent: Array<{ phone: string; template: string; vars: Record<string, string>; text: string }> = [];
vi.mock('../src/messaging', async (orig) => ({
  ...(await orig<typeof import('../src/messaging')>()),
  sendNotification: vi.fn(async (msg: any) => { sent.push(msg); return { ref: 'test', channel: 'whatsapp' }; }),
}));

let app: any;
let helpers: typeof import('./helpers');
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeAll(async () => {
  vi.stubEnv('NOTIFY_BOOKINGS', 'true');
  vi.resetModules();
  app = (await import('../src/app')).app;
  helpers = await import('./helpers');
});

const settle = () => new Promise((r) => setTimeout(r, 300)); // the sends are not awaited by the route

describe('request and acceptance reach people outside the app', () => {
  it('messages the host about a new request, and the guest when the host accepts', async () => {
    const { token: hostToken, providerId } = await helpers.onboardActiveProvider({ name: 'Notify Host' });
    const admin = await helpers.loginAdmin();
    const listing = (await request(app).post('/api/listings').set(auth(admin)).send({
      title: 'Notify Homestay', type: 'homestay', description: 'x', location: 'Darjeeling', price: 1500, provider_id: providerId,
    })).body.item;
    const { token: guest } = await helpers.registerUser({ name: 'Notify Guest' });

    sent.length = 0;
    const made = await request(app).post('/api/bookings').set(auth(guest)).send({
      listing_id: listing.id, listing_type: 'homestay', check_in: '2032-05-01', check_out: '2032-05-03',
    });
    expect(made.body.booking.awaiting_host).toBe(true);
    await settle();
    const toHost = sent.filter((m) => m.template === 'booking_request_host');
    expect(toHost.length).toBeGreaterThan(0);
    // Positional contract with the approved template: listing, guest, stay.
    expect(Object.keys(toHost[0].vars)).toEqual(['listing', 'guest', 'stay']);
    expect(toHost[0].vars).toMatchObject({ listing: 'Notify Homestay', guest: 'Notify Guest', stay: '2032-05-01 to 2032-05-03' });

    sent.length = 0;
    const ok = await request(app).patch(`/api/bookings/${made.body.booking.id}/confirm`).set(auth(hostToken));
    expect(ok.body.booking.status).toBe('accepted');
    await settle();
    const toGuest = sent.filter((m) => m.template === 'booking_accepted_guest');
    expect(toGuest).toHaveLength(1);
    expect(Object.keys(toGuest[0].vars)).toEqual(['name', 'listing', 'stay']);
    expect(toGuest[0].vars.name).toBe('Notify Guest');
  });

  it('sends nothing to a host for a team-run listing, which confirms at once', async () => {
    const listing = await helpers.createListing({ title: 'Team Spot Notify' });
    const { token: guest } = await helpers.registerUser({ name: 'Spot Notify Guest' });
    sent.length = 0;
    await request(app).post('/api/bookings').set(auth(guest)).send({ listing_id: listing.id, listing_type: listing.type, check_in: '2032-05-01' });
    await settle();
    expect(sent.filter((m) => m.template === 'booking_request_host')).toHaveLength(0);
  });
});
