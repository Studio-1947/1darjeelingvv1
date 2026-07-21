import { describe, it, expect } from 'vitest';
import { computeCompletion, ProfileInput } from '../src/lib/profileCompletion';

const richProfile: ProfileInput = {
  businessType: 'shop',
  description: 'x'.repeat(60),
  images: ['a.jpg'],
  priceFrom: 100,
  latitude: 27.0,
  longitude: 88.2,
};

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
    const docs = [
      { docType: 'aadhaar', status: 'approved' as const },
      { docType: 'pan', status: 'approved' as const },
      { docType: 'owner_photo', status: 'approved' as const },
      { docType: 'trade_license', status: 'approved' as const },
    ];
    const r = computeCompletion(richProfile, docs);
    expect(r.completionPercent).toBe(100);
    expect(r.kycStatus).toBe('verified');
  });

  it('all required docs uploaded but pending is submitted, not verified', () => {
    const docs = [
      { docType: 'aadhaar', status: 'pending' as const },
      { docType: 'pan', status: 'pending' as const },
      { docType: 'owner_photo', status: 'pending' as const },
      { docType: 'trade_license', status: 'pending' as const },
    ];
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

  it('optional docs do not block 100%', () => {
    const docs = [
      { docType: 'aadhaar', status: 'approved' as const },
      { docType: 'pan', status: 'approved' as const },
      { docType: 'owner_photo', status: 'approved' as const },
      { docType: 'trade_license', status: 'approved' as const },
    ];
    const r = computeCompletion(richProfile, docs); // gst_certificate + fssai_license optional, absent
    expect(r.completionPercent).toBe(100);
  });
});
