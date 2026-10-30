import { describe, it, expect } from 'vitest';
import {
  requirementsFor,
  isAllowedDocType,
  requiredDocTypes,
  isVideoDocType,
  requiresLocationVerification,
  locationMethodFor,
} from '../src/lib/kycRequirements';

describe('kycRequirements', () => {
  it('driver requires Aadhaar, licence, RC, a vehicle selfie and a vehicle video', () => {
    expect(requiredDocTypes('driver').sort()).toEqual(
      ['aadhaar', 'driver_vehicle_photo', 'driver_vehicle_video', 'driving_license', 'vehicle_rc'].sort()
    );
  });

  it('driver pollution certificate and insurance are optional, PAN is not asked for', () => {
    const reqs = requirementsFor('driver');
    expect(reqs.find(r => r.docType === 'pollution_certificate')?.required).toBe(false);
    expect(reqs.find(r => r.docType === 'vehicle_insurance')?.required).toBe(false);
    expect(isAllowedDocType('driver', 'pan')).toBe(false);
  });

  it('homestay has tourism_registration required and gst_certificate optional', () => {
    const reqs = requirementsFor('homestay');
    expect(reqs.find(r => r.docType === 'tourism_registration')?.required).toBe(true);
    expect(reqs.find(r => r.docType === 'gst_certificate')?.required).toBe(false);
  });

  it('homestay needs the registration certificate, a selfie at the property, property photos and a video', () => {
    expect(requiredDocTypes('homestay').sort()).toEqual(
      [
        'aadhaar',
        'pan',
        'owner_photo',
        'property_proof',
        'tourism_registration',
        'property_photo_front',
        'property_photo_room',
        'property_video',
      ].sort()
    );
    expect(isVideoDocType('homestay', 'property_video')).toBe(true);
    expect(isVideoDocType('homestay', 'property_photo_front')).toBe(false);
    // The selfie keeps its old doc type so existing uploads still count, but now says where.
    expect(requirementsFor('homestay').find(r => r.docType === 'owner_photo')?.label).toMatch(/property/i);
  });

  it('a homestay confirms its pin with Google Maps, a cafe or shop captures it live, a driver neither', () => {
    expect(locationMethodFor('homestay')).toBe('maps_link');
    expect(locationMethodFor('cafe')).toBe('live_capture');
    expect(locationMethodFor('shop')).toBe('live_capture');
    expect(locationMethodFor('driver')).toBeNull();
    expect(requiresLocationVerification('homestay')).toBe(true);
    expect(requiresLocationVerification('driver')).toBe(false);
  });

  it('a cafe or shop needs the trade licence, a selfie at the premises, photos and a video', () => {
    for (const type of ['cafe', 'shop']) {
      const required = requiredDocTypes(type);
      for (const doc of ['trade_license', 'owner_photo', 'premises_photo_front', 'premises_photo_inside', 'premises_video']) {
        expect(required).toContain(doc);
      }
      expect(isVideoDocType(type, 'premises_video')).toBe(true);
      expect(requirementsFor(type).find(r => r.docType === 'owner_photo')?.label).toMatch(/premises|shop|caf/i);
    }
    // FSSAI stays required for a cafe and optional for a shop; the premises documents are not for homestays.
    expect(requiredDocTypes('cafe')).toContain('fssai_license');
    expect(requiredDocTypes('shop')).not.toContain('fssai_license');
    expect(isAllowedDocType('homestay', 'premises_video')).toBe(false);
  });

  it('the property documents are not asked of other businesses', () => {
    for (const other of ['driver', 'cafe', 'shop']) {
      expect(isAllowedDocType(other, 'property_video')).toBe(false);
      expect(isAllowedDocType(other, 'property_photo_front')).toBe(false);
    }
  });

  it('shop requires trade_license but fssai_license is optional', () => {
    expect(requiredDocTypes('shop')).toContain('trade_license');
    expect(requiredDocTypes('shop')).not.toContain('fssai_license');
    expect(isAllowedDocType('shop', 'fssai_license')).toBe(true);
  });

  it('rejects a docType not allowed for the type', () => {
    expect(isAllowedDocType('cafe', 'driving_license')).toBe(false);
  });

  it('returns empty requirements for non-onboardable types', () => {
    expect(requirementsFor('spot')).toEqual([]);
    expect(requiredDocTypes('event')).toEqual([]);
  });
});
