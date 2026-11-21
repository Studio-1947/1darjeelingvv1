import { describe, it, expect } from 'vitest';
import { roomFit, roomNightly, roomsCapacity } from './roomFit';

describe('room size and extra mattress', () => {
  it('takes what the room sleeps plus up to two extra mattresses', () => {
    expect(roomFit({ occ: 2, extra_beds: 1, extra_bed_price: 400 })).toEqual({ occ: 2, extraBeds: 1, extraBedPrice: 400, max: 3 });
    expect(roomFit({ occ: 2, extra_beds: 5 }).max).toBe(4);
    // A room that never said what it sleeps has no cap, and no extra mattress.
    expect(roomFit({ extra_beds: 1, extra_bed_price: 400 })).toEqual({ occ: null, extraBeds: 0, extraBedPrice: 0, max: null });
  });

  it('charges each extra guest on a per-night room, not on a per-head one', () => {
    const room = { price: 2400, unit: 'night', occ: 2, extra_beds: 1, extra_bed_price: 400 };
    expect(roomNightly(room, 2)).toBe(2400);
    expect(roomNightly(room, 3)).toBe(2800);
    expect(roomNightly({ ...room, unit: 'head', price: 900 }, 3)).toBe(2700);
  });

  it('adds the named rooms up into the guest occupancy, only when every room says what it sleeps', () => {
    expect(roomsCapacity([
      { name: 'Valley', occ: 2, extra_beds: 1 },
      { name: 'Loft', occ: 4 },
      { name: '', occ: 9 },
    ])).toBe(7);
    // One room that never said: the rooms cannot be counted, the host's own number stands.
    expect(roomsCapacity([{ name: 'Valley', occ: 2 }, { name: 'Attic' }])).toBe(0);
    expect(roomsCapacity([])).toBe(0);
  });

  it('never charges a mattress on a per-head room', () => {
    expect(roomFit({ unit: 'head', occ: 2, extra_beds: 1, extra_bed_price: 400 }).extraBedPrice).toBe(0);
  });
});
