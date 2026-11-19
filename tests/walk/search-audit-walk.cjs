// Search and filters audit, walked as a traveller in a browser and checked against ground truth:
// every category page's filters (Near me and each radius, place, price, cab type, sort, delivers,
// entry fee, kinds, guests) alone and combined, filter state (chips, clear, reload, Back/Forward,
// a shared link, category switch), the home search pill and filter panel, /search with names,
// places, typos, intent words, Hindi/Bengali, odd input and empty input, Find a ride, Saved pills,
// the Feed filter and My trips tiles, then speed, flicker, 390px layout, keyboard and dark mode.
//
// The local data is mostly test listings that all sit at one pin with one price, which cannot show
// whether a distance, a price bound or a sort is right. So the filter checks answer the page's
// plain GET /listings (no q) with real listings re-dressed as a known fixture (places, pins,
// prices, cab types, delivery, entry fees, tags) and compute the expected cards themselves; ids are
// real, so opening a card loads the real listing. Search (q=...) and Find a ride go to the real API.
//
// Run against a LOCAL stack only (MESSAGING_PROVIDER=mock, MOCK_PAYMENTS=true, rate limiting off):
//   WEB=http://localhost:3000 API=http://localhost:8001/api \
//   PLAYWRIGHT=<path to @playwright/test> node tests/walk/search-audit-walk.cjs [screenshot dir]
// Prints OK/FAIL/UX lines, then ALL SEARCH AND FILTER CHECKS PASSED or one line per problem.
// It creates one traveller (with the mock pass and three saved places); nothing shared is changed.
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'C:/Users/soumi/Desktop/1darjeelingvv1/frontend/node_modules/@playwright/test');

const WEB = process.env.WEB || 'http://127.0.0.1:3100';
const API = process.env.API || 'http://127.0.0.1:8020/api';
const OUT = process.argv[2] || path.join(process.cwd(), 'search-audit-out');
fs.mkdirSync(OUT, { recursive: true });
const ME = { latitude: 27.0418, longitude: 88.2663 }; // Chowrasta
const SLOW_MS = 1500;

const problems = [];
let shotN = 0;
const ok = (c, area, msg, extra = '') => {
  console.log(`${c ? 'OK  ' : 'FAIL'} [${area}] ${msg}${extra ? ' | ' + extra : ''}`);
  if (!c) problems.push(`FAIL [${area}] ${msg}${extra ? ' | ' + extra : ''}`);
  return c;
};
const ux = (area, msg, extra = '') => { console.log(`UX   [${area}] ${msg}${extra ? ' | ' + extra : ''}`); problems.push(`UX [${area}] ${msg}${extra ? ' | ' + extra : ''}`); };

async function call(p, { method = 'GET', token, body } = {}) {
  const r = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch { /* empty */ }
  return { status: r.status, data };
}
const apiList = async (params) => (await call(`/listings?${new URLSearchParams({ limit: '200', ...params })}`)).data || {};

