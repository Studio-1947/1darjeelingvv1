import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { antiScraper, isScraperAgent } from '../src/middleware/antiScraper';

const BROWSER = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

function appWith(enabled: boolean) {
  const app = express();
  app.use('/api', antiScraper({ enabled }));
  app.get('/api/listings', (_req, res) => res.json({ ok: true }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('anti-scraper', () => {
  it('knows scraping tools from browsers and the app', () => {
    expect(isScraperAgent('python-requests/2.31')).toBe(true);
    expect(isScraperAgent('Scrapy/2.11 (+https://scrapy.org)')).toBe(true);
    expect(isScraperAgent('Mozilla/5.0 HeadlessChrome/120.0')).toBe(true);
    expect(isScraperAgent('')).toBe(true);
    expect(isScraperAgent(BROWSER)).toBe(false);
    expect(isScraperAgent('okhttp/4.12.0')).toBe(false); // React Native on Android
  });

  it('refuses scripted public reads but lets browsers, the health check and signed-in calls through', async () => {
    const app = appWith(true);
    expect((await request(app).get('/api/listings').set('User-Agent', 'python-requests/2.31')).status).toBe(403);
    expect((await request(app).get('/api/listings').set('User-Agent', BROWSER)).status).toBe(200);
    expect((await request(app).get('/api/health').set('User-Agent', 'curl/8.4')).status).toBe(200);
    expect((await request(app).get('/api/listings').set('User-Agent', 'curl/8.4').set('Authorization', 'Bearer x')).status).toBe(200);
  });

  it('does nothing when switched off (tests, local runs)', async () => {
    expect((await request(appWith(false)).get('/api/listings').set('User-Agent', 'python-requests/2.31')).status).toBe(200);
  });
});
