import { describe, expect, it } from 'vitest';
import { hostsFromListings } from '@/components/feed/HostSites';

// The feed's "Business websites" shows every live business once, even before anyone has posted.
describe('hostsFromListings', () => {
  const items = [
    { id: '1', title: 'Tiger Hill', type: 'spot', provider_id: 'admin-seed-provider' },
    { id: '2', title: 'Pine View', type: 'homestay', provider_id: 'p1', location: 'Ghum', extras: { images: ['https://x/a.jpg'] } },
    { id: '3', title: 'Pine View Annex', type: 'homestay', provider_id: 'p1' },
    { id: '4', title: 'Rabi', type: 'driver', provider_id: 'p2', location: 'Darjeeling', provider_verified: true },
    { id: '5', title: 'Carnival', type: 'event', provider_id: 'p3' },
  ];

  it('keeps one entry per business and leaves out places, events and seed rows', () => {
    const hosts = hostsFromListings(items);
    expect(hosts.map((h) => h.provider_id)).toEqual(['p1', 'p2']);
    expect(hosts[0]).toMatchObject({ name: 'Pine View', type: 'homestay', location: 'Ghum' });
    expect(hosts[1]).toMatchObject({ name: 'Rabi', verified: true, image: null });
  });

  it('copes with nothing', () => {
    expect(hostsFromListings([])).toEqual([]);
    expect(hostsFromListings(undefined as any)).toEqual([]);
  });
});
