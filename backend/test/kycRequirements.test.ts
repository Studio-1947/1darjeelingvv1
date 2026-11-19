import { describe, it, expect } from 'vitest';
import {
  requirementsFor,
  isAllowedDocType,
  requiredDocTypes,
  isVideoDocType,
  requiresLocationVerification,
  locationMethodFor,
} from '../src/lib/kycRequirements';

// The short list the Aangan 2.0 prototype asks for (provider.js DOCS): a photo ID and one photo.
describe('kycRequirements', () => {
  it('asks each type for exactly the prototype documents, all of them required', () => {
    expect(requiredDocTypes('homestay')).toEqual(['aadhaar', 'property_photo_front']);
    expect(requiredDocTypes('driver')).toEqual(['aadhaar', 'driving_license', 'driver_vehicle_photo']);
    expect(requiredDocTypes('guide')).toEqual(['aadhaar', 'owner_photo']);
    expect(requiredDocTypes('cafe')).toEqual(['aadhaar', 'premises_photo_front']);
    expect(requiredDocTypes('shop')).toEqual(['aadhaar', 'premises_photo_front']);
    for (const type of ['homestay', 'driver', 'guide', 'cafe', 'shop']) {
      expect(requirementsFor(type).every((r) => r.required)).toBe(true);
    }
  });

  it('the ID row takes any photo ID, not only Aadhaar', () => {
    for (const type of ['homestay', 'driver', 'guide', 'cafe', 'shop']) {
      expect(requirementsFor(type).find((r) => r.docType === 'aadhaar')?.label).toBe('Aadhaar or any photo ID');
    }
  });

  it('no longer asks for PAN, certificates, licences, room photos, videos or GST', () => {
    const dropped: Record<string, string[]> = {
      homestay: ['pan', 'owner_photo', 'property_proof', 'tourism_registration', 'property_photo_room', 'property_video', 'gst_certificate'],
      driver: ['vehicle_rc', 'driver_vehicle_video', 'pollution_certificate', 'vehicle_insurance'],
      guide: ['guide_licence'],
      cafe: ['pan', 'owner_photo', 'fssai_license', 'trade_license', 'premises_photo_inside', 'premises_video', 'gst_certificate'],
      shop: ['pan', 'owner_photo', 'trade_license', 'premises_photo_inside', 'premises_video', 'fssai_license', 'gst_certificate'],
    };
    for (const [type, docs] of Object.entries(dropped)) {
      for (const doc of docs) expect(isAllowedDocType(type, doc)).toBe(false);
    }
  });

  it('no document is a video any more', () => {
    for (const type of ['homestay', 'driver', 'guide', 'cafe', 'shop']) {
      expect(requirementsFor(type).some((r) => isVideoDocType(type, r.docType))).toBe(false);
    }
  });

  it('a homestay confirms its pin with Google Maps, a cafe or shop captures it live, a driver neither', () => {
    expect(locationMethodFor('homestay')).toBe('maps_link');
    expect(locationMethodFor('cafe')).toBe('live_capture');
    expect(locationMethodFor('shop')).toBe('live_capture');
    expect(locationMethodFor('driver')).toBeNull();
    expect(requiresLocationVerification('homestay')).toBe(true);
    expect(requiresLocationVerification('driver')).toBe(false);
  });

  it('rejects a docType not allowed for the type', () => {
    expect(isAllowedDocType('cafe', 'driving_license')).toBe(false);
    expect(isAllowedDocType('homestay', 'premises_photo_front')).toBe(false);
    expect(isAllowedDocType('shop', 'property_photo_front')).toBe(false);
  });

  it('returns empty requirements for non-onboardable types', () => {
    expect(requirementsFor('spot')).toEqual([]);
    expect(requiredDocTypes('event')).toEqual([]);
  });
});
