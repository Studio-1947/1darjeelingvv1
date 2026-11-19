import { describe, it, expect } from 'vitest';
import { computeCompletion, ProfileInput } from '../src/lib/profileCompletion';

const richProfile: ProfileInput = {
  businessType: 'shop',
  description: 'x'.repeat(60),
  images: ['a.jpg'],
  priceFrom: 100,
  latitude: 27.0,
  longitude: 88.2,
  // A shop's pin counts once it has been captured live from the premises.
  extras: { location_verification: { source: 'live_capture' } },
};

/** Every document a shop has to have approved, in one list so the tests agree on it. */
const SHOP_DOCS = ['aadhaar', 'premises_photo_front'];

describe('computeCompletion', () => {
  it('empty shop profile with no docs is 0% and kycStatus none', () => {
    const r = computeCompletion(
      { businessType: 'shop', description: '', images: [], priceFrom: 0, latitude: null, longitude: null },
      []
    );
    expect(r.completionPercent).toBe(0);
    expect(r.kycStatus).toBe('none');
  });

  it('rich profile with no KYC gives the profile portion (40%)', () => {
    const r = computeCompletion(richProfile, []);
    expect(r.completionPercent).toBe(40);
    expect(r.kycStatus).toBe('none');
  });

  it('rich profile with all required shop docs approved is 100% and verified', () => {
    const docs = SHOP_DOCS.map((docType) => ({ docType, status: 'approved' as const }));
    const r = computeCompletion(richProfile, docs);
    expect(r.completionPercent).toBe(100);
    expect(r.kycStatus).toBe('verified');
  });

  it('all required docs uploaded but pending is submitted, not verified', () => {
    const docs = SHOP_DOCS.map((docType) => ({ docType, status: 'pending' as const }));
    const r = computeCompletion(richProfile, docs);
    expect(r.kycStatus).toBe('submitted');
    // pending docs do not fill the KYC portion
    expect(r.completionPercent).toBe(40);
    const aadhaar = r.checklist.find(c => c.key === 'aadhaar');
    expect(aadhaar?.state).toBe('in_review');
  });

  it('some docs present is partial; rejected surfaces as rejected state', () => {
    const docs = [{ docType: 'aadhaar', status: 'rejected' as const }];
    const r = computeCompletion(richProfile, docs);
    expect(r.kycStatus).toBe('partial');
    expect(r.checklist.find(c => c.key === 'aadhaar')?.state).toBe('rejected');
  });

  it('documents of a type no longer asked for neither help nor hold anything up', () => {
    // A host who sent some of the old, longer list before it was shortened.
    const legacy = [
      { docType: 'pan', status: 'rejected' as const },
      { docType: 'trade_license', status: 'pending' as const },
    ];
    const done = computeCompletion(richProfile, [...SHOP_DOCS.map((docType) => ({ docType, status: 'approved' as const })), ...legacy]);
    expect(done.completionPercent).toBe(100);
    expect(done.kycStatus).toBe('verified');
    expect(done.checklist.some((c) => c.key === 'pan' || c.key === 'trade_license')).toBe(false);

    const onlyLegacy = computeCompletion(richProfile, [{ docType: 'pan', status: 'approved' as const }]);
    expect(onlyLegacy.completionPercent).toBe(40);
    expect(onlyLegacy.kycStatus).not.toBe('verified');
  });

  it('a homestay is fully verified with its photo ID, front photo and registration papers approved (and its pin)', () => {
    const home: ProfileInput = { ...richProfile, businessType: 'homestay', extras: { location_verification: { source: 'google_maps_link' } } };
    const r = computeCompletion(home, [
      { docType: 'aadhaar', status: 'approved' },
      { docType: 'property_photo_front', status: 'approved' },
      { docType: 'tourism_registration', status: 'approved' },
    ]);
    expect(r.kycStatus).toBe('verified');
    expect(r.completionPercent).toBe(100);
    expect(r.checklist.filter((c) => c.kind === 'kyc').map((c) => c.key)).toEqual(['aadhaar', 'property_photo_front', 'tourism_registration']);
  });

  it('marks photos and description done when present in extras or listings', () => {
    const r = computeCompletion(
      {
        businessType: 'homestay',
        description: '',
        images: [],
        priceFrom: 500,
        latitude: 27.0,
        longitude: 88.2,
        extras: { images: ['gallery1.jpg'], host_bio: 'A lovely homestay nestled in Darjeeling hills' },
      },
      []
    );
    expect(r.checklist.find(c => c.key === 'photos')?.state).toBe('done');
    expect(r.checklist.find(c => c.key === 'description')?.state).toBe('done');
  });

  it('omits the map-pin item for drivers, who are never offered a location picker', () => {
    const driver: ProfileInput = {
      businessType: 'driver',
      description: 'x'.repeat(60),
      images: ['a.jpg'],
      priceFrom: 2500,
      latitude: null,
      longitude: null,
    };
    const r = computeCompletion(driver, []);
    expect(r.checklist.find(c => c.key === 'location')).toBeUndefined();
    // Without the unreachable item, the three real checks are the whole
    // profile portion, so a complete driver profile scores the full 40%.
    expect(r.completionPercent).toBe(40);
  });

  it('keeps the location item for non-driver types', () => {
    const r = computeCompletion({ ...richProfile, extras: {}, latitude: null, longitude: null }, []);
    expect(r.checklist.find(c => c.key === 'location')?.state).toBe('missing');
    expect(r.completionPercent).toBe(30);
  });

  it('a shop location is only done once captured live, not by a pasted Google Maps pin', () => {
    const viaLink = computeCompletion(
      { ...richProfile, extras: { location_verification: { source: 'google_maps_link' } } },
      []
    );
    const item = viaLink.checklist.find(c => c.key === 'location');
    expect(item?.state).toBe('missing');
    expect(item?.action).toBe('live_capture');

    const live = computeCompletion(richProfile, []);
    expect(live.checklist.find(c => c.key === 'location')?.state).toBe('done');
  });

  it('a shop with every document approved is partial, not verified, until its location is captured live', () => {
    const docs = SHOP_DOCS.map((docType) => ({ docType, status: 'approved' as const }));
    const noPin = computeCompletion({ ...richProfile, extras: {} }, docs);
    expect(noPin.kycStatus).toBe('partial');
    expect(computeCompletion(richProfile, docs).kycStatus).toBe('verified');
  });

  it('a homestay accepts a Google Maps link, from the provider or from a listing', () => {
    const home = { ...richProfile, businessType: 'homestay', extras: {} };
    const homeItem = (p: ProfileInput) => computeCompletion(p, []).checklist.find(c => c.key === 'location');
    expect(homeItem(home)?.state).toBe('missing');
    expect(homeItem(home)?.action).toBe('maps_link');
    expect(homeItem({ ...home, extras: { location_verification: { source: 'google_maps_link' } } })?.state).toBe('done');
    expect(homeItem({ ...home, listingLocationSources: ['google_maps_link'] })?.state).toBe('done');
  });
});
