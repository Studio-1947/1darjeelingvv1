import { describe, it, expect } from 'vitest';
import {
  requirementsFor,
  isAllowedDocType,
  requiredDocTypes,
} from '../src/lib/kycRequirements';

describe('kycRequirements', () => {
  it('driver requires 6 documents', () => {
    expect(requiredDocTypes('driver').sort()).toEqual(
      ['aadhaar', 'commercial_permit', 'driving_license', 'owner_photo', 'pan', 'vehicle_rc'].sort()
    );
  });

  it('homestay has tourism_registration required and gst_certificate optional', () => {
    const reqs = requirementsFor('homestay');
    expect(reqs.find(r => r.docType === 'tourism_registration')?.required).toBe(true);
    expect(reqs.find(r => r.docType === 'gst_certificate')?.required).toBe(false);
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
