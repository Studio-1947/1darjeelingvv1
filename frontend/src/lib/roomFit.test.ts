import { describe, it, expect } from 'vitest';
import { roomFit, roomNightly, roomsCapacity, roomOpen, roomSpecKeys } from './roomFit';

describe('room size and extra mattress', () => {
  it('takes what the room sleeps plus up to two extra mattresses', () => {
    expect(roomFit({ occ: 2, extra_beds: 1, extra_bed_price: 400 })).toEqual({ occ: 2, extraBeds: 1, extraBedPrice: 400, max: 3 });
    expect(roomFit({ occ: 2, extra_beds: 5 }).max).toBe(4);
    // A room that never said what it sleeps has no cap, and no extra mattress.
    expect(roomFit({ extra_beds: 1, extra_bed_price: 400 })).toEqual({ occ: null, extraBeds: 0, extraBedPrice: 0, max: null });
  });

  it('prices the whole room a night and adds the mattress for each extra guest', () => {
    const room = { price: 2400, unit: 'night', occ: 2, extra_beds: 1, extra_bed_price: 400 };
    expect(roomNightly(room, 1)).toBe(2400);
    expect(roomNightly(room, 2)).toBe(2400);
    expect(roomNightly(room, 3)).toBe(2800);
    // A room once saved per head is still one price for the room.
    expect(roomNightly({ ...room, unit: 'head', price: 900 }, 3)).toBe(1300);
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

  it('takes no one beyond what the room sleeps when the host set no extra mattress', () => {
    expect(roomFit({ occ: 2 }).max).toBe(2);
    expect(roomFit({ occ: 2, extra_beds: 0, extra_bed_price: 400 })).toEqual({ occ: 2, extraBeds: 0, extraBedPrice: 0, max: 2 });
  });
});

describe('roomOpen', () => {
  it('is open unless the host switched the room off', () => {
    expect(roomOpen({ name: 'A' })).toBe(true);
    expect(roomOpen({ name: 'A', available: true })).toBe(true);
    expect(roomOpen({ name: 'A', available: false })).toBe(false);
    expect(roomOpen(null)).toBe(true);
  });
});

describe('roomSpecKeys', () => {
  it('names a room\'s bed, bathroom and food in order, and skips what is unknown or missing', () => {
    expect(roomSpecKeys({ bed: 'double', bath: 'attached', food: 'breakfast' })).toEqual(['room.bed_double', 'room.bath_attached', 'room.food_breakfast']);
    expect(roomSpecKeys({ food: 'none' })).toEqual(['room.food_none']);
    expect(roomSpecKeys({ bed: 'king', bath: '' })).toEqual([]);
    expect(roomSpecKeys(null)).toEqual([]);
  });
});
