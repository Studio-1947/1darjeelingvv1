import { describe, it, expect } from 'vitest';
import {
  DESCRIPTION_CHIPS,
  HOST_TYPES,
  PRICE_SUGGESTIONS,
  chipOn,
  cleanRef,
  descriptionLead,
  graceLeft,
  helpWhatsAppLink,
  hostJoinLink,
  isHostType,
  nearestAreaLabel,
  readHostLink,
  toggleDescriptionChip,
} from './hostQuickFill';

// The app runs the same cases (src/lib/__tests__/hostQuickFill.test.ts); keep them in step.
describe('description chips', () => {
  it('starts an empty description with the lead sentence and the chip', () => {
    const text = toggleDescriptionChip('', 'Mountain view', 'homestay', 'Ghoom, Darjeeling');
    expect(text).toBe('A homestay in Ghoom. Mountain view.');
    expect(chipOn(text, 'Mountain view')).toBe(true);
  });

  it('adds more chips after what is there and keeps typed words', () => {
    let text = 'We have three rooms.';
    text = toggleDescriptionChip(text, 'Hot water', 'homestay');
    text = toggleDescriptionChip(text, 'Parking', 'homestay');
    expect(text).toBe('We have three rooms. Hot water. Parking.');
  });

  it('takes a chip out again, and goes back to empty when only the lead is left', () => {
    let text = toggleDescriptionChip('', 'Wi-Fi', 'homestay');
    text = toggleDescriptionChip(text, 'Parking', 'homestay');
    text = toggleDescriptionChip(text, 'Wi-Fi', 'homestay');
    expect(text).toBe('A homestay in Darjeeling. Parking.');
    expect(chipOn(text, 'Wi-Fi')).toBe(false);
    expect(toggleDescriptionChip(text, 'Parking', 'homestay')).toBe('');
  });

  it('one chip is enough to pass the 10-character description rule', () => {
    for (const type of HOST_TYPES) {
      const text = toggleDescriptionChip('', DESCRIPTION_CHIPS[type][0], type);
      expect(text.trim().length).toBeGreaterThan(9);
    }
  });

  it('uses the first part of the place name in the lead', () => {
    expect(descriptionLead('driver', 'Near Ghum Railway Station, Darjeeling')).toBe('A local taxi driver in Near Ghum Railway Station.');
    expect(descriptionLead('cafe', '   ')).toBe('A cafe in Darjeeling.');
  });

  it('has chips and prices for every business type, all prices inside the allowed range', () => {
    for (const type of HOST_TYPES) {
      expect(DESCRIPTION_CHIPS[type].length).toBeGreaterThan(3);
      expect(PRICE_SUGGESTIONS[type].length).toBeGreaterThan(2);
      for (const p of PRICE_SUGGESTIONS[type]) {
        expect(Number.isInteger(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(100);
        expect(p).toBeLessThanOrEqual(100000);
      }
    }
  });
});

describe('nearest area', () => {
  it('names a place right at a landmark without "Near"', () => {
    expect(nearestAreaLabel(27.0087, 88.253)).toBe('Ghum Railway Station');
  });

  it('says "Near" a little way off', () => {
    expect(nearestAreaLabel(27.012, 88.2535)).toMatch(/^Near /);
  });

  it('gives no name far outside the hills', () => {
    expect(nearestAreaLabel(22.57, 88.36)).toBeNull(); // Kolkata
  });
});

describe('shortcut link', () => {
  it('builds the poster link with type and invite code', () => {
    expect(hostJoinLink('https://aanganerp.in/', { type: 'homestay', ref: 'ang26-ab12' }))
      .toBe('https://aanganerp.in/provider/onboard?type=homestay&ref=ANG26-AB12');
    expect(hostJoinLink('https://aanganerp.in')).toBe('https://aanganerp.in/provider/onboard');
  });

  it('drops a type it does not know and cleans the code', () => {
    expect(readHostLink({ type: 'hotel', ref: 'x<script>' })).toEqual({ type: null, ref: 'XSCRIPT' });
    expect(readHostLink({ type: 'driver', ref: undefined })).toEqual({ type: 'driver', ref: '' });
    // Up to 20: admin codes like amitAangan26 or rahulAangan2026 fit whole.
    expect(cleanRef('rahulAangan2026')).toBe('RAHULAANGAN2026');
    expect(cleanRef('ANG26-ABCDEFGHIJKLMNOPQ')).toHaveLength(20);
    expect(isHostType('guide')).toBe(true);
    expect(isHostType(42)).toBe(false);
  });
});

describe('help on WhatsApp', () => {
  it('writes the message for the team, with the country code added', () => {
    const link = helpWhatsAppLink('98320 12345', { type: 'driver', name: 'Pemba', phone: '+91 90000 11111' });
    expect(link).toMatch(/^https:\/\/wa\.me\/919832012345\?text=/);
    const text = decodeURIComponent(link!.split('text=')[1]);
    expect(text).toContain('list my taxi on aangan');
    expect(text).toContain('Name: Pemba');
    expect(text).toContain('Phone: +91 90000 11111');
  });

  it('is null without a usable number', () => {
    expect(helpWhatsAppLink(null)).toBeNull();
    expect(helpWhatsAppLink('12345')).toBeNull();
  });
});

describe('free start', () => {
  it('counts free bookings left, never below zero', () => {
    expect(graceLeft({ used: 1, limit: 3, paused: false })).toBe(2);
    expect(graceLeft({ used: 4, limit: 3, paused: true })).toBe(0);
    expect(graceLeft(null)).toBe(0);
  });
});