async function signIn(name) {
  const phone = `+9196${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
  const s = await call('/auth/otp/send', { method: 'POST', body: { phone, channel: 'whatsapp' } });
  const v = await call('/auth/otp/verify', { method: 'POST', body: { phone, otp: s.data?.mock_otp || '123456', name, role: 'tourist' } });
  if (!v.data?.token) throw new Error('sign-in failed: ' + JSON.stringify(v.data));
  return { token: v.data.token, id: v.data.user.id };
}

/* ---------- the page's own distance rule (frontend/src/lib/places.ts), for expected values ---------- */
const PLACES = [
  [['chowrasta', 'the mall', 'mall road'], 27.0425, 88.2663], [['chowk bazaar', 'chowk bazar', 'chauk bazar', 'chauk bazaar', 'motor stand'], 27.0445, 88.2635],
  [['nehru road', 'glenary'], 27.0405, 88.2645], [['laden la'], 27.0432, 88.2648], [['zakir hussain'], 27.0398, 88.2655], [['observatory hill', 'mahakal'], 27.044, 88.265],
  [['gymkhana'], 27.0442, 88.262], [['darjeeling railway', 'darjeeling station', 'hill cart'], 27.0387, 88.26], [['jawahar parbat', 'zoo', 'hmi'], 27.048, 88.257],
  [['ropeway', 'singamari'], 27.058, 88.256], [['happy valley'], 27.055, 88.256], [['lebong'], 27.062, 88.264], [['botanical'], 27.037, 88.258],
  [['jalapahar', 'peace pagoda', 'lal kothi'], 27.0333, 88.2606], [['batasia'], 27.0163, 88.2586], [['ghum', 'ghoom', 'yiga choeling'], 27.0087, 88.253],
  [['jorebunglow', 'jorebungalow'], 27.006, 88.26], [['tiger hill'], 27.0028, 88.267], [['dali'], 27.0215, 88.2548], [['rock garden', 'barbotey'], 27.0, 88.238],
  [['sonada'], 26.98, 88.229], [['sukhiapokhri'], 26.994, 88.177], [['lepchajagat'], 27.029, 88.201], [['takdah'], 27.033, 88.36], [['lamahatta'], 27.078, 88.365],
  [['tukvar', 'tukver'], 27.06, 88.28], [['kurseong'], 26.88, 88.279], [['mirik'], 26.887, 88.187], [['kalimpong'], 27.0594, 88.4695],
  [['njp', 'new jalpaiguri'], 26.6833, 88.4429], [['bagdogra'], 26.6812, 88.3286], [['siliguri'], 26.7271, 88.3953], [['gangtok'], 27.3389, 88.6065], [['darjeeling'], 27.041, 88.2663],
];
const placeFor = (text) => {
  const t = String(text ?? '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < 3) return null;
  for (const [keys, lat, lng] of PLACES) if (keys.some((k) => t.includes(k))) return { lat, lng };
  return null;
};
const hav = (a, b) => {
  const rad = (x) => (x * Math.PI) / 180; const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};
const distOf = (from, it) => {
  const pinned = it.latitude != null && Number.isFinite(Number(it.latitude)) && (Number(it.latitude) || Number(it.longitude));
  const at = pinned ? { lat: Number(it.latitude), lng: Number(it.longitude) } : placeFor(it.location);
  return at ? { km: hav(from, at), approx: !pinned } : null;
};
const catKm = (d) => (d.km < 1 ? 'under 1 km' : `${d.approx ? '≈ ' : ''}${d.km < 10 ? Number(d.km.toFixed(1)) : Math.round(d.km)} km`);
const here = { lat: ME.latitude, lng: ME.longitude };

/* ---------- the fixture: real listings re-dressed with known places, pins and prices ---------- */
let FX = {};
// Only the fields a filter reads are replaced; extras keep what the listing page needs (images), with
// the filter-relevant keys (delivery, entry fee, vehicle) reset so the base listing's values cannot leak in.
function dress(base, o) {
  const extras = { ...(base.extras || {}), home_delivery: false, entry_fee: undefined, vehicle_type: undefined, car_model: undefined, ...(o.extras || {}) };
  return { ...base, tags: [], rating: 0, review_count: 0, ...o, extras, latitude: o.latitude ?? null, longitude: o.longitude ?? null };
}
async function buildFixture() {
  const by = {};
  for (const t of ['homestay', 'driver', 'guide', 'cafe', 'shop', 'spot', 'event', 'biodiversity']) by[t] = (await apiList({ type: t })).items || [];
  const take = (t, defs) => defs.map((d, i) => dress(by[t][i], d)).filter((x) => x.id);
  FX.homestay = take('homestay', [
    { title: 'Chowrasta View Homestay', location: 'Chowrasta, Darjeeling', latitude: 27.0425, longitude: 88.2663, price: 1500, max_guests: 4, rating: 4.8, review_count: 12 },
    { title: 'Ghum Monastery Stay', location: 'Ghum, Darjeeling', latitude: 27.0087, longitude: 88.253, price: 900, max_guests: 2 },
    { title: 'Ghoom Heritage Home', location: 'Ghoom, Darjeeling', price: 1200, max_guests: 6 },
    { title: 'Kurseong Tea Bungalow', location: 'Kurseong', latitude: 26.88, longitude: 88.279, price: 3000, max_guests: 8 },
    { title: 'Mirik Lakeside Rooms', location: 'Mirik', latitude: 26.887, longitude: 88.187, price: 5000, max_guests: 2 },
    { title: 'Kalimpong Hill Home', location: 'Kalimpong', latitude: 27.0594, longitude: 88.4695, price: 5200, max_guests: 6 },
    { title: 'Sittong Orange Farmstay', location: 'Sittong, Kurseong', price: 1501, max_guests: 4 },
    { title: 'Lebong Valley Homestay', location: 'Lebong, Darjeeling', latitude: 27.062, longitude: 88.264, price: 0, max_guests: 0 },
    { title: 'Rangbull Busty Home', location: 'Rangbull Busty', price: 2500, max_guests: 10 },
    { title: 'Jorebunglow Family Stay', location: 'Jorebunglow, Darjeeling', latitude: 27.006, longitude: 88.26, price: 3001, max_guests: 4 },
  ]);
  FX.driver = take('driver', [
    { title: 'Pemba Innova Tours', location: 'Darjeeling', latitude: 27.041, longitude: 88.2663, price: 1000, extras: { vehicle_type: 'SUV / Sumo', seats: 7 } },
    { title: 'Tashi Dzire Cabs', location: 'Ghum, Darjeeling', price: 2500, extras: { vehicle_type: 'Sedan', seats: 4 } },
    { title: 'Lhamu Tamang', location: 'Kurseong', price: 999, extras: { vehicle_type: 'Jeep', seats: 9 } },
    { title: 'Siliguri Tempo Service', location: 'Siliguri', latitude: 26.7271, longitude: 88.3953, price: 5000, extras: { vehicle_type: 'Tempo Traveller', seats: 12 } },
    { title: 'Nima Rai', location: 'Darjeeling', price: 1800, extras: {} },
    { title: 'Mirik Alto Rides', location: 'Mirik', price: 1001, extras: { car_model: 'Alto hatchback', seats: 4 } },
    { title: 'Karma Bike Rentals', location: 'Chowk Bazaar, Darjeeling', price: 700, extras: { vehicle_type: 'Bike', seats: 1 } },
  ]);
  FX.cafe = take('cafe', [
    { title: 'Glenary Bakery', location: 'Nehru Road, Darjeeling', latitude: 27.0405, longitude: 88.2645, price: 150, extras: { home_delivery: true } },
    { title: 'Kunga Momo House', location: 'Chowk Bazaar, Darjeeling', price: 80, extras: { home_delivery: false } },
    { title: 'Ghum Tea Point', location: 'Ghum', price: 40, extras: { home_delivery: true } },
    { title: 'Mirik Lake Cafe', location: 'Mirik', latitude: 26.887, longitude: 88.187, price: 200, extras: { home_delivery: false } },
    { title: 'Kurseong Chai Stop', location: 'Kurseong', price: 60, extras: {} },
  ]);
  FX.shop = take('shop', [
    { title: 'Nathmull Tea Shop', location: 'Laden La, Darjeeling', price: 300, extras: { home_delivery: true } },
    { title: 'Tibetan Craft Corner', location: 'Mall Road, Darjeeling', price: 500, extras: { home_delivery: false } },
    { title: 'Kalimpong Cactus Nursery', location: 'Kalimpong', price: 250, extras: {} },
  ]);
  FX.guide = take('guide', [
    { title: 'Sandakphu Trek Guide', location: 'Darjeeling', latitude: 27.041, longitude: 88.2663, price: 2500 },
    { title: 'Ghum Heritage Walks', location: 'Ghum', price: 800 },
    { title: 'Kalimpong Birding Guide', location: 'Kalimpong', price: 1500 },
    { title: 'Mirik Nature Guide', location: 'Mirik', price: 0 },
  ]);
  FX.spot = take('spot', [
    { title: 'Tiger Hill Sunrise', location: 'Tiger Hill, Darjeeling', price: 0, extras: { entry_fee: 'Free' }, tags: ['sunrise', 'viewpoint'] },
    { title: 'Batasia Loop', location: 'Ghum, Darjeeling', price: 30, extras: {}, tags: ['heritage', 'toy train'] },
    { title: 'Ghum Monastery', location: 'Ghum, Darjeeling', price: 0, extras: {}, tags: ['monastery'] },
    { title: 'Mirik Lake', location: 'Mirik', price: 0, extras: { entry_fee: '₹30 per person' }, tags: ['lake'] },
    { title: 'Rock Garden Falls', location: 'Rock Garden, Darjeeling', price: 0, extras: { entry_fee: 'Nil' }, tags: ['waterfall'] },
    { title: 'Himalayan Zoo', location: 'Jawahar Parbat, Darjeeling', price: 150, extras: {}, tags: ['wildlife', 'zoo'] },
    { title: 'Japanese Peace Pagoda', location: 'Jalapahar, Darjeeling', price: 0, extras: { entry_fee: 'Free entry' }, tags: ['temple', 'viewpoint'] },
  ]);
  FX.event = by.event.slice(0, 4);
  FX.biodiversity = by.biodiversity.slice(0, 4);
  return by;
}

/** Answers the page's plain list calls (no q) with the fixture; searches pass through to the real API. */
async function useFixture(ctx) {
  await ctx.route(/\/api\/listings(\?.*)?$/, async (route) => {
    const u = new URL(route.request().url());
    if (route.request().method() !== 'GET' || u.searchParams.get('q')) return route.continue();
    const t = u.searchParams.get('type');
    const items = t ? (FX[t] || []) : Object.values(FX).flat();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items }) });
  });
}

const IGNORE_CONSOLE = [/Download the React DevTools/, /\[vite\]/, /favicon/, /service-worker/i, /Failed to load resource/, /maps\.googleapis|tile|openstreetmap/i, /accounts\.google\.com/];
async function context(browser, { user = null, width = 390, fixture = false, label = 'walk', dark = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: width <= 430 ? 844 : 900 },
    permissions: ['geolocation'], geolocation: { ...ME, accuracy: 20 },
    colorScheme: dark ? 'dark' : 'light',
  });
  await ctx.addInitScript(([token]) => {
    try {
      if (token) localStorage.setItem('token', token);
      localStorage.setItem('mode', 'tourist');
      sessionStorage.setItem('aangan-splash-seen', '1');
    } catch { /* about:blank */ }
    // Records what the results area showed over time, to catch a flash of "nothing found".
    window.__seen = [];
    const rec = () => {
      const empty = !!document.querySelector('[data-testid="category-empty"]');
      const n = document.querySelectorAll('[data-testid="category-results"] [data-testid^="grid-tile-"]').length;
      const last = window.__seen[window.__seen.length - 1];
      if (!last || last.empty !== empty || last.n !== n) window.__seen.push({ t: Math.round(performance.now()), empty, n, url: location.pathname + location.search });
    };
    new MutationObserver(rec).observe(document, { childList: true, subtree: true });
  }, [user?.token || null]);
  await ctx.route(/https:\/\/(www\.)?google\.com\/maps.*/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>maps</p>' }));
  if (fixture) await useFixture(ctx);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`FAIL [${label} ${width}px] ${page.url().replace(WEB, '')}: crash: ${e.message.slice(0, 160)}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return; const t = m.text();
    if (IGNORE_CONSOLE.some((r) => r.test(t))) return;
    problems.push(`FAIL [${label} ${width}px] ${page.url().replace(WEB, '')}: console error: ${t.slice(0, 160)}`);
  });
  page.on('response', (r) => {
    const u = r.url(); if (!u.includes('/api/')) return; const s = r.status(); if (s < 400) return;
    const short = `${s} ${r.request().method()} ${u.replace(/^.*\/api/, '/api').split('?')[0]}`;
    if (/^40[14] GET \/api\/(auth\/me|listings\/[^/]+\/reviews|favorites)/.test(short)) return;
    problems.push(`FAIL [${label} ${width}px] ${page.url().replace(WEB, '')}: API ${short}`);
  });
  page.on('dialog', (d) => d.accept());
  return { ctx, page };
}
const tid = (page, id) => page.locator(`[data-testid="${id}"]`);
async function go(page, p) { await page.goto(WEB + p, { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); }
async function shot(page, name) { const f = path.join(OUT, `${String(++shotN).padStart(2, '0')}-${name}.png`); await page.screenshot({ path: f }).catch(() => {}); return f; }
async function step(name, fn) { try { await fn(); } catch (e) { ok(false, name, 'step threw', e.message.split('\n')[0].slice(0, 220)); } }

/** The ids of the result cards, once the list has stopped changing. */
async function ids(page, timeout = 6000) {
  const read = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="category-results"] [data-testid^="grid-tile-"]')].map((e) => e.getAttribute('data-testid').slice(10)));
  const end = Date.now() + timeout; let prev = null, same = 0;
  for (;;) {
    const loading = await page.locator('.ag-category-grid .animate-pulse, [class*="skeleton"]').count().catch(() => 0);
    const cur = JSON.stringify(await read());
    if (cur === prev && !loading) { if (++same >= 3) return JSON.parse(cur); } else same = 0;
    prev = cur;
    if (Date.now() > end) return JSON.parse(cur);
    await page.waitForTimeout(80);
  }
}
/** Waits for a category page to show its cards or its empty state. */
async function ready(page) {
  await page.locator('[data-testid="category-results"] [data-testid^="grid-tile-"], [data-testid="category-empty"]').first().waitFor({ timeout: 15000 }).catch(() => {});
  return ids(page);
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const names = (list, arr) => arr.map((id) => (list.find((x) => x.id === id)?.title || id.slice(0, 6))).join(', ');
async function openPanel(page) {
  if (await tid(page, 'category-filter-panel').count()) return;
  await tid(page, 'category-filter-open').click();
  await tid(page, 'category-filter-panel').waitFor({ timeout: 4000 });
}
async function nearOn(page) {
  await openPanel(page);
  if ((await tid(page, 'near-me').count()) === 0) await tid(page, 'near-me-toggle').click();
  await tid(page, 'near-me').waitFor({ timeout: 8000 });
}
async function badges(page) {
  return page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid="category-results"] [data-testid^="grid-tile-"]')].map((e) => {
    const b = e.querySelector('.ag-category-distb') || e.querySelector('.loc');
    return [e.getAttribute('data-testid').slice(10), b ? b.textContent.replace(/\s·\s.*$/, '').replace(/\s·\s*$/, '').trim() : ''];
  })));
}
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Expected list for the page's filters, by the rule a traveller would expect. */
function expectFor(list, { near = false, radius = null, maxPrice, loc, sort = 'recommended', guests = 1, cab, entry, delivers } = {}) {
  let l = list.map((it) => ({ it, d: distOf(near ? here : placeFor('darjeeling'), it) }));
  if (loc) { const keys = PLACES.find(([k]) => k.includes(loc.toLowerCase()))?.[0] || [loc.toLowerCase()]; l = l.filter(({ it }) => keys.some((k) => String(it.location).toLowerCase().includes(k))); }
  if (maxPrice) l = l.filter(({ it }) => Number(it.price) > 0 && Number(it.price) <= maxPrice);
  if (cab) l = l.filter(({ it }) => cab(it));
  if (entry) l = l.filter(({ it }) => entry(it));
  if (delivers) l = l.filter(({ it }) => it.extras?.home_delivery === true);
  if (near) l = l.filter(({ d }) => radius == null || (d && d.km <= radius)).sort((a, b) => (a.d?.km ?? 1e9) - (b.d?.km ?? 1e9));
  const p = (x) => (Number(x.it.price) > 0 ? Number(x.it.price) : Infinity); // "price on request" is not the cheapest
  if (sort === 'price_asc') l.sort((a, b) => p(a) - p(b));
  if (sort === 'price_desc') l.sort((a, b) => (Number(b.it.price) || 0) - (Number(a.it.price) || 0));
  if (sort === 'name_asc') l.sort((a, b) => a.it.title.localeCompare(b.it.title));
  if (guests > 1) l = l.filter(({ it }) => !(Number(it.max_guests) > 0) || Number(it.max_guests) >= guests);
  return l.map((x) => x.it.id);
}

