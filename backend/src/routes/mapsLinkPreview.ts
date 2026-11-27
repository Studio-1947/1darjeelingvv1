import { Router, Request, Response } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';
import { log } from '../config';
import { googleMapsUrl, inListingRegion, MapsLinkError, resolveMapsLink } from '../lib/mapsLink';

const router = Router();

/**
 * GET /api/geocode/maps-link?url=  ->  { latitude, longitude, maps_url }
 *
 * Where a pasted Google Maps link points, so the sign-up wizard can move its pin there before the
 * host has an account (lib/mapsLink.ts; short links are followed to Google only). Reading a link
 * verifies nothing: that happens when the listing is put up (lib/locationCheck.ts).
 */
router.get('/maps-link', rateLimiter(20, 60_000, 'maps-link'), async (req: Request, res: Response) => {
  const url = typeof req.query.url === 'string' ? req.query.url.trim().slice(0, 2000) : '';
  if (!url) return res.status(400).json({ detail: 'Paste a Google Maps link.' });
  try {
    const pin = await resolveMapsLink(url);
    if (!inListingRegion(pin)) return res.status(400).json({ detail: 'That pin is outside India. Check you picked the right place in Google Maps.' });
    res.json({ latitude: pin.latitude, longitude: pin.longitude, maps_url: googleMapsUrl(pin) });
  } catch (err) {
    if (err instanceof MapsLinkError) return res.status(400).json({ detail: err.message, ...(err.code ? { code: err.code } : {}) });
    log.warn(`[maps-link] could not read a link: ${(err as Error).message}`);
    res.status(502).json({ detail: 'Could not read that link. Try again.' });
  }
});

export default router;
