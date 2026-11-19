import { describe, expect, it, vi } from 'vitest';

// The real i18n setup touches the document; these tests only read labels.
vi.mock('@/i18n', () => ({ default: { t: (k: string) => k } }));

import { amenitiesFor } from './listingMeta';

const labels = (item: any) => amenitiesFor(item).map((a) => a.label);

describe('amenitiesFor', () => {
  it("lists only what a host picked, without the type's stock facilities", () => {
    const shop = { type: 'shop', provider_id: 'p-1', tags: [], extras: { amenities: ['Tea', 'Momo and food'] } };
    expect(labels(shop)).toEqual(['Tea', 'Momo and food']);
  });

  it('shows a facility once whatever its case', () => {
    const shop = { type: 'shop', provider_id: 'p-1', tags: [], extras: { amenities: ['Tea', 'tea', ' TEA '] } };
    expect(labels(shop)).toEqual(['Tea']);
  });

  it('a host who picked nothing has no facilities', () => {
    expect(labels({ type: 'cafe', provider_id: 'p-1', tags: [], extras: {} })).toEqual([]);
  });

  it("still fills out the team's own listings from the type's list", () => {
    const seeded = { type: 'shop', provider_id: 'admin-seed-provider', tags: [], extras: {} };
    expect(labels(seeded)).toContain('Locally owned');
    expect(labels({ type: 'spot', provider_id: 'p-1', tags: [] })).toContain('Photo spot');
  });
});
