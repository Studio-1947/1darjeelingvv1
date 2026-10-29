import { describe, it, expect } from 'vitest';
import { EXAMPLES } from '../scripts/notify-test';

// The test script must send values in the same slot order as the real messages
// (pinned for those in notificationVars.test.ts), or a template that "works" in testing would
// still put a phone number where the name belongs once bookings use it.
describe('npm run notify:test examples', () => {
  it('fill every template in the order the real notifications do', () => {
    expect(Object.keys(EXAMPLES.booking_confirmed_guest.vars)).toEqual(['name', 'listing', 'stay', 'host']);
    expect(Object.keys(EXAMPLES.booking_confirmed_host.vars)).toEqual(['listing', 'guest', 'guest_phone', 'stay', 'guests']);
    expect(Object.keys(EXAMPLES.booking_cancelled_guest.vars)).toEqual(['name', 'listing', 'stay', 'refund']);
  });
});