(async () => {
  const browser = await chromium.launch();
  const by = await buildFixture();
  const totalApi = ((await apiList({})).items || []).length;

  /* ================= A0. Real data: what each page shows against the server ================= */
  await step('A0 real data', async () => {
    const { ctx, page } = await context(browser, { label: 'A0' });
    for (const [p, t] of [['/homestays', 'homestay'], ['/drivers', 'driver'], ['/guides', 'guide'], ['/cafes', 'cafe'], ['/shops', 'shop'], ['/spots', 'spot'], ['/events', 'event'], ['/biodiversity', 'biodiversity']]) {
      await go(page, p);
      const shown = await ready(page);
      const api = by[t].map((x) => x.id);
      ok(sameSet(shown, api.slice(0, 60)) && shown.length === Math.min(api.length, 60), 'A0', `${p} shows every ${t} the server has`, `${shown.length} shown, ${api.length} on the server`);
      if (api.length > 60) ok(false, 'A0', `${p}: only the first 60 of ${api.length} load and there is no "more"`);
      const over = await sideways(page); ok(over <= 2, 'G', `${p} 390px: no sideways scroll`, over > 2 ? `${over}px` : '');
    }
    // /search with only a filter (home panel: Near me, no words, no type) loads 60 of everything.
    await go(page, '/search?near=me');
    const shown = await ready(page);
    ok(shown.length === totalApi, 'A0', '/search?near=me (home panel, My location, Everything) lists every listing', `${shown.length} shown of ${totalApi} on the server (Category.tsx:164 asks limit 60 with no type; backend default page is 60)`);
    if (shown.length < totalApi) await shot(page, 'search-near-me-capped');
    // Foods & Shops from the home panel: cafes and shops out of the same capped 60.
    await go(page, '/search?type=food');
    const food = await ready(page);
    const wantFood = [...by.cafe, ...by.shop].map((x) => x.id);
    ok(sameSet(food, wantFood), 'A0', '/search?type=food (home panel "Foods & Shops") lists every cafe and shop', `${food.length} shown, ${wantFood.length} on the server`);
    const title = await page.title();
    ok(!/categories\.food/.test(title), 'A0', '/search?type=food page title is words, not a translation key', title);
    await go(page, '/search?type=nature');
    const nat = await ready(page);
    ok(nat.length === by.biodiversity.length, 'A0', '/search?type=nature (home panel "Nature") lists the nature listings', `${nat.length} shown, ${by.biodiversity.length} biodiversity on the server (API type=nature matches nothing)`);
    if (nat.length !== by.biodiversity.length) await shot(page, 'search-type-nature');
    await ctx.close();
  });

  /* ================= A. Category filters against the fixture (390px) ================= */
  for (const width of [390, 1280]) {
    const W = `A ${width}`;
    await step(`${W} homestays`, async () => {
      const { ctx, page } = await context(browser, { fixture: true, width, label: W });
      const H = FX.homestay;
      await go(page, '/homestays');
      let shown = await ready(page);
      ok(sameSet(shown, H.map((x) => x.id)), W, 'homestays: every fixture stay shows', `${shown.length}/${H.length}`);
      // Distance badges from town before My location.
      const b0 = await badges(page);
      const wrong0 = H.filter((it) => { const d = distOf(placeFor('darjeeling'), it); return d ? b0[it.id] !== catKm(d) : !!b0[it.id]; });
      ok(!wrong0.length, W, 'homestays: distance badges from town are right', wrong0.map((it) => `${it.title}: "${b0[it.id]}"`).join('; '));
      // Near me, any distance: nearest first, unknown distance last, badges from me.
      await nearOn(page);
      shown = await ids(page);
      let want = expectFor(H, { near: true });
      ok(same(shown, want), W, 'Near me: nearest first, the one with no known place last', `got ${names(H, shown)}`);
      const b1 = await badges(page);
      const wrong1 = H.filter((it) => { const d = distOf(here, it); return d ? b1[it.id] !== catKm(d) : false; });
      ok(!wrong1.length, W, 'Near me: every distance badge is the distance from me', wrong1.map((it) => `${it.title}: "${b1[it.id]}" want "${catKm(distOf(here, it))}"`).join('; '));
      const noPlace = H.find((x) => !distOf(here, x));
      if (noPlace) ok(!b1[noPlace.id], W, 'Near me: a stay whose place is unknown shows no distance', b1[noPlace.id]);
      for (const r of [5, 10, 25]) {
        await tid(page, `near-${r}`).click();
        shown = await ids(page);
        want = expectFor(H, { near: true, radius: r });
        ok(same(shown, want), W, `within ${r} km: exactly the stays within ${r} km, nearest first`, `got [${names(H, shown)}] want [${names(H, want)}]`);
        const fc = Number(await page.locator('[data-testid="category-filter-apply"] .fcount').textContent().catch(() => '-1'));
        ok(fc === shown.length, W, `within ${r} km: the Search button's count matches the cards`, `${fc} vs ${shown.length}`);
      }
      await tid(page, 'near-any').click();
      ok((await ids(page)).length === H.length, W, 'Any distance brings every stay back');
      await tid(page, 'near-me-toggle').click();
      ok((await tid(page, 'near-me').count()) === 0 && (await ids(page)).length === H.length, W, 'My location off: rows go, every stay back');
      // Place.
      for (const loc of ['Ghum', 'Kurseong', 'Mirik', 'Darjeeling']) {
        await tid(page, 'category-location-select').selectOption(loc);
        shown = await ids(page);
        want = expectFor(H, { loc });
        ok(sameSet(shown, want), W, `place ${loc}: the stays in ${loc}${loc === 'Ghum' ? ' (Ghoom too)' : ''}`, `got [${names(H, shown)}] want [${names(H, want)}]`);
      }
      await tid(page, 'category-location-select').selectOption('All Locations');
      // Price caps, bounds inclusive.
      for (const cap of [1500, 3000, 5000]) {
        await tid(page, `filter-price-${cap}`).click();
        shown = await ids(page);
        want = expectFor(H, { maxPrice: cap });
        ok(sameSet(shown, want), W, `under ₹${cap}: priced stays at or under ₹${cap}`, `got [${names(H, shown)}]`);
      }
      await tid(page, 'filter-price-any').click();
      // A stay priced only by its rooms: price column 900 per head, a 2-person room ₹2,400 a night.
      const roomy = by.homestay.find((x) => (x.extras?.rooms || []).some((r) => Number(r.price) > Number(x.price)));
      if (roomy) ux('A', `homestay price filter reads only the listing's single price: "${roomy.title}" is ₹${roomy.price} (its per-head Family Room) yet its Valley Room is ₹${roomy.extras.rooms.map((r) => r.price).join('/₹')}; "Under ₹1,500" keeps it with no hint that most rooms cost more (Category.tsx:215)`);
      // Sort.
      for (const s of ['price_asc', 'price_desc', 'name_asc']) {
        await tid(page, 'category-sort-select').selectOption(s);
        shown = await ids(page);
        want = expectFor(H, { sort: s });
        ok(same(shown, want), W, `sort ${s}: order holds`, `got [${names(H, shown).slice(0, 160)}]`);
      }
      const opts = await tid(page, 'category-sort-select').locator('option').allTextContents();
      if (!opts.some((o) => /rating|rated/i.test(o)) || !opts.some((o) => /new/i.test(o)) || !opts.some((o) => /near/i.test(o))) {
        ux('A', `sort offers only [${opts.join(' | ')}]: no Top rated, Newest or Nearest (nearest only by turning on My location); "Featured / Popular" is just the server's row order (CategoryFilterBar.tsx:296)`);
      }
      // Near me and Cheapest first together.
      await nearOn(page); await tid(page, 'near-25').click(); await tid(page, 'category-sort-select').selectOption('price_asc');
      shown = await ids(page); want = expectFor(H, { near: true, radius: 25, sort: 'price_asc' });
      ok(same(shown, want), W, 'within 25 km + Cheapest first: cheapest of the near ones first', `got [${names(H, shown)}]`);
      await tid(page, 'category-sort-select').selectOption('recommended');
      // Guests.
      for (const g of [4, 6, 8]) {
        await tid(page, `guest-filter-${g}`).click();
        shown = await ids(page); want = expectFor(H, { near: true, radius: 25, guests: g });
        ok(same(shown, want), W, `guests ${g}+ (within 25 km): only stays that take ${g}`, `got [${names(H, shown)}]`);
        ok(new URL(page.url()).searchParams.get('guests') === String(g), W, `guests ${g}+ is in the address`);
      }
      await tid(page, 'guest-filter-1').click();
      // A combination with nothing in it: a helpful empty state with a way out.
      await tid(page, 'near-5').click(); await tid(page, 'filter-price-1500').click(); await tid(page, 'guest-filter-8').click();
      shown = await ids(page);
      want = expectFor(H, { near: true, radius: 5, maxPrice: 1500, guests: 8 });
      ok(same(shown, want) && shown.length === 0, W, 'within 5 km + under ₹1,500 + 8 guests: nothing (as expected)');
      await tid(page, 'category-filter-apply').click().catch(() => {});
      const emptyTxt = (await tid(page, 'category-empty').innerText().catch(() => '')).replace(/\s+/g, ' ');
      const wayOut = await page.locator('[data-testid="category-empty"] button, [data-testid="category-empty"] a').allInnerTexts();
      const f1 = await shot(page, `empty-combination-${width}`);
      ok(!/No listings here yet|Add my homestay/i.test(emptyTxt) && wayOut.some((t) => /clear|reset|remove|filter/i.test(t)), W,
        'filters that match nothing say so and offer Clear filters', `empty state says "${emptyTxt.slice(0, 120)}" with [${wayOut.join(' | ')}] (Category.tsx:514 shows EmptyCategory when nothing was typed) ${f1}`);
      // Applied filters visible outside the panel, one removable chip each.
      const chipsOut = await page.locator('[data-testid="category-filter-bar"] ~ * [data-testid*="active-filter"], [data-testid*="applied"], [data-testid*="filter-chip"]').count();
      const dot = await page.locator('.fdot').count();
      ok(chipsOut > 0, W, 'applied filters show as chips outside the panel (each removable)', `none: only a ${dot ? 'red dot on the filter button' : '(no dot either)'}; the traveller cannot see "5 km · under ₹1,500 · 8 guests" without reopening the panel`);
      // Clear all.
      await openPanel(page);
      await tid(page, 'category-reset-btn').click();
      shown = await ids(page);
      const gLeft = new URL(page.url()).searchParams.get('guests');
      ok(shown.length === H.length && !gLeft, W, 'Clear filters clears every filter, guests included', `${shown.length}/${H.length} shown, guests=${gLeft} still in the address (resetFilters, Category.tsx:284, does not touch ?guests)`);
      if (width === 390) {
        // The panel: closable by Escape / tapping outside; layout.
        await openPanel(page);
        const over = await sideways(page); ok(over <= 2, 'G', '/homestays filter panel open at 390px: no sideways scroll', `${over}px`);
        await shot(page, 'homestays-panel-390');
        await page.keyboard.press('Escape');
        const escClosed = (await tid(page, 'category-filter-panel').count()) === 0;
        if (!escClosed) ux('G', 'category filter panel does not close on Escape (CategoryFilterBar.tsx has no key handler); only the filter button or Search closes it');
        if (!escClosed) { await page.mouse.click(5, 830); if (await tid(page, 'category-filter-panel').count()) ux('G', 'category filter panel stays open when tapping outside it'); }
      }
      await ctx.close();
    });
    if (width === 1280) continue; // the rest of A at phone width only
    await step('A drivers', async () => {
      const { ctx, page } = await context(browser, { fixture: true, label: 'A drivers' });
      const D = FX.driver;
      await go(page, '/drivers'); let shown = await ready(page);
      ok(sameSet(shown, D.map((x) => x.id)), 'A', 'drivers: every fixture driver shows', `${shown.length}/${D.length}`);
      await openPanel(page);
      const hatch = (it) => /dzire|hatchback|sedan/i.test(it.title + JSON.stringify(it.extras));
      const suv = (it) => /innova|bolero|suv|sumo|jeep|scorpio/i.test(it.title + JSON.stringify(it.extras));
      await tid(page, 'filter-cab-hatchback').click(); shown = await ids(page);
      ok(sameSet(shown, expectFor(D, { cab: hatch })), 'A', 'cab Hatchback / Sedan: the sedans and hatchbacks', `got [${names(D, shown)}]`);
      await tid(page, 'filter-cab-suv').click(); shown = await ids(page);
      ok(sameSet(shown, expectFor(D, { cab: suv })), 'A', 'cab Mountain SUV: SUVs and the Jeep/Sumo hill cars', `got [${names(D, shown)}] want [${names(D, expectFor(D, { cab: suv }))}] (a "Jeep" vehicle_type, the host form's own option, matches neither chip: Category.tsx:223)`);
      const left = D.filter((it) => !hatch(it) && !suv(it));
      if (left.length) ux('A', `cab chips cover only Hatchback/Sedan and SUV; the host form's other vehicle types (Tempo Traveller, Bike, none set) can never be picked: ${left.map((x) => `${x.title} (${x.extras.vehicle_type || 'none'})`).join(', ')}`);
      await tid(page, 'filter-cab-all').click();
      for (const cap of [1000, 2500, 5000]) {
        await tid(page, `filter-price-${cap}`).click(); shown = await ids(page);
        ok(sameSet(shown, expectFor(D, { maxPrice: cap })), 'A', `drivers under ₹${cap}: at or under, ₹${cap} itself included`, `got [${names(D, shown)}]`);
      }
      await tid(page, 'filter-price-any').click();
      await nearOn(page); await tid(page, 'near-10').click(); shown = await ids(page);
      ok(same(shown, expectFor(D, { near: true, radius: 10 })), 'A', 'drivers within 10 km of me: nearest first', `got [${names(D, shown)}]`);
      await tid(page, 'filter-cab-suv').click(); shown = await ids(page);
      ok(same(shown, expectFor(D, { near: true, radius: 10, cab: (it) => /innova|bolero|suv/i.test(it.title + JSON.stringify(it.extras)) })), 'A', 'drivers within 10 km + SUV', `got [${names(D, shown)}]`);
      await ctx.close();
    });
    await step('A cafes shops guides', async () => {
      const { ctx, page } = await context(browser, { fixture: true, label: 'A food' });
      for (const [p, t] of [['/cafes', 'cafe'], ['/shops', 'shop']]) {
        const L = FX[t];
        await go(page, p); let shown = await ready(page);
        ok(sameSet(shown, L.map((x) => x.id)), 'A', `${p}: every fixture ${t} shows`, `${shown.length}/${L.length}`);
        await tid(page, 'category-delivers').click(); shown = await ids(page);
        ok(sameSet(shown, expectFor(L, { delivers: true })), 'A', `${p} Delivers: only those that deliver`, `got [${names(L, shown)}]`);
        const pressed = await tid(page, 'category-delivers').getAttribute('aria-pressed');
        ok(pressed === 'true', 'A', `${p} Delivers shows as on`);
        const dot = await page.locator('.fdot').count();
        if (!dot) ux('A', `${p}: Delivers on does not light the filter dot, and Clear filters (inside the panel) is not offered for it (CategoryFilterBar.tsx:149 filtersOn ignores delivers/kind)`);
        await openPanel(page);
        const panelPrice = await page.locator('[data-testid^="filter-price-"]').count();
        if (!panelPrice) ux('A', `${p}: the filter panel has no price or Cheapest-first choice besides the sort select; cards show no price at all for cafes/shops (ListingCard.tsx:175), so "Cheapest first" sorts by a number the traveller never sees`);
        await tid(page, 'category-sort-select').selectOption('price_asc'); shown = await ids(page);
        ok(same(shown, expectFor(L, { delivers: true, sort: 'price_asc' })), 'A', `${p} Delivers + Cheapest first`, `got [${names(L, shown)}]`);
        await tid(page, 'category-delivers').click();
        await tid(page, 'category-reset-btn').click().catch(() => {});
      }
      const G = FX.guide;
      await go(page, '/guides'); await ready(page);
      await nearOn(page); await tid(page, 'near-5').click(); let shown = await ids(page);
      ok(same(shown, expectFor(G, { near: true, radius: 5 })), 'A', 'guides within 5 km: nearest first', `got [${names(G, shown)}]`);
      await tid(page, 'near-any').click(); await tid(page, 'category-sort-select').selectOption('price_asc'); shown = await ids(page);
      ok(same(shown, expectFor(G, { near: true, sort: 'price_asc' })), 'A', 'guides Cheapest first: a guide with no rate is not "cheapest"', `got [${names(G, shown)}]`);
      await ctx.close();
    });
    await step('A spots', async () => {
      const { ctx, page } = await context(browser, { fixture: true, label: 'A spots' });
      const S = FX.spot;
      await go(page, '/spots'); let shown = await ready(page);
      ok(sameSet(shown, S.map((x) => x.id)), 'A', 'spots: every fixture spot shows', `${shown.length}/${S.length}`);
      const free = (it) => (!(Number(it.price) > 0) && !/₹|rs\.?\s*\d|\d/i.test(String(it.extras?.entry_fee || ''))) || /free|nil/i.test(String(it.extras?.entry_fee || ''));
      await openPanel(page);
      await tid(page, 'filter-entry-free').click(); shown = await ids(page);
      ok(sameSet(shown, expectFor(S, { entry: free })), 'A', 'spots Free entry: only the free ones', `got [${names(S, shown)}] want [${names(S, expectFor(S, { entry: free }))}] (a spot with price 0 but entry_fee "₹30 per person" counts as free: Category.tsx:230)`);
      await tid(page, 'filter-entry-paid').click(); shown = await ids(page);
      ok(sameSet(shown, expectFor(S, { entry: (it) => !free(it) })), 'A', 'spots Paid entry: only the paid ones', `got [${names(S, shown)}]`);
      await tid(page, 'filter-entry-all').click();
      await tid(page, 'category-filter-apply').click();
      // Kind chips: counts and filtering.
      const kinds = await page.locator('button[data-testid^="kind-"]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-testid').slice(5), Number(e.querySelector('.svn')?.textContent || -1)]));
      ok(kinds.length > 1, 'A', 'spots: kind chips show', kinds.map((k) => k.join(':')).join(' '));
      for (const [k, n] of kinds.filter(([k]) => k !== 'all').slice(0, 4)) {
        await tid(page, `kind-${k}`).click(); shown = await ids(page);
        ok(shown.length === n, 'A', `kind ${k}: chip count ${n} matches the cards`, `${shown.length}`);
      }
      await tid(page, 'kind-all').click();
      // Near me on spots.
      await nearOn(page); await tid(page, 'near-5').click(); shown = await ids(page);
      ok(same(shown, expectFor(S, { near: true, radius: 5 })), 'A', 'spots within 5 km: nearest first', `got [${names(S, shown)}]`);
      const b = await badges(page);
      const bad = S.filter((it) => shown.includes(it.id) && b[it.id] !== catKm(distOf(here, it)));
      ok(!bad.length, 'A', 'spots within 5 km: distance on each card', bad.map((it) => `${it.title}: "${b[it.id]}"`).join('; '));
      // Kind + radius: kind counts follow the other filters?
      const kinds2 = await page.locator('button[data-testid^="kind-"]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-testid').slice(5), Number(e.querySelector('.svn')?.textContent || -1)]));
      const allN = kinds2.find(([k]) => k === 'all')?.[1];
      if (allN !== shown.length) ux('A', `spots: with "within 5 km" on, the kind chips still count every spot (All ${allN} while ${shown.length} cards show); tapping a chip can give fewer than its number (Category.tsx:181 counts baseResults)`);
      // The entry filter on /biodiversity and /events.
      await go(page, '/biodiversity'); await ready(page); await openPanel(page);
      const entryOnNature = await tid(page, 'filter-entry-free').count();
      ok(true, 'A', `/biodiversity filter panel: entry chips ${entryOnNature ? 'shown' : 'not shown'}`);
      await ctx.close();
    });
  }

  /* ================= B. Filter state ================= */
  await step('B state', async () => {
    const { ctx, page } = await context(browser, { fixture: true, label: 'B' });
    const H = FX.homestay;
    await go(page, '/homestays'); await ready(page);
    await openPanel(page);
    await tid(page, 'category-location-select').selectOption('Darjeeling');
    await tid(page, 'filter-price-3000').click();
    await tid(page, 'category-sort-select').selectOption('price_asc');
    await tid(page, 'guest-filter-4').click();
    await tid(page, 'category-filter-apply').click();
    const want = expectFor(H, { loc: 'Darjeeling', maxPrice: 3000, sort: 'price_asc', guests: 4 });
    let shown = await ids(page);
    ok(same(shown, want), 'B', 'Darjeeling + under ₹3,000 + cheapest + 4 guests applied', `got [${names(H, shown)}]`);
    const url = page.url();
    const sp = new URL(url).searchParams;
    ok(['price', 'max_price', 'place', 'loc', 'sort'].some((k) => sp.has(k)), 'B', 'the filters are written into the address (shareable, survive reload)', `address is ${url.replace(WEB, '')} - only guests is there; place, price and sort live in React state (Category.tsx:108-117)`);
    // Scroll, open a listing, Back.
    await page.evaluate(() => window.scrollTo(0, 400));
    const y0 = await page.evaluate(() => window.scrollY);
    const first = page.locator(`[data-testid="grid-tile-${shown[shown.length - 1]}"] a`).first();
    await first.click();
    await page.waitForURL(/\/listing\//, { timeout: 8000 });
    // The listing page must really replace the list (lazy route) before Back, as for a traveller.
    await page.locator('[data-testid="category-results"]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.goBack(); await ready(page);
    shown = await ids(page);
    const y1 = await page.evaluate(() => window.scrollY);
    ok(same(shown, want), 'B', 'open a listing, press Back: the same filtered list', `got ${shown.length} cards [${names(H, shown).slice(0, 120)}], want ${want.length}`);
    if (Math.abs(y1 - y0) > 80) ux('B', `Back from a listing does not return to the scroll position (was ${y0}px, now ${y1}px)`);
    await shot(page, 'back-from-listing');
    // Reload.
    await go(page, '/homestays'); await openPanel(page);
    await tid(page, 'filter-price-1500').click(); await tid(page, 'category-filter-apply').click();
    await page.reload({ waitUntil: 'domcontentloaded' }); shown = await ready(page);
    ok(same(shown, expectFor(H, { maxPrice: 1500 })) || sameSet(shown, expectFor(H, { maxPrice: 1500 })), 'B', 'under ₹1,500 survives a reload', `${shown.length} cards after reload, want ${expectFor(H, { maxPrice: 1500 }).length}`);
    // Shared link in a new context: the home panel's own params.
    const { ctx: c2, page: p2 } = await context(browser, { fixture: true, label: 'B shared' });
    await go(p2, '/homestays?near=Ghum&within=5&sort=price_asc');
    shown = await ready(p2);
    const ghum = placeFor('ghum');
    const wantG = H.map((it) => ({ it, d: distOf(ghum, it) })).filter(({ d }) => d && d.km <= 5).sort((a, b) => (Number(a.it.price) || Infinity) - (Number(b.it.price) || Infinity)).map((x) => x.it.id);
    ok(same(shown, wantG), 'B', 'shared /homestays?near=Ghum&within=5&sort=price_asc opens with those filters', `got [${names(H, shown)}] want [${names(H, wantG)}]`);
    const b = await badges(p2);
    const firstB = b[shown[0]] || '';
    const gh = H.find((x) => x.id === shown[0]);
    if (gh) ok(firstB === catKm(distOf(ghum, gh)), 'B', 'near=Ghum: the distance badge is measured from Ghum', `"${firstB}" want "${catKm(distOf(ghum, gh))}"`);
    await openPanel(p2);
    const label = await tid(p2, 'near-me-toggle').innerText();
    if (/My location/i.test(label) && (await tid(p2, 'near-me-toggle').getAttribute('aria-pressed')) === 'true') ux('B', 'near=Ghum shows as "My location" switched on in the panel: the traveller is told it is measuring from them, not from Ghum (Category.tsx:423)');
    // Back/Forward between two filter states.
    await go(p2, '/homestays?guests=6'); await ready(p2);
    await tid(p2, 'category-filter-open').click(); await tid(p2, 'guest-filter-2').click();
    await p2.goBack(); shown = await ids(p2);
    ok(same(shown, expectFor(H, { guests: 6 })), 'B', 'Back after changing guests 6 -> 2 returns to the 6+ list', `${shown.length}`);
    await p2.goForward(); shown = await ids(p2);
    ok(same(shown, expectFor(H, { guests: 2 })), 'B', 'Forward returns to 2+', `${shown.length}`);
    await c2.close();
    // Category switch leaks: /homestays with a place set, then "Search all categories" to /search.
    await go(page, '/homestays'); await ready(page); await openPanel(page);
    await tid(page, 'category-location-select').selectOption('Mirik');
    await tid(page, 'category-filter-apply').click();
    await tid(page, 'category-search-input').fill('momo');
    await tid(page, 'search-all-categories').waitFor({ timeout: 8000 });
    await tid(page, 'search-all-categories').click();
    await page.waitForURL(/\/search\?q=momo/, { timeout: 8000 });
    shown = await ready(page);
    const real = (await apiList({ q: 'momo' })).items || [];
    const f = await shot(page, 'leak-homestays-to-search');
    ok(shown.length === Math.min(real.length, 60), 'B', '"Search all categories" from a filtered /homestays shows every momo result, not ones narrowed by the old place filter', `${shown.length} shown, server has ${real.length} for "momo"; the Mirik place filter carried over (same Category instance, state kept) ${f}`);
    await openPanel(page);
    const locNow = await tid(page, 'category-location-select').inputValue();
    if (locNow !== 'All Locations') ux('B', `after switching from /homestays to /search the place select still says "${locNow}"`);
    // The header's search button from a filtered category page.
    await go(page, '/homestays'); await ready(page); await openPanel(page);
    await tid(page, 'filter-price-1500').click(); await tid(page, 'category-filter-apply').click();
    await tid(page, 'category-search-input').fill('ghum'); await ids(page);
    await tid(page, 'header-search').click();
    await page.waitForURL(/\/search$/, { timeout: 8000 });
    shown = await ready(page);
    const boxNow = await tid(page, 'category-search-input').inputValue();
    const allFx = Object.values(FX).flat().length;
    const fh = await shot(page, 'header-search-leak');
    ok(boxNow === '' && shown.length === allFx, 'B', 'header search button from /homestays opens a fresh /search', `box still says "${boxNow}", ${shown.length} of ${allFx} shown: the homestay search words and ₹1,500 cap carry over (Header.tsx:86 navigate('/search') re-renders the same Category) ${fh}`);
    // Category to category through history (in-app links reuse the same component).
    await go(page, '/homestays'); await ready(page); await openPanel(page);
    await tid(page, 'filter-price-1500').click();
    await page.evaluate(() => { history.pushState({}, '', '/drivers'); dispatchEvent(new PopStateEvent('popstate')); });
    shown = await ready(page);
    const wantD = FX.driver.map((x) => x.id);
    ok(sameSet(shown, wantD), 'B', 'moving from /homestays (under ₹1,500) to /drivers in the app does not carry the price filter', `${shown.length}/${wantD.length} drivers shown`);
    await openPanel(page);
    const priceOn = await page.locator('[data-testid^="filter-price-"][aria-pressed="true"]').allInnerTexts();
    if (!sameSet(shown, wantD)) ux('B', `the carried ₹1,500 cap is invisible on /drivers (its chips are 1,000/2,500/5,000; pressed: [${priceOn.join(',')}])`);
    await ctx.close();
  });

  /* ================= C. Home search and filter panel ================= */
  await step('C home', async () => {
    const { ctx, page } = await context(browser, { label: 'C' });
    await go(page, '/');
    const pill = tid(page, 'booking-widget-pill-where');
    await pill.waitFor({ timeout: 15000 });
    await pill.click();
    await tid(page, 'booking-widget-pill-suggest').waitFor({ timeout: 4000 });
    const pop = await page.locator('[data-testid^="booking-widget-pill-place-"]').allInnerTexts();
    ok(pop.length >= 4, 'C', 'focusing the pill shows popular places', pop.join(', '));
    await pill.fill('mir');
    const resp = page.waitForResponse((r) => /\/api\/listings\?/.test(r.url()) && /q=mir/.test(r.url()), { timeout: 5000 }).catch(() => null);
    const t0 = Date.now(); await resp;
    await page.locator('[data-testid^="booking-widget-pill-listing-"]').first().waitFor({ timeout: 5000 }).catch(() => {});
    const ms = Date.now() - t0;
    const sug = await page.locator('[data-testid^="booking-widget-pill-listing-"]').allInnerTexts();
    ok(sug.length > 0 && /mirik/i.test(sug[0]), 'C', 'typing "mir": Mirik listing suggested first', sug.map((s) => s.replace(/\s+/g, ' ')).join(' / '));
    ok(ms < SLOW_MS, 'G', `home suggestions appear quickly`, `${ms} ms`);
    const placeChips = await page.locator('[data-testid^="booking-widget-pill-place-"]').allInnerTexts();
    ok(placeChips.includes('Mirik'), 'C', '"mir" offers the Mirik place chip', placeChips.join(', '));
    // Keyboard.
    await page.keyboard.press('ArrowDown');
    const act = await page.evaluate(() => ({ tid: document.activeElement?.getAttribute('data-testid'), ad: document.activeElement?.getAttribute('aria-activedescendant') }));
    ok(act.tid !== 'booking-widget-pill-where' || !!act.ad, 'C', 'ArrowDown moves to the first suggestion', `focus stays on the input, no aria-activedescendant (BookingWidget.tsx:359 combobox has no key handling)`);
    await pill.fill('mir'); await page.locator('[data-testid^="booking-widget-pill-listing-"]').first().waitFor({ timeout: 5000 }).catch(() => {});
    await page.keyboard.press('Escape');
    const escOpen = await tid(page, 'booking-widget-pill-suggest').count();
    const escVal = await pill.inputValue();
    ok(escOpen === 0 && escVal === 'mir', 'C', 'Escape closes the suggestions and keeps what was typed', `after one Escape: suggestions ${escOpen ? 'still open' : 'closed'}, box "${escVal}" (type=search clears itself on Escape, onChange -> setMain('') reopens the list: BookingWidget.tsx:290-292,369)`);
    await pill.fill('Ghoom');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/search\?/, { timeout: 8000 });
    const gh = await ready(page);
    const apiGh = (await apiList({ q: 'Ghoom' })).items || [];
    ok(same(gh, apiGh.map((x) => x.id).slice(0, 60)), 'C', 'Enter searches: /search?q=Ghoom shows the server\'s results in its order', `${gh.length} vs ${apiGh.length}`);
    // Tap a listing suggestion.
    await go(page, '/'); await pill.waitFor(); await pill.click(); await pill.fill('tiger');
    const s1 = page.locator('[data-testid^="booking-widget-pill-listing-"]').first();
    await s1.waitFor({ timeout: 5000 });
    const sid = (await s1.getAttribute('data-testid')).replace('booking-widget-pill-listing-', '');
    await s1.click(); await page.waitForURL(new RegExp(`/listing/${sid}`), { timeout: 8000 });
    ok(true, 'C', 'tapping a suggestion opens that listing');
    // Tap a popular place chip.
    await go(page, '/'); await pill.waitFor(); await pill.click();
    await tid(page, 'booking-widget-pill-place-Kurseong').click();
    const v = await pill.inputValue();
    const stillHome = new URL(page.url()).pathname === '/';
    ok(v === 'Kurseong', 'C', 'tapping a place chip fills the search', v);
    if (stillHome) ux('C', 'tapping a popular place chip only fills the box; a second tap on search is needed to see anything (BookingWidget.tsx:222 pickPlace)');
    // Search a place with no listings: helpful answer?
    await page.keyboard.press('Enter'); await page.waitForURL(/\/search\?/, { timeout: 8000 }); const ku = await ready(page);
    const kuTxt = (await tid(page, 'category-empty').innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (!ku.length) {
      const f = await shot(page, 'search-kurseong-empty');
      ux('D', `/search?q=Kurseong (a popular chip) finds nothing and says "${kuTxt.slice(0, 90)}" with no nearby suggestions, other categories or a way to widen the search ${f}`);
    }
    // Home filter panel: the count it promises vs the results it opens.
    const panelCases = [
      { name: 'Everything, Darjeeling, any distance', set: async () => {} },
      { name: 'type Homestay', set: async (p) => p.selectOption('[data-testid="home-filter-type"]', 'homestay') },
      { name: 'type Foods & Shops', set: async (p) => p.selectOption('[data-testid="home-filter-type"]', 'food') },
      { name: 'type Nature', set: async (p) => p.selectOption('[data-testid="home-filter-type"]', 'nature') },
      { name: 'type Places to see', set: async (p) => p.selectOption('[data-testid="home-filter-type"]', 'spot') },
      { name: 'My location within 5 km', set: async (p) => { await tid(p, 'home-filter-me').click(); await p.waitForFunction(() => document.querySelector('[data-testid="home-filter-me"]')?.getAttribute('aria-pressed') === 'true'); await p.locator('[data-testid="home-filter-within"]').fill('5'); } },
      { name: 'Ghum within 10 km', set: async (p) => { await p.selectOption('[data-testid="home-filter-place"]', 'Ghum'); await p.locator('[data-testid="home-filter-within"]').fill('10'); } },
      { name: 'Sukhia Pokhri within 5 km', set: async (p) => { await p.selectOption('[data-testid="home-filter-place"]', 'Sukhia Pokhri'); await p.locator('[data-testid="home-filter-within"]').fill('5'); } },
      { name: 'Simana within 5 km', set: async (p) => { await p.selectOption('[data-testid="home-filter-place"]', 'Simana'); await p.locator('[data-testid="home-filter-within"]').fill('5'); } },
      { name: 'Cheapest first + Homestay', set: async (p) => { await p.selectOption('[data-testid="home-filter-type"]', 'homestay'); await tid(p, 'home-filter-cheap').click(); } },
      { name: 'query "darjeeling" + Everything', q: 'darjeeling', set: async () => {} },
      { name: 'query "tiger" + Places to see', q: 'tiger', set: async (p) => p.selectOption('[data-testid="home-filter-type"]', 'spot') },
    ];
    for (const c of panelCases) {
      await go(page, '/'); await pill.waitFor();
      if (c.q) await pill.fill(c.q);
      await tid(page, 'booking-widget-pill-open').click();
      await tid(page, 'booking-widget-pill-panel').waitFor();
      await c.set(page);
      await page.waitForFunction(() => document.querySelector('[data-testid="home-filter-count"]'), null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(150);
      const promised = Number(await tid(page, 'home-filter-count').textContent().catch(() => '-1'));
      await tid(page, 'booking-widget-panel-search').click();
      await page.waitForURL(/\/search/, { timeout: 8000 });
      const got = await ready(page);
      const u = page.url().replace(WEB, '');
      ok(promised === got.length, 'C', `home panel "${c.name}": the Search N count matches the results page`, `promised ${promised}, page shows ${got.length} (${u})`);
      if (/Cheapest/.test(c.name)) {
        const prices = await page.locator('[data-testid="category-results"] [data-testid^="grid-tile-"]').evaluateAll((els) => els.map((e) => Number((e.innerText.match(/₹\s?([\d,]+)/) || [0, '0'])[1].replace(/,/g, ''))));
        ok(prices.every((x, i) => i === 0 || x >= prices[i - 1]), 'C', 'home panel Cheapest first: results page is cheapest first', prices.slice(0, 8).join(','));
      }
      if (/within/.test(c.name) && c.name !== 'My location within 5 km') {
        const place = c.name.split(' within')[0];
        if (!placeFor(place)) ux('C', `home panel place "${place}" has no known coordinates (HUBS vs places.ts: "Sukhia Pokhri" is keyed "sukhiapokhri", "Simana"/"Sikkim" are missing), so "within N km" is silently ignored on both the count and the results (HomeFilterPanel.tsx:54, Category.tsx:138)`);
      }
    }
    // Panel: Escape closes it; Clear filters only when active.
    await go(page, '/'); await pill.waitFor(); await tid(page, 'booking-widget-pill-open').click();
    await tid(page, 'booking-widget-pill-panel').waitFor();
    const clearShown = await tid(page, 'home-filter-clear').count();
    if (clearShown === 0) ux('C', 'home panel opens on "Darjeeling" but offers no Clear filters until something else is changed (the prototype starts with no place); picking "Any place" back is the only way to clear the place');
    await shot(page, 'home-panel-390');
    const over = await sideways(page); ok(over <= 2, 'G', 'home with the filter panel open: no sideways scroll at 390px', `${over}px`);
    await page.keyboard.press('Escape');
    ok((await tid(page, 'booking-widget-pill-panel').count()) === 0, 'C', 'Escape closes the home filter panel');
    // Category tiles.
    await go(page, '/');
    const tiles = await page.locator('.ag-home-tiles a.ag-home-tile').evaluateAll((els) => els.map((e) => [e.getAttribute('href'), e.textContent.trim().slice(0, 30)]));
    const expectHref = ['/homestays', '/drivers', '/spots', '/cafes', '/guides', '/shops'];
    ok(expectHref.every((h) => tiles.some(([x]) => x === h)), 'C', 'home category tiles link to their pages', tiles.map((x) => x.join('=')).join(', '));
    for (const h of expectHref) {
      await go(page, '/'); await page.locator(`.ag-home-tiles a.ag-home-tile[href="${h}"]`).first().click();
      await page.waitForURL(new RegExp(`${h}$`), { timeout: 8000 }).catch(() => {});
      const n = (await ready(page)).length;
      ok(new URL(page.url()).pathname === h && n > 0, 'C', `tile ${h} opens its list with cards`, `${n}`);
    }
    await ctx.close();
  });

  /* ================= D. /search ================= */
  await step('D search', async () => {
    const { ctx, page } = await context(browser, { label: 'D' });
    const cases = [
      ['Darjeeling', { min: 10 }], ['darjeeling', { min: 10 }], ['Ghum', { first: /ghum/i }], ['Ghoom', { first: /ghum/i }], ['Mirik', { first: /mirik/i }],
      ['Kurseong', {}], ['Kalimpong', {}], ['Sittong', {}],
      ['darjeling', { min: 10, dym: 'darjeeling' }], ['mirk', { first: /mirik/i, dym: 'mirik' }], ['homstay', { type: 'homestay', dym: 'homestay' }],
      ['taxi to tiger hill', { type: 'driver', min: 1 }], ['cheap stay in ghoom', { type: 'homestay' }], ['cafe under 300', { type: 'cafe', maxPrice: 300 }],
      ['momo', { min: 1 }], ['trek guide', { type: 'guide' }],
      ['दार्जिलिंग', { min: 10 }], ['होमस्टे', { type: 'homestay', min: 1 }], ['मिरिक', { first: /mirik/i }], ['দার্জিলিং', { min: 10 }],
      ['TIGER hill', { first: /tiger hill/i }], ['   tiger    hill  ', { first: /tiger hill/i }], ['tiger-hill!', { first: /tiger hill/i }], ['tiger hill 🌄', { first: /tiger hill/i }],
      ['ghoom monastery', { first: /ghum monastery/i }], ['red panda', { first: /red panda/i }], ['tigr hil', { first: /tiger hill/i }],
      ['🌄', {}], ['+91 98765 43210', {}], ['x'.repeat(400), {}],
    ];
    for (const [q, want] of cases) {
      const smart = page.waitForResponse((r) => /\/api\/listings\?/.test(r.url()) && new URL(r.url()).searchParams.get('limit') === '60' && (new URL(r.url()).searchParams.get('q') || '') === q.trim(), { timeout: 10000 }).catch(() => null);
      await page.goto(`${WEB}/search?q=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded' });
      if (!(await smart)) ok(false, 'D', `${JSON.stringify(q.slice(0, 20))}: the page asked the smart search`, 'no /listings?q= call seen');
      const shown = await ready(page);
      const api = (await apiList({ q, limit: '60' }));
      const items = api.items || [];
      const lbl = JSON.stringify(q.length > 30 ? q.slice(0, 20) + '…' : q);
      ok(same(shown, items.map((x) => x.id)), 'D', `${lbl}: page shows the server's results in its order`, `${shown.length} shown, ${items.length} from the API`);
      const titles = items.map((x) => `${x.type}:${x.title}`);
      if (want.min) ok(items.length >= want.min, 'D', `${lbl}: finds results`, `${items.length} (${titles.slice(0, 3).join(', ')}); interpretation ${JSON.stringify(api.search)}`);
      if (want.first) ok(items.length && want.first.test(items[0].title), 'D', `${lbl}: best match first`, titles.slice(0, 3).join(', ') || 'nothing');
      if (want.type) ok(api.search?.type === want.type && items.every((x) => x.type === want.type), 'D', `${lbl}: reads the kind (${want.type})`, `understood type ${api.search?.type}; ${items.length} results, types ${[...new Set(items.map((x) => x.type))].join(',')}`);
      if (want.type && !items.length) ux('D', `${lbl}: no ${want.type} matches every word, and the answer is a dead end instead of the nearest or all ${want.type}s (search.ts rank() returns [] when no listing has every term; Category.tsx:305 looks elsewhere only on a typed category page)`);
      if (want.maxPrice) ok(items.every((x) => x.price > 0 && x.price <= want.maxPrice), 'D', `${lbl}: every result within the budget`);
      if (want.dym) {
        const dym = await tid(page, 'search-did-you-mean').innerText().catch(() => '');
        ok(dym.toLowerCase() === want.dym, 'D', `${lbl}: "Did you mean ${want.dym}"`, dym || 'not shown');
      }
      const understood = await tid(page, 'search-understood').innerText().catch(() => '');
      if (want.type && !understood) ux('D', `${lbl}: no "Showing ..." line tells the traveller the search was read as ${want.type}`);
      if (!shown.length) {
        const txt = (await tid(page, 'category-empty').innerText().catch(() => '')).replace(/\s+/g, ' ');
        const actions = await page.locator('[data-testid="category-empty"] a, [data-testid="category-empty"] button').allInnerTexts();
        if (!actions.length) ux('D', `${lbl}: empty answer "${txt.slice(0, 70)}" offers nothing to tap (no browse categories, no popular places, no "did you mean")`);
      }
      const flash = await page.evaluate(() => window.__seen);
      const flashEmpty = flash.findIndex((s) => s.empty) >= 0 && flash.some((s, i) => s.n > 0 && i > flash.findIndex((x) => x.empty));
      if (flashEmpty) ux('G', `${lbl}: "Nothing found" flashes before the results arrive (plain substring filter of the first 60 listings renders first, then the smart results: Category.tsx:194-207)`, JSON.stringify(flash.slice(0, 5)));
      const wrong = flash.some((s, i) => i > 0 && s.n > 0 && flash[i - 1].n > 0 && s.n !== flash[i - 1].n);
      if (wrong && !flashEmpty) ux('G', `${lbl}: the result list jumps (shows ${flash.map((s) => s.n).join(' -> ')} cards) as the smart answer replaces the plain one`);
      if (['दार्जिलिंग', 'Darjeeling', 'Kurseong'].includes(q)) await shot(page, `search-${q === 'दार्जिलिंग' ? 'hindi' : q}`);
    }
    // Speed of the real flow: type on home, press Enter, results settle.
    for (const q of ['tiger hill', 'darjeling', 'cheap stay', 'Mirik']) {
      await go(page, '/'); const pill = tid(page, 'booking-widget-pill-where'); await pill.waitFor({ timeout: 15000 });
      await pill.fill(q);
      await page.evaluate(() => { window.__seen = []; });
      const t0 = Date.now();
      const smart = page.waitForResponse((r) => /\/api\/listings\?/.test(r.url()) && new URL(r.url()).searchParams.get('q') === q && new URL(r.url()).searchParams.get('limit') === '60', { timeout: 8000 }).catch(() => null);
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/search\?/, { timeout: 8000 });
      await smart;
      await ids(page, 4000);
      const ms = Date.now() - t0 - 240; // ids() needs ~240 ms of stillness to call it settled
      ok(ms < SLOW_MS, 'G', `home "${q}" + Enter: results settle in time`, `${ms} ms`);
      const flash = await page.evaluate(() => window.__seen);
      const ei = flash.findIndex((s) => s.empty);
      if (ei >= 0 && flash.slice(ei).some((s) => s.n > 0)) ux('G', `home "${q}" + Enter: "Nothing found" shows first, then the results replace it (the plain substring filter of the first 60 listings renders before the smart answer: Category.tsx:194-207, 250 ms debounce at :156)`, flash.map((s) => `${s.t}ms:${s.empty ? 'EMPTY' : s.n}`).join(' '));
      else if (flash.filter((s) => s.n > 0).map((s) => s.n).some((n, i, a) => i > 0 && n !== a[i - 1])) ux('G', `home "${q}" + Enter: the list jumps as the smart answer replaces the plain one`, flash.map((s) => `${s.t}ms:${s.empty ? 'EMPTY' : s.n}`).join(' '));
    }
    // Empty query.
    await go(page, '/search?q=');
    const e = await ready(page);
    const head = await page.locator('h1').first().innerText().catch(() => '');
    ok(true, 'D', `/search?q= (empty) shows ${e.length} cards under "${head}"`);
    if (e.length && e.length < totalApi) ux('D', `/search with an empty query lists ${e.length} of ${totalApi} listings in table order (the capped 60), with no prompt to type or pick a category`);
    // Did you mean click.
    await go(page, '/search?q=tigr%20hil'); await ready(page);
    if (await tid(page, 'search-did-you-mean').count()) {
      await tid(page, 'search-did-you-mean').click();
      await page.waitForURL(/q=tiger/, { timeout: 5000 }).catch(() => {});
      ok(/q=tiger/.test(page.url()), 'D', 'tapping "Did you mean" searches the corrected words', page.url().replace(WEB, ''));
    }
    // Typing speed on a category page.
    await go(page, '/homestays'); await ready(page);
    const t0 = Date.now();
    const r = page.waitForResponse((x) => /\/api\/listings\?.*q=live/i.test(x.url()), { timeout: 6000 }).catch(() => null);
    await tid(page, 'category-search-input').fill('live');
    await r; await ids(page);
    const ms = Date.now() - t0;
    ok(ms < SLOW_MS, 'G', 'typing in a category search: smart results in time', `${ms} ms`);
    // Visible result count.
    const visibleCount = await page.evaluate(() => [...document.querySelectorAll('p,span,h2')].some((e) => /\b\d+ results?\b/.test(e.textContent) && e.offsetParent && !e.closest('.sr-only') && !e.classList.contains('sr-only')));
    if (!visibleCount) ux('D', 'no visible result count on search/category pages: "N results" is screen-reader only (Category.tsx:491); the number shows only inside the closed filter panel');
    await ctx.close();
  });

  /* ================= E. Find a ride ================= */
  await step('E ride', async () => {
    const { ctx, page } = await context(browser, { label: 'E' });
    await go(page, '/drivers'); await ready(page);
    await tid(page, 'ride-go').click();
    ok(await page.locator('[data-testid="ride-search"] [role="alert"]').count() > 0, 'E', 'Search drivers with nothing filled asks for from and to');
    const tomorrow = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10);
    await tid(page, 'ride-from').fill('NJP'); await tid(page, 'ride-to').fill('Darjeeling'); await tid(page, 'ride-date').fill(tomorrow);
    const req = page.waitForRequest((r) => /available_on=/.test(r.url()), { timeout: 6000 }).catch(() => null);
    await tid(page, 'ride-go').click();
    const rq = await req;
    ok(!!rq && rq.url().includes(`available_on=${tomorrow}`), 'E', 'the day goes to the server as available_on', rq?.url().replace(/^.*\/api/, '/api'));
    const shown = await ready(page);
    const api = (await apiList({ type: 'driver', available_on: tomorrow })).items || [];
    ok(sameSet(shown, api.map((x) => x.id)), 'E', 'every driver free that day is listed', `${shown.length} shown, ${api.length} free`);
    const sp = new URL(page.url()).searchParams;
    ok(sp.get('from') === 'NJP' && sp.get('to') === 'Darjeeling' && sp.get('check_in') === tomorrow, 'E', 'from, to and day are in the address', page.url().replace(WEB, ''));
    ok(await tid(page, 'ride-free-on').count() > 0, 'E', '"Drivers free on <day>" shows');
    const covers = api.filter((d) => (d.extras?.routes || []).some((r) => /njp/i.test(r.route || r) && /darjeeling/i.test(r.route || r)));
    ok(covers.length > 0 && covers.every((d) => shown.indexOf(d.id) < shown.length - (shown.length - covers.length)), 'E', 'drivers whose routes cover NJP -> Darjeeling come first', `${covers.map((d) => d.title).join(', ')} at ${covers.map((d) => shown.indexOf(d.id)).join(',')}`);
    const heading = await tid(page, 'trip-unlisted-heading').count();
    ok(heading === 1, 'E', '"May also do this trip" heading splits the rest');
    if (covers[0]) {
      const card = (await page.locator(`[data-testid="grid-tile-${covers[0].id}"]`).innerText()).replace(/\s+/g, ' ');
      const fare = (covers[0].extras.routes.find((r) => /njp/i.test(r.route)) || {}).price;
      ok(card.includes(Number(fare).toLocaleString('en-IN')), 'E', `the covering driver's card shows the NJP -> Darjeeling fare (₹${fare})`, `card says "${card.slice(0, 120)}" (the day rate; prototype ridesearch shows the fare for that ride)`);
      await shot(page, 'ride-search-results');
      // Reserve carries the trip into the booking form.
      await page.locator(`[data-testid="grid-cta-${covers[0].id}"]`).click();
      await page.waitForURL(/\/listing\//, { timeout: 8000 });
      const lu = new URL(page.url()).searchParams;
      ok(lu.get('from') === 'NJP' && lu.get('to') === 'Darjeeling' && lu.get('check_in') === tomorrow, 'E', 'Reserve carries from, to and day to the listing', page.url().replace(WEB, ''));
      const cta = tid(page, 'mobile-sticky-cta');
      await cta.waitFor({ timeout: 10000 }).catch(() => {});
      if (await cta.count()) await cta.click().catch(() => {});
      await tid(page, 'booking-from').waitFor({ timeout: 10000 }).catch(() => {});
      const bf = await tid(page, 'booking-from').inputValue().catch(() => '?');
      const bt = await tid(page, 'booking-to').inputValue().catch(() => '?');
      const bd = await tid(page, 'booking-date').first().inputValue().catch(() => '?');
      const br = await tid(page, 'booking-route').inputValue().catch(() => '?');
      ok(bf === 'NJP' && bt === 'Darjeeling' && bd === tomorrow, 'E', 'the booking form starts with from, to and the day', `from "${bf}", to "${bt}", day "${bd}"`);
      const rate = (await tid(page, 'booking-rate').innerText().catch(() => '')).replace(/\s+/g, ' ');
      const total = (await tid(page, 'booking-breakdown').innerText().catch(() => '')).replace(/\s+/g, ' ');
      const f = await shot(page, 'ride-booking-form');
      ok(/njp/i.test(br), 'E', 'the booking form picks the NJP -> Darjeeling route and its fare', `route "${br}", rate "${rate}", breakdown "${total.slice(0, 60)}" - the trip the traveller searched (₹${fare}) is not picked, the form quotes the day rate ${f}`);
      await go(page, `/drivers?from=NJP&to=Darjeeling&check_in=${tomorrow}`); await ready(page);
    }
    // Clear.
    await tid(page, 'ride-clear').click();
    await page.waitForFunction(() => !new URL(location.href).searchParams.get('from'), null, { timeout: 4000 }).catch(() => {});
    const after = new URL(page.url()).searchParams;
    ok(!after.get('from') && !after.get('to'), 'E', 'Clear removes from and to');
    if (after.get('check_in')) ux('E', `Clear leaves the day (check_in=${after.get('check_in')}) so the list stays "Drivers free on ..." with no visible way to drop the day except the date box`);
    const hasSwap = await page.locator('[data-testid="ride-swap"], [aria-label*="wap"]').count();
    if (!hasSwap) ux('E', 'Find a ride has no swap button between From and To (a return trip means retyping both)');
    // Same from and to.
    await tid(page, 'ride-from').fill('Darjeeling'); await tid(page, 'ride-to').fill('Darjeeling'); await tid(page, 'ride-go').click();
    await page.waitForTimeout(300);
    if (!(await page.locator('[data-testid="ride-search"] [role="alert"]').count())) ux('E', 'Find a ride accepts the same place for From and To without a word');
    // A trip no route mentions: does anything show?
    await go(page, '/search?type=driver&from=Darjeeling&to=Tiger%20Hill'); const th = await ready(page);
    ok(th.length > 0, 'E', 'home Drivers tab Darjeeling -> Tiger Hill lists drivers', `${th.length}`);
    // The prototype's pickup time.
    if (!(await page.locator('[data-testid="ride-search"] input[type="time"]').count())) ux('E', 'Find a ride has no pickup time (prototype ridesearch.js has one and carries it to the booking)');
    await ctx.close();
  });

  /* ================= F. Saved pills, Feed filter, My trips tiles ================= */
  await step('F saved feed trips', async () => {
    const u = await signIn('Search Audit');
    const o = await call('/payments/order', { method: 'POST', token: u.token, body: { flow: 'platform_support', reference_id: u.id } });
    await call('/payments/mock/complete', { method: 'POST', token: u.token, body: { order_id: o.data?.order?.id, flow: 'platform_support', reference_id: u.id } });
    const picks = [by.homestay[0], by.driver[0], by.spot.find((s) => s.extras?.published !== false) || by.spot[0]].filter(Boolean);
    for (const p of picks) { const r = await call('/favorites', { method: 'POST', token: u.token, body: { listing_id: p.id } }); if (r.status !== 200) ok(false, 'F', `could not save ${p.title}`, `${r.status} ${JSON.stringify(r.data).slice(0, 100)}`); }
    const { ctx, page } = await context(browser, { user: u, label: 'F' });
    await go(page, '/saved');
    await tid(page, 'saved-pills').waitFor({ timeout: 10000 }).catch(() => {});
    const pills = await page.locator('[data-testid="saved-pills"] button').allInnerTexts();
    ok(pills.length === picks.length + 1, 'F', 'Saved: Everything plus one pill per kind', pills.map((p) => p.replace(/\s+/g, ' ')).join(' | '));
    const allN = Number((pills[0] || '').match(/\d+/)?.[0]);
    ok(allN === picks.length, 'F', 'Saved: Everything counts every saved place', `${allN}`);
    for (const p of picks) {
      const pill = tid(page, `saved-pill-${p.type}`);
      if (!(await pill.count())) { ok(false, 'F', `Saved: a pill for ${p.type}`); continue; }
      await pill.click();
      const groups = await page.locator('[data-testid^="saved-group-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
      ok(groups.length === 1 && groups[0] === `saved-group-${p.type}`, 'F', `Saved pill ${p.type}: only that group`, groups.join(','));
    }
    await shot(page, 'saved-pills');
    // Feed filter.
    await go(page, '/feed');
    await tid(page, 'feed-filter').click();
    await tid(page, 'feed-filter-sheet').waitFor();
    await tid(page, 'feed-show-all').locator('input').uncheck();
    await tid(page, 'feed-show-plans').locator('input').check();
    await tid(page, 'feed-filter-done').click();
    const plansOn = await tid(page, 'feed-plans').count();
    const postsOn = await page.locator('[data-testid="feed-list"], [data-testid="feed-empty"]').count();
    ok(plansOn === 1 && postsOn === 0, 'F', 'Feed filter "Trip plans" only: plans show, host posts hide', `plans ${plansOn}, posts ${postsOn}`);
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle').catch(() => {});
    ok((await tid(page, 'feed-plans').count()) === 1 && (await page.locator('[data-testid="feed-list"], [data-testid="feed-empty"]').count()) === 0, 'F', 'Feed filter survives a reload');
    await tid(page, 'feed-filter').click(); await tid(page, 'feed-show-plans').locator('input').uncheck();
    ok(await tid(page, 'feed-nothing-picked').count() === 1, 'F', 'Feed with nothing ticked says so');
    await tid(page, 'feed-filter-clear').click();
    ok((await tid(page, 'feed-plans').count()) === 1 && (await page.locator('[data-testid="feed-list"], [data-testid="feed-empty"]').count()) === 1, 'F', 'Feed Clear filters shows everything again');
    // My trips: a new traveller.
    await go(page, '/my-trips');
    ok(await tid(page, 'trips-empty').count() === 1 || await tid(page, 'trip-stats').count() === 1, 'F', 'My trips opens (no bookings: empty state)');
    await ctx.close();
  });

  /* ================= G. Dark mode legibility and desktop ================= */
  await step('G dark', async () => {
    const { ctx, page } = await context(browser, { fixture: true, label: 'G dark' });
    await go(page, '/homestays'); await ready(page);
    const mode = tid(page, 'header-mode');
    if (await mode.count()) await mode.click();
    await page.waitForFunction(() => document.documentElement.getAttribute('data-mode') === 'dark', null, { timeout: 4000 }).catch(() => {});
    await openPanel(page); await nearOn(page); await tid(page, 'near-10').click(); await tid(page, 'filter-price-3000').click();
    const low = await page.evaluate(() => {
      const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(',').map(Number); return { r, g, b, a }; };
      const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c; } return { r: 255, g: 255, b: 255 }; };
      const out = [];
      const els = document.querySelectorAll('[data-testid="category-filter-panel"] button, [data-testid="category-filter-panel"] select, [data-testid="category-filter-panel"] span, [data-testid="category-search-input"], .ag-category-svpill, .qph');
      for (const el of els) {
        if (!el.offsetParent || !el.textContent.trim() && el.tagName !== 'INPUT') continue;
        const fg = parse(getComputedStyle(el).color); const bg = bgOf(el); if (!fg) continue;
        const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        if (ratio < 4.5) out.push(`${(el.getAttribute('data-testid') || el.className || el.tagName).toString().slice(0, 30)} "${el.textContent.trim().slice(0, 18)}" ${ratio.toFixed(2)}`);
      }
      return [...new Set(out)];
    });
    const f = await shot(page, 'dark-filter-panel');
    ok(low.length === 0, 'G', 'dark mode: filter panel text has at least 4.5:1 contrast', `${low.slice(0, 8).join('; ')} ${f}`);
    await ctx.close();
  });

  await browser.close();
  console.log('');
  if (!problems.length) console.log('ALL SEARCH AND FILTER CHECKS PASSED');
  else { console.log(`${problems.length} problems:`); for (const p of problems) console.log(p); }
})();
