import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * The positional contract between this app and its approved message templates.
 *
 * Meta (and MSG91's DLT templates before it) fill {{1}}, {{2}}, ... strictly by position, from
 * the ORDER of the keys in the `vars` object built here. Nothing at runtime checks that the
 * order matches the template that was approved — a mismatch sends successfully with the values
 * in the wrong slots, so a host reads "New booking at Asha Rai" and no error appears anywhere.
 *
 * That makes key order load-bearing in a way it normally is not, and invisible to every other
 * test. This file is the guard. If you change an order here, change the template body in
 * docs/WHATSAPP_TEMPLATES.md too — and remember an approved template goes back for review.
 */

const recorded: Array<{ phone: string; template: string; vars: Record<string, string>; text: string }> = [];

vi.mock('../src/messaging', () => ({
  sendNotification: vi.fn(async (msg: any) => {
    recorded.push(msg);
    return { ref: 'test-ref', channel: 'whatsapp' };
  }),
  sendOtp: vi.fn(async () => ({ ref: 'test-ref', channel: 'whatsapp' })),
}));

let notifyBookingConfirmed: typeof import('../src/lib/notifications').notifyBookingConfirmed;
let notifyBookingCancelled: typeof import('../src/lib/notifications').notifyBookingCancelled;
let pool: { end: () => Promise<void> };

// Only the fields the notification code actually reads. The db.update() calls these functions
// make target an id that does not exist, which affects zero rows and is exactly what we want:
// this is about the message, not the bookkeeping around it.
const booking = (over: Record<string, unknown> = {}) =>
  ({
    id: 'bkg-notification-vars-test',
    listingTitle: 'Peak View Homestay',
    checkIn: '2026-09-01',
    checkOut: '2026-09-03',
    guests: 3,
    ...over,
  }) as any;

beforeAll(async () => {
  vi.stubEnv('NOTIFY_BOOKINGS', 'true');
  vi.resetModules();

  const mod = await import('../src/lib/notifications');
  notifyBookingConfirmed = mod.notifyBookingConfirmed;
  notifyBookingCancelled = mod.notifyBookingCancelled;
  pool = (await import('../src/db')).pool;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  // The dynamic import above opened a second pool onto the same database; the static one from
  // test/setup.ts closes itself.
  await pool.end();
});

function latest(template: string) {
  const hit = [...recorded].reverse().find((m) => m.template === template);
  if (!hit) throw new Error(`no ${template} message was sent`);
  return hit;
}

describe('booking_confirmed_guest', () => {
  it('passes name, listing, stay, host — in that order', async () => {
    recorded.length = 0;
    await notifyBookingConfirmed({
      booking: booking(),
      guestName: 'Asha Rai',
      guestPhone: '+919876543210',
      hostName: 'Tenzing Bhutia',
      hostPhone: '+919812345678',
    });

    const msg = latest('booking_confirmed_guest');
    expect(Object.keys(msg.vars)).toEqual(['name', 'listing', 'stay', 'host']);
    expect(Object.values(msg.vars)).toEqual([
      'Asha Rai',
      'Peak View Homestay',
      '2026-09-01 to 2026-09-03',
      'Host: Tenzing Bhutia, +919812345678.',
    ]);
  });

  it('still fills the host slot with a whole sentence when the listing has no owner', async () => {
    // {{4}} is a sentence, not a name — the template must give it its own line and add no
    // punctuation of its own, because both branches already end in a full stop.
    recorded.length = 0;
    await notifyBookingConfirmed({
      booking: booking(),
      guestName: 'Asha Rai',
      guestPhone: '+919876543210',
      hostName: null,
      hostPhone: null,
    });

    expect(latest('booking_confirmed_guest').vars.host).toBe('The host will contact you.');
  });
});

describe('booking_confirmed_host', () => {
  it('passes listing, guest, guest_phone, stay, guests — a different order from the guest message', async () => {
    recorded.length = 0;
    await notifyBookingConfirmed({
      booking: booking(),
      guestName: 'Asha Rai',
      guestPhone: '+919876543210',
      hostName: 'Tenzing Bhutia',
      hostPhone: '+919812345678',
    });

    const msg = latest('booking_confirmed_host');
    expect(Object.keys(msg.vars)).toEqual(['listing', 'guest', 'guest_phone', 'stay', 'guests']);
    expect(msg.vars.guests).toBe('3');
  });
});

describe('booking_cancelled_guest', () => {
  it('passes name, listing, stay, refund — in that order', async () => {
    recorded.length = 0;
    await notifyBookingCancelled(booking(), '+919876543210', 'Asha Rai', true);

    const msg = latest('booking_cancelled_guest');
    expect(Object.keys(msg.vars)).toEqual(['name', 'listing', 'stay', 'refund']);
    expect(msg.vars.refund).toMatch(/refunded/);
  });

  it('says something different, but still complete, when no refund went through', async () => {
    recorded.length = 0;
    await notifyBookingCancelled(booking(), '+919876543210', 'Asha Rai', false);

    expect(latest('booking_cancelled_guest').vars.refund).toBe(
      'If you were charged, our team will contact you about the refund.'
    );
  });
});

describe('the stay phrase reads correctly in the sentence it lands in', () => {
  // Every call site says "for {stay}", so the value must be a bare noun phrase. It used to carry
  // its own "on", which produced "confirmed for on a date to be arranged" for taxi bookings —
  // harmless-looking until it is frozen into an approved template.
  it('renders a full range', async () => {
    recorded.length = 0;
    await notifyBookingCancelled(booking(), '+919876543210', 'Asha', true);
    expect(latest('booking_cancelled_guest').vars.stay).toBe('2026-09-01 to 2026-09-03');
  });

  it('renders a single date with no leading preposition', async () => {
    recorded.length = 0;
    await notifyBookingCancelled(booking({ checkOut: null }), '+919876543210', 'Asha', true);
    expect(latest('booking_cancelled_guest').vars.stay).toBe('2026-09-01');
  });

  it('renders a dateless booking as a phrase that completes "for ..."', async () => {
    recorded.length = 0;
    await notifyBookingCancelled(booking({ checkIn: null, checkOut: null }), '+919876543210', 'Asha', true);

    const stay = latest('booking_cancelled_guest').vars.stay;
    expect(stay).toBe('a date to be arranged');
    expect(`Your booking for ${stay} has been cancelled.`).toBe(
      'Your booking for a date to be arranged has been cancelled.'
    );
  });
});
