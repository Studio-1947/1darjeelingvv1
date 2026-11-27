import { describe, expect, it } from 'vitest';
import { kindsOf, listingTypeFields, missingAcross, profilePatchForKinds } from '../src/lib/hostProfile';

describe('a listing keeps its own kind\'s details (decision 2026-11-26)', () => {
  it('checks and cleans a car\'s numbers on a driver listing', () => {
    const out = listingTypeFields('driver', { vehicle_number: 'wb74a1234', license_number: 'wb7420110012345' }, {});
    expect(out).not.toHaveProperty('error');
    expect((out as any).license_number).toBe('WB7420110012345');
    expect(listingTypeFields('driver', { vehicle_number: 'not a plate' }, {})).toHaveProperty('error');
  });

  it('checks a guide\'s kinds and seasons', () => {
    expect(listingTypeFields('guide', { guide_types: ['trekking'], seasons: ['spring'] }, {})).toEqual({ guide_types: ['trekking'], seasons: ['spring'] });
  });

  it('leaves unchanged values and other kinds alone', () => {
    expect(listingTypeFields('driver', { vehicle_number: 'old junk' }, { vehicle_number: 'old junk' })).toEqual({});
    expect(listingTypeFields('homestay', { vehicle_number: 'x' }, {})).toEqual({});
  });
});

describe('no kind is the main one: a business is judged on every listing', () => {
  const car = { id: 'c1', title: 'My Sumo', type: 'driver', extras: { images: ['a'] } };
  const stay = { id: 's1', title: 'Hill View', type: 'homestay', extras: { images: Array(8).fill('p') } };

  it("a driver business that also lists a homestay is asked for the host's name and the car's photos", () => {
    const out = missingAcross('driver', {}, [car, stay]);
    expect(out.map((m) => m.key)).toEqual(['host_name', 'images']);
    expect(out[1]).toMatchObject({ listing_id: 'c1', listing_title: 'My Sumo' });
  });

  it('a name on the business or any listing counts once', () => {
    expect(missingAcross('driver', { host_name: 'Pema' }, [car, stay]).map((m) => m.key)).toEqual(['images']);
  });

  it("with no listings yet, the sign-up kind's items", () => {
    expect(missingAcross('homestay', {}, []).map((m) => m.key)).toEqual(['host_name', 'images']);
  });

  it('a field is checked by any kind the business runs', () => {
    const kinds = kindsOf('driver', ['driver', 'homestay']);
    expect(kinds).toEqual(['driver', 'homestay']);
    expect(profilePatchForKinds(kinds, { host_name: ' Pema ' })).toEqual({ host_name: 'Pema' });
    expect(profilePatchForKinds(['driver'], { host_name: 'Pema' })).toHaveProperty('error');
  });
});

