import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { clearTileCache, tileInServiceArea } from '../src/routes/mapTiles';

// 8-byte PNG signature plus a little body: all the proxy checks is the content type and the size.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

// Darjeeling at zoom 15, and a tile of the same zoom over Delhi.
const DARJEELING = '/api/maps/tiles/15/24417/13826.png';
const DELHI = '/api/maps/tiles/15/23490/13380.png';

function upstream(init: { status?: number; type?: string; body?: Buffer } = {}) {
  return vi.fn(async () =>
    new Response(new Uint8Array(init.body ?? PNG), {
      status: init.status ?? 200,
      headers: { 'content-type': init.type ?? 'image/png' },
    })
  );
}

let fetchSpy: ReturnType<typeof upstream>;
beforeEach(() => {
  clearTileCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tileInServiceArea', () => {
  it('accepts Darjeeling and Kalimpong tiles and rejects Delhi', () => {
    expect(tileInServiceArea(15, 24417, 13826)).toBe(true);
    expect(tileInServiceArea(12, 3052, 1728)).toBe(true);
    expect(tileInServiceArea(15, 23490, 13380)).toBe(false);
  });
});

describe('GET /api/maps/tiles', () => {
  it('serves a tile as a PNG, identifying aangan to OpenStreetMap', async () => {
    fetchSpy = upstream();
    vi.stubGlobal('fetch', fetchSpy);

    const res = await request(app).get(DARJEELING);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.headers['cache-control']).toMatch(/max-age=86400/);
    expect(Buffer.from(res.body).equals(PNG)).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe('https://tile.openstreetmap.org/15/24417/13826.png');
    expect(init.headers['User-Agent']).toMatch(/^aangan\//);
  });

  it('fetches a tile once and serves repeats from memory', async () => {
    fetchSpy = upstream();
    vi.stubGlobal('fetch', fetchSpy);

    await request(app).get(DARJEELING);
    await request(app).get(DARJEELING);
    const third = await request(app).get(DARJEELING);
    expect(third.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('is not an open proxy: no tiles outside the service area, outside the zoom range, or out of range', async () => {
    fetchSpy = upstream();
    vi.stubGlobal('fetch', fetchSpy);

    expect((await request(app).get(DELHI)).status).toBe(404);
    expect((await request(app).get('/api/maps/tiles/5/24/13.png')).status).toBe(400);
    expect((await request(app).get('/api/maps/tiles/19/1/1.png')).status).toBe(400);
    expect((await request(app).get('/api/maps/tiles/15/99999/13826.png')).status).toBe(400);
    expect((await request(app).get('/api/maps/tiles/15/abc/13826.png')).status).toBe(400);
    expect((await request(app).get('/api/maps/tiles/15/24417/13826.jpg')).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('answers 502 when OpenStreetMap fails or returns something that is not a PNG', async () => {
    vi.stubGlobal('fetch', upstream({ status: 503 }));
    expect((await request(app).get(DARJEELING)).status).toBe(502);

    clearTileCache();
    vi.stubGlobal('fetch', upstream({ type: 'text/html', body: Buffer.from('<html>blocked</html>') }));
    expect((await request(app).get(DARJEELING)).status).toBe(502);

    clearTileCache();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    expect((await request(app).get(DARJEELING)).status).toBe(502);
  });

  it('does not cache a failure', async () => {
    vi.stubGlobal('fetch', upstream({ status: 503 }));
    expect((await request(app).get(DARJEELING)).status).toBe(502);

    fetchSpy = upstream();
    vi.stubGlobal('fetch', fetchSpy);
    expect((await request(app).get(DARJEELING)).status).toBe(200);
  });
});
