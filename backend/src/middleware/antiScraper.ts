import { Request, Response, NextFunction } from 'express';

/**
 * Turns away scripted bulk readers of the public API: scraping libraries and HTTP clients that
 * announce themselves in the User-Agent, and requests with no User-Agent at all. Browsers and the
 * mobile app always send one. Payment and messaging webhooks and the health check are never
 * filtered (their senders and our own uptime checks use plain clients).
 *
 * This is one layer, not a wall: a scraper can fake its User-Agent. The per-IP rate limits in
 * app.ts are the other layer, and contact numbers stay behind sign-in.
 */
const SCRAPER_UA = /(scrapy|python-requests|python-urllib|aiohttp|httpx|go-http-client|java\/|okhttp\/[23]\.|libwww-perl|wget|httpclient|mechanize|phantomjs|colly|node-fetch|axios\/|curl\/|headlesschrome|puppeteer|playwright|selenium)/i;

const ALWAYS_ALLOWED = ['/health', '/payments/webhook', '/webhooks/'];

export function isScraperAgent(ua: string | undefined): boolean {
  if (!ua || !ua.trim()) return true;
  return SCRAPER_UA.test(ua);
}

export function antiScraper(opts: { enabled: boolean }) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!opts.enabled) return next();
    // Mounted on /api, so req.path is the part after it.
    if (ALWAYS_ALLOWED.some((p) => req.path.startsWith(p))) return next();
    // Only public reads are worth scraping; signed-in calls carry a token we can trace.
    if (req.method !== 'GET' || req.headers.authorization) return next();
    if (isScraperAgent(req.get('user-agent'))) {
      return res.status(403).json({ detail: 'Automated access is not allowed. Use the aangan app or website.' });
    }
    next();
  };
}
