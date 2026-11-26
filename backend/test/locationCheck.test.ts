import { describe, expect, it } from 'vitest';
import { checkLocation, LocationCheckError } from '../src/lib/locationCheck';

// "lat, lng" text is read as a pin without fetching anything (lib/mapsLink.ts).
const DARJ = '27.0410, 88.2663';

describe('verifying one listing: a Google Maps link, the phone, or both (decision 2026-11-26)', () => {
  it('a link alone sets the pin', async () => {
    const r = await checkLocation({ maps_url: DARJ });
    expect(r).toMatchObject({ source: 'google_maps_link', latitude: 27.041, longitude: 88.2663 });
  });

  it('the phone alone needs a precise reading', async () => {
    expect(await checkLocation({ latitude: 27.041, longitude: 88.2663, accuracy: 30 })).toMatchObject({ source: 'live_capture', accuracy_m: 30 });
    await expect(checkLocation({ latitude: 27.041, longitude: 88.2663, accuracy: 400 })).rejects.toBeInstanceOf(LocationCheckError);
  });

  it('both: the link sets the spot, a rough phone nearby confirms it', async () => {
    // About 300 m off, with a 400 m reading: still on site.
    const r = await checkLocation({ maps_url: DARJ, latitude: 27.0437, longitude: 88.2663, accuracy: 400 });
    expect(r).toMatchObject({ source: 'maps_link_on_site', latitude: 27.041 });
    expect(r.gps_gap_m).toBeGreaterThan(250);
  });

  it('both, far apart: never fails, the link wins and the gap is reported', async () => {
    const r = await checkLocation({ maps_url: DARJ, latitude: 26.7271, longitude: 88.3953, accuracy: 20 });
    expect(r).toMatchObject({ source: 'google_maps_link', latitude: 27.041 });
    expect(r.gps_gap_m).toBeGreaterThan(30000);
  });

  it('refuses nothing to check, a mock location, and a pin outside India', async () => {
    await expect(checkLocation({})).rejects.toBeInstanceOf(LocationCheckError);
    await expect(checkLocation({ latitude: 27, longitude: 88, accuracy: 10, mocked: true })).rejects.toBeInstanceOf(LocationCheckError);
    await expect(checkLocation({ maps_url: '51.5, -0.12' })).rejects.toBeInstanceOf(LocationCheckError);
  });
});
