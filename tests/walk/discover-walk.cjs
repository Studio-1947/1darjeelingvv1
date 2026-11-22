// Discovery and social features, walked as real travellers in a browser: home search (typed hint, mic,
// suggestions, results, empty answer), category tiles, the home filter panel, See all, /search,
// listing and spot pages (photos, directions, reviews, share, save), Saved, trip plans between four
// travellers (create, ask to join, confirm, decline, leave, save, delete, with the notifications each
// one gets), Suggest a place (pending, approved and published, rejected), the Feed (weather, title
// track, Plan a trip, business websites), Notifications (links, mark all read, bell count), the real
// sign-in screen and sign-out. Phone width (390) with the key screens again at 1280.
//
// Run against a LOCAL stack only (MESSAGING_PROVIDER=mock, MOCK_PAYMENTS=true, rate limiting off):
//   ADMIN_PASSWORD=<local admin pw> WEB=http://localhost:3000 API=http://localhost:8001/api \
//   PLAYWRIGHT=<path to @playwright/test or playwright> node tests/walk/discover-walk.cjs [screenshot dir]
// Prints one OK/FAIL line per check, then ALL DISCOVERY FLOWS WORK or one line per problem.
// It creates its own travellers, trip plans and place suggestions; the test spot it publishes is
// deleted again at the end.
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'C:/Users/soumi/Desktop/1darjeelingvv1/frontend/node_modules/@playwright/test');

const WEB = process.env.WEB || 'http://127.0.0.1:3100';
const API = process.env.API || 'http://127.0.0.1:8020/api';
const OUT = process.argv[2] || path.join(process.cwd(), 'discover-walk-out');
const PHOTO = path.join(__dirname, '../../frontend/public/media/spots/tiger.jpg');
fs.mkdirSync(OUT, { recursive: true });

const problems = [];
let shotN = 0;
const ok = (c, step, msg, extra = '') => {
  console.log(`${c ? 'OK  ' : 'FAIL'} [${step}] ${msg}${extra ? ' | ' + extra : ''}`);
  if (!c) problems.push(`[${step}] ${msg}${extra ? ' | ' + extra : ''}`);
  return c;
};
const ux = (step, msg) => { console.log(`UX   [${step}] ${msg}`); problems.push(`UX [${step}] ${msg}`); };

async function call(p, { method = 'GET', token, body } = {}) {
  const r = await fetch(API + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch { /* empty */ }
  return { status: r.status, data };
}

async function signIn(name) {
  const phone = `+9197${String(Date.now()).slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
  const s = await call('/auth/otp/send', { method: 'POST', body: { phone, channel: 'whatsapp' } });
  const v = await call('/auth/otp/verify', { method: 'POST', body: { phone, otp: s.data?.mock_otp || '123456', name, role: 'tourist' } });
  if (!v.data?.token) throw new Error('sign-in failed: ' + JSON.stringify(v.data));
  return { token: v.data.token, id: v.data.user.id, name, phone };
}

/** The yearly pass (saving places needs it), paid through the mock gateway. */
async function buyPass(u) {
  const o = await call('/payments/order', { method: 'POST', token: u.token, body: { flow: 'platform_support', reference_id: u.id } });
  const id = o.data?.order?.id;
  const c = await call('/payments/mock/complete', { method: 'POST', token: u.token, body: { order_id: id, flow: 'platform_support', reference_id: u.id } });
  return c.status;
}

const IGNORE_CONSOLE = [/Download the React DevTools/, /\[vite\]/, /favicon/, /service-worker/i, /Failed to load resource/, /maps\.googleapis|tile|openstreetmap/i, /accounts\.google\.com/];

async function context(browser, { user = null, width = 390, geo = false, label }) {
  const ctx = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
    permissions: ['clipboard-read', 'clipboard-write', ...(geo ? ['geolocation'] : [])],
    ...(geo ? { geolocation: { latitude: 27.0418, longitude: 88.2663, accuracy: 20 } } : {}),
  });
  await ctx.addInitScript(([token]) => {
    try {
      if (token) localStorage.setItem('token', token);
      localStorage.setItem('mode', 'tourist');
      sessionStorage.setItem('aangan-splash-seen', '1');
    } catch { /* about:blank */ }
  }, [user?.token || null]);
  // Google Maps never really opens; the walk only checks where Direction points.
  await ctx.route(/https:\/\/(www\.)?google\.com\/maps.*/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>maps</p>' }));
  const page = await ctx.newPage();
  page.allow = []; // regexes of API answers expected in the current step ("402 /favorites")
  page.on('pageerror', (e) => problems.push(`[${label} ${width}px] ${page.url().replace(WEB, '')}: crash: ${e.message.slice(0, 160)}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (IGNORE_CONSOLE.some((r) => r.test(t))) return;
    problems.push(`[${label} ${width}px] ${page.url().replace(WEB, '')}: console error: ${t.slice(0, 160)}`);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (!u.includes('/api/')) return;
    const s = r.status();
    if (s < 400) return;
    const short = `${s} ${r.request().method()} ${u.replace(/^.*\/api/, '/api').split('?')[0]}`;
    if (page.allow.some((re) => re.test(short))) return;
    // Known harmless: a listing with no reviews endpoint data, and the bell asked while signing out.
    if (/^404 GET \/api\/listings\/[^/]+\/reviews/.test(short)) return;
    problems.push(`[${label} ${width}px] ${page.url().replace(WEB, '')}: API ${short}`);
  });
  page.on('dialog', (d) => d.accept());
  return { ctx, page };
}

async function go(page, p) {
  await page.goto(WEB + p, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
}
const tid = (page, id) => page.locator(`[data-testid="${id}"]`);
const visible = async (loc, timeout = 8000) => loc.first().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
async function shot(page, name) {
  const file = path.join(OUT, `${String(++shotN).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  return file;
}
async function layout(page, step, where) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 2, step, `${where}: no sideways scroll`, over > 2 ? `${over}px` : '');
  const nf = await page.locator('[data-testid=not-found]').count();
  ok(nf === 0, step, `${where}: not "page not found"`);
}
async function step(name, fn) {
  try { await fn(); } catch (e) { ok(false, name, 'step threw', e.message.split('\n')[0].slice(0, 200)); }
}
const titlesOf = async (page) => (await page.locator('[data-testid^="grid-tile-"]').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
async function results(page) {
  await page.locator('[data-testid="category-results"], [data-testid="category-empty"]').first().waitFor({ timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(700); // the smart search answers 250 ms after the plain match
  return titlesOf(page);
}
async function unreadBadge(page) {
  const b = tid(page, 'header-unread');
  return (await b.count()) ? (await b.first().innerText()).trim() : '0';
}
async function notes(u) { return (await call('/notifications', { token: u.token })).data || { items: [], unread_count: 0 }; }
async function homeSearch(page, text) {
  const box = tid(page, 'booking-widget-pill-where');
  await box.click();
  await box.fill(text);
  await page.waitForTimeout(450);
  await page.locator('[data-testid="booking-widget-pill-suggest"]').waitFor({ timeout: 5000 }).catch(() => {});
  // The listing matches come 300 ms after typing stops.
  await page.locator('[data-testid^="booking-widget-pill-listing-"]').first().waitFor({ timeout: 5000 }).catch(() => {});
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE });
  const all = (await call('/listings?limit=200')).data?.items || [];
  const byType = (t) => all.filter((x) => x.type === t);
  const stay = byType('homestay')[0];
  const driver = byType('driver')[0];
  const spot = all.find((x) => x.type === 'spot' && /mirik/i.test(x.title)) || byType('spot')[0];
  ok(!!(stay && driver && spot), 'setup', 'local stack has a homestay, a driver and a spot', `${stay?.title} / ${driver?.title} / ${spot?.title}`);

  const T = Date.now().toString().slice(-5);
  const A = await signIn(`Asha Walk${T}`);
  const B = await signIn(`Bikash Walk${T}`);
  const C = await signIn(`Chhiring Walk${T}`);
  const D = await signIn(`Dawa Walk${T}`);
  const admin = (await call('/auth/admin/login', { method: 'POST', body: { phone: 'admin', password: process.env.ADMIN_PASSWORD } })).data?.token;
  ok(!!admin, 'setup', 'admin token (ADMIN_PASSWORD set)');

  // ---------------- 1. Home search ----------------
  const { ctx: aCtx, page: a } = await context(browser, { user: A, label: 'A' });
  await step('1 home search', async () => {
    await go(a, '/');
    ok(await visible(tid(a, 'booking-widget-pill-where')), '1 home search', 'search pill shows');
    const h1 = (await tid(a, 'search-hint').innerText().catch(() => '')).trim();
    await a.waitForTimeout(1800);
    const h2 = (await tid(a, 'search-hint').innerText().catch(() => '')).trim();
    ok(h1 !== h2, '1 home search', 'typewriter hint moves', `"${h1}" -> "${h2}"`);
    const hintBox = await a.locator('.ag-home-qph').innerText().catch(() => '');
    if (!/search/i.test(hintBox)) ux('1 home search', `the resting hint shows a bare word ("${hintBox.trim()}") with no "Search" in front; the prototype reads "Search for <word>" (v7.js searchBox: T('searchfor') + qword)`);
    ok((await tid(a, 'booking-widget-voice').count()) > 0, '1 home search', 'mic button is drawn (browser can listen)');
    ok((await tid(a, 'booking-widget-pill-open').count()) > 0, '1 home search', 'filter button is drawn');
    await shot(a, 'home-390');

    // "momo": the dropdown and the results page.
    await homeSearch(a, 'momo');
    const drop = await a.locator('[data-testid^="booking-widget-pill-listing-"]').allInnerTexts();
    ok(drop.length > 0 && drop.every((t) => /cafe/i.test(t)), '1 home search', '"momo" suggestions are cafes serving momos', drop.map((t) => t.split('\n')[0]).join(', '));
    await shot(a, 'home-momo-dropdown');
    await tid(a, 'booking-widget-pill-where').press('Enter');
    await a.waitForURL(/\/search\?/, { timeout: 8000 });
    const momoUrl = a.url().replace(WEB, '');
    const momo = await results(a);
    const momoShot = await shot(a, 'home-momo-results');
    const cafes = momo.filter((t) => /cafe/i.test(t)).length;
    ok(momo.length > 0 && cafes === momo.length, '1 home search', '"momo" from home lists the cafes that serve momos',
      `${momoUrl}: ${momo.length} results, ${cafes} cafes, first: ${momo.slice(0, 3).join(' / ').slice(0, 120)} (${momoShot})`);
    const heading = (await a.locator('.ag-pagehead h1').first().innerText().catch(() => '')).trim();
    ok(/momo/i.test(heading) || /momo/i.test(await tid(a, 'category-search-input').inputValue().catch(() => '')), '1 home search', 'results page says what was searched', `h1 "${heading}"`);

    // A homestay by its name: suggestion -> listing.
    await go(a, '/');
    await homeSearch(a, stay.title);
    const opt = tid(a, `booking-widget-pill-listing-${stay.id}`);
    const optTexts = await a.locator('[data-testid^="booking-widget-pill-listing-"]').allInnerTexts();
    ok(await opt.count() > 0, '1 home search', `typing "${stay.title}" offers that homestay`, optTexts.map((t) => t.split('\n')[0]).join(', '));
    ok(optTexts[0]?.startsWith(stay.title), '1 home search', 'the exact name is the first suggestion', `first: ${optTexts[0]?.split('\n')[0]}`);
    if (await opt.count()) {
      await opt.click();
      await a.waitForURL(new RegExp(`/listing/${stay.id}`), { timeout: 8000 });
      ok((await tid(a, 'listing-title').innerText()).includes(stay.title), '1 home search', 'tapping the suggestion opens the homestay');
    }

    // A place: Mirik.
    await go(a, '/');
    await homeSearch(a, 'Mirik');
    ok(await tid(a, 'booking-widget-pill-place-Mirik').count() > 0, '1 home search', '"Mirik" offers the Mirik place chip');
    const mirikDrop = await a.locator('[data-testid^="booking-widget-pill-listing-"]').allInnerTexts();
    ok(mirikDrop.some((t) => /mirik/i.test(t)), '1 home search', '"Mirik" suggests Mirik listings', mirikDrop.map((t) => t.split('\n')[0]).join(', '));
    await tid(a, 'booking-widget-pill-where').press('Enter');
    await a.waitForURL(/\/search\?/, { timeout: 8000 });
    const mirik = await results(a);
    const mirikUrl = a.url().replace(WEB, '');
    const elsewhere = await tid(a, 'results-elsewhere').count();
    const mirikShot = await shot(a, 'home-mirik-results');
    const mirikAny = mirik.some((t) => /mirik/i.test(t));
    ok(mirikAny, '1 home search', '"Mirik" from home finds Mirik Lake', `${mirikUrl}: ${mirik.length} tiles; ${mirik.slice(0, 3).join(' / ').slice(0, 100)} (${mirikShot})`);
    if (elsewhere) ux('1 home search', `"Mirik" from the home search opens ${mirikUrl} and answers "no homestays" first, Mirik Lake only under "found elsewhere"; the prototype filters every kind of place (app.js filtered(): no category on Home) (${mirikShot})`);

    // Nothing matches.
    await go(a, '/');
    await homeSearch(a, 'zzqxw');
    await tid(a, 'booking-widget-pill-where').press('Enter');
    await a.waitForURL(/\/search\?/, { timeout: 8000 });
    await results(a);
    const empty = tid(a, 'category-empty');
    const emptyText = (await empty.innerText().catch(() => '')).replace(/\s+/g, ' ');
    ok(await empty.count() > 0 && emptyText.length > 10, '1 home search', 'a search with no match says so', emptyText.slice(0, 120));
    ok(await tid(a, 'search-all-categories').count() > 0 || !/homestay/i.test(a.url()), '1 home search', 'empty answer offers to search everything');
    await shot(a, 'home-nomatch');

    // Category tiles.
    const TILES = { stays: ['/homestays', /homestay/i], cars: ['/drivers', /car|driver/i], spots: ['/spots', /offbeat/i], food: ['/cafes', /cafe/i], guides: ['/guides', /guide/i], shops: ['/shops', /shop/i] };
    for (const [k, [want, title]] of Object.entries(TILES)) {
      await go(a, '/');
      await tid(a, `home-tile-${k}`).click();
      await a.waitForURL(new RegExp(want + '$'), { timeout: 8000 }).catch(() => {});
      const h = (await a.locator('.ag-pagehead h1').first().innerText().catch(() => '')).trim();
      ok(a.url().endsWith(want) && title.test(h), '1 home search', `tile "${k}" opens ${want}`, `${a.url().replace(WEB, '')} "${h}"`);
    }

    // Home filter panel: Offbeat places within 10 km of Mirik.
    await go(a, '/');
    await tid(a, 'booking-widget-pill-open').click();
    ok(await visible(tid(a, 'booking-widget-pill-panel')), '1 home search', 'filter panel opens');
    await tid(a, 'home-filter-type').selectOption('spot');
    await tid(a, 'home-filter-place').selectOption('Mirik');
    await tid(a, 'home-filter-within').fill('10');
    await a.waitForTimeout(300);
    const n = Number((await tid(a, 'home-filter-count').innerText().catch(() => '-1')).trim());
    await shot(a, 'home-filter-panel');
    await tid(a, 'booking-widget-panel-search').click();
    await a.waitForURL(/\/search\?/, { timeout: 8000 });
    const fUrl = decodeURIComponent(a.url().replace(WEB, ''));
    ok(/type=spot/.test(fUrl) && /near=Mirik/.test(fUrl) && /within=10/.test(fUrl), '1 home search', 'Search carries type, place and distance', fUrl);
    const filt = await results(a);
    ok(filt.length === n && filt.length > 0 && filt.every((t) => !/homestay|driver|cafe/i.test(t)), '1 home search', 'filtered results match the panel count and kind', `panel said ${n}, page shows ${filt.length}: ${filt.join(' / ').slice(0, 100)}`);
    await shot(a, 'home-filter-results');

    // Cheapest first + Everything.
    await go(a, '/');
    await tid(a, 'booking-widget-pill-open').click();
    await tid(a, 'home-filter-type').selectOption('homestay');
    await tid(a, 'home-filter-cheap').click();
    await tid(a, 'booking-widget-panel-search').click();
    await a.waitForURL(/sort=price_asc/, { timeout: 8000 }).catch(() => {});
    const cheap = (await results(a)).map((t) => { const m = t.match(/₹\s?([\d,]+)/); return m ? Number(m[1].replace(/,/g, '')) : 0; }).filter(Boolean);
    ok(cheap.length > 1 && cheap.every((x, i) => i === 0 || x >= cheap[i - 1]), '1 home search', 'Cheapest first sorts homestays by price', cheap.join(', '));

    // See all.
    await go(a, '/');
    const seeAll = await a.$$eval('a.ag-home-seeall', (as) => as.map((x) => x.getAttribute('href')));
    ok(seeAll.length >= 5, '1 home search', 'See all links on home', seeAll.join(' '));
    for (const href of seeAll) {
      await go(a, '/');
      await a.locator(`a.ag-home-seeall[href="${href}"]`).first().click();
      await a.waitForURL(new RegExp(href.replace(/[?]/g, '\\?') + '$'), { timeout: 8000 }).catch(() => {});
      const tiles = await results(a);
      ok(a.url().endsWith(href) && tiles.length > 0, '1 home search', `See all ${href} opens a list`, `${tiles.length} shown`);
    }
    await layout(a, '1 home search', '/');
  });

  // ---------------- 2. /search directly ----------------
  await step('2 /search', async () => {
    await go(a, '/search?q=momo');
    const r = await results(a);
    const api = ((await call('/listings?q=momo&limit=60')).data?.items || []).length;
    ok(r.length === api && r.every((t) => /cafe/i.test(t)), '2 /search', '/search?q=momo lists the momo cafes', `${r.length} shown, ${api} from the API`);
    const head = (await a.locator('.ag-pagehead h1').first().innerText()).trim();
    ok(/momo/i.test(head), '2 /search', 'heading names the search', head);
    await shot(a, 'search-momo');
    await layout(a, '2 /search', '/search?q=momo');
    // Clearing the box.
    const input = tid(a, 'category-search-input').first();
    if (await input.count()) {
      await input.fill('');
      await a.waitForTimeout(900);
      const cleared = await titlesOf(a);
      const head2 = (await a.locator('.ag-pagehead h1').first().innerText()).trim();
      const clearShot = await shot(a, 'search-cleared');
      ok(cleared.length > r.length, '2 /search', 'clearing the query shows everything again', `${cleared.length} shown`);
      if (/momo/i.test(head2) || /q=momo/.test(a.url())) ux('2 /search', `after clearing the search box the page still reads ${head2} and the address keeps q=momo, while the list shows all ${cleared.length} listings (Category.tsx: title comes from the URL q, the box only changes local state) (${clearShot})`);
    } else ok(false, '2 /search', 'search box on /search');
    // An area name.
    for (const [q, want] of [['Happy Valley', /happy valley/i], ['Jawahar Parbat', /zoolog/i], ['Ghum', /ghum/i]]) {
      await go(a, `/search?q=${encodeURIComponent(q)}`);
      const rr = await results(a);
      ok(rr.length > 0 && want.test(rr[0]), '2 /search', `search by area "${q}"`, `${rr.length}: ${rr.slice(0, 2).join(' / ').slice(0, 90)}`);
    }
    // A typo.
    await go(a, '/search?q=mirk');
    const typo = await results(a);
    ok(typo.some((t) => /mirik/i.test(t)), '2 /search', 'a typo ("mirk") still finds Mirik', typo.slice(0, 2).join(' / '));
    // Tapping a result.
    await go(a, '/search?q=Ghum');
    await results(a);
    const first = a.locator('[data-testid^="grid-tile-"]').first();
    const fid = (await first.getAttribute('data-testid')).replace('grid-tile-', '');
    await first.click();
    await a.waitForURL(new RegExp(`/listing/${fid}`), { timeout: 8000 }).catch(() => {});
    ok(a.url().includes(`/listing/${fid}`), '2 /search', 'tapping a result opens it');
  });

  // ---------------- 3. Listing pages, save, Saved ----------------
  await step('3 detail + saved', async () => {
    // Without the pass: what happens on the heart.
    await go(a, `/listing/${spot.id}`);
    a.allow = [/^402 POST \/api\/favorites/];
    await tid(a, 'detail-like').click();
    await a.waitForURL(/\/support/, { timeout: 6000 }).catch(() => {});
    const passShot = await shot(a, 'save-without-pass');
    ok(true, '3 detail + saved', `heart without the aangan pass leads to ${a.url().replace(WEB, '')}`, passShot);
    if (!/\/support/.test(a.url())) ux('3 detail + saved', `the heart without the pass does nothing visible (no message, no pass screen) (${passShot})`);
    a.allow = [];
    ok((await buyPass(A)) === 200, '3 detail + saved', 'aangan pass bought through the mock gateway');

    for (const it of [stay, driver, spot]) {
      await go(a, `/listing/${it.id}`);
      ok(await visible(tid(a, 'detail-hero')), '3 detail + saved', `${it.type}: photo shows`);
      const strip = a.locator('[data-testid="detail-photos"] img, [data-testid="detail-gallery"] img');
      const nPhotos = await strip.count();
      ok(nPhotos > 0, '3 detail + saved', `${it.type}: photo strip`, `${nPhotos} photos`);
      if (nPhotos) {
        const before = a.url();
        await strip.first().click().catch(() => {});
        await a.waitForTimeout(500);
        const opened = await a.locator('[role=dialog] img, .ag-lightbox, [data-testid*=lightbox]').count();
        if (!opened && a.url() === before && it === stay) ux('3 detail + saved', `${it.type}: tapping a photo in the strip does nothing (no full-size view) (DetailHero.tsx StripTile is a plain div)`);
      }
      const [pop] = await Promise.all([
        a.context().waitForEvent('page', { timeout: 5000 }).catch(() => null),
        tid(a, 'detail-directions').click(),
      ]);
      ok(!!pop && /google\.com\/maps\/dir/.test(pop.url()), '3 detail + saved', `${it.type}: Direction opens Google Maps directions`, pop ? pop.url().slice(0, 100) : 'no new tab');
      if (pop) await pop.close();
      ok(await tid(a, 'detail-reviews').count() > 0, '3 detail + saved', `${it.type}: reviews section`);
      await tid(a, 'detail-share').click();
      const fb = await visible(tid(a, 'detail-share-feedback'), 3000);
      const clip = await a.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      ok(fb && clip.includes(`/listing/${it.id}`), '3 detail + saved', `${it.type}: Share copies the link and says so`, clip.slice(0, 80));
      const like = tid(a, 'detail-like');
      await like.click();
      await a.waitForResponse((r) => r.url().includes('/api/favorites') && r.request().method() === 'POST', { timeout: 5000 }).catch(() => {});
      ok((await like.getAttribute('aria-pressed')) === 'true', '3 detail + saved', `${it.type}: heart turns on`);
      await layout(a, '3 detail + saved', `/listing/${it.type}`);
      await shot(a, `detail-${it.type}`);
    }

    await go(a, '/saved');
    await tid(a, 'saved-pills').waitFor({ timeout: 8000 }).catch(() => {});
    const pills = (await a.locator('[data-testid="saved-pills"] button').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    ok(pills.length === 4 && /3$/.test(pills[0]) && pills.slice(1).every((p) => /1$/.test(p)), '3 detail + saved', 'Saved pills: Everything 3, then one per kind with counts', pills.join(' | '));
    const order = await a.locator('[data-testid^="saved-group-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('saved-group-', '')));
    ok(order.join(',') === 'spot,homestay,driver', '3 detail + saved', 'groups in prototype order (places, stays, cars)', order.join(','));
    await shot(a, 'saved-390');
    await layout(a, '3 detail + saved', '/saved');
    // Saved's "Plan a trip" vs the Feed's "Plan a trip" (/plan, the trip plan others can join).
    await tid(a, 'build-itinerary-cta').click();
    await a.waitForTimeout(800);
    if (a.url().includes('/plan')) {
      ok(true, '3 detail + saved', 'Saved\'s "Plan a trip" opens the trip planner (/plan), as on the Feed');
      await go(a, '/saved');
      await tid(a, 'saved-pills').waitFor({ timeout: 8000 }).catch(() => {});
    } else {
      ux('3 detail + saved', `Saved has two buttons, "Plan a trip" and "Plan & Share Trip"; "Plan a trip" here opens a fixed sample itinerary (TripPlannerModal: Mall Road, Tiger Hill...) instead of the trip planner the Feed's "Plan a trip" opens (/plan), so the same words lead to two different things (${await shot(a, 'saved-plan-a-trip')})`);
      await a.keyboard.press('Escape');
      await go(a, '/saved');
      await tid(a, 'saved-pills').waitFor({ timeout: 8000 }).catch(() => {});
    }
    await tid(a, 'saved-pill-driver').click();
    const only = await a.locator('[data-testid^="saved-group-"]').count();
    ok(only === 1 && await tid(a, 'saved-group-driver').count() === 1, '3 detail + saved', 'pill Car & Driver shows only the drivers');
    const hearts = await a.locator('[data-testid^="saved-group-"] button[aria-pressed]').count();
    if (!hearts) ux('3 detail + saved', `Saved cards have no heart, so nothing can be unsaved from Saved; the prototype's Saved uses stayCard/spotCard with the heart (Saved.tsx renders ListingCard, ListingCard.tsx:16 has no Heart) (${await shot(a, 'saved-no-heart')})`);
    await go(a, '/dashboard?s=tdash');
    await tid(a, 'dashboard-saved').waitFor({ timeout: 8000 }).catch(() => {});
    await a.waitForTimeout(800);
    const dash1 = (await tid(a, 'dashboard-saved').innerText().catch(() => '')).replace(/\s+/g, ' ');
    ok(/\b3\b/.test(dash1), '3 detail + saved', 'traveller dashboard counts 3 saved', dash1);
    // Unsave the homestay (on its page, the only place a heart is offered for it).
    await go(a, `/listing/${stay.id}`);
    await tid(a, 'detail-like').click();
    await a.waitForResponse((r) => r.url().includes('/api/favorites') && r.request().method() === 'DELETE', { timeout: 5000 }).catch(() => {});
    ok((await tid(a, 'detail-like').getAttribute('aria-pressed')) === 'false', '3 detail + saved', 'heart turns off again');
    await go(a, '/saved');
    await tid(a, 'saved-pills').waitFor({ timeout: 8000 }).catch(() => {});
    const pills2 = (await a.locator('[data-testid="saved-pills"] button').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    ok(/2$/.test(pills2[0] || '') && !(await tid(a, 'saved-group-homestay').count()), '3 detail + saved', 'after unsaving: Everything 2, no Homestay group', pills2.join(' | '));
    await go(a, '/dashboard?s=tdash');
    await tid(a, 'dashboard-saved').waitFor({ timeout: 8000 }).catch(() => {});
    await a.waitForTimeout(800);
    const dash2 = (await tid(a, 'dashboard-saved').innerText().catch(() => '')).replace(/\s+/g, ' ');
    ok(/\b2\b/.test(dash2), '3 detail + saved', 'dashboard count follows', dash2);
    // Save from a card on Home (the stay rail's heart).
    await go(a, '/');
    const anyHeart = a.locator('[data-testid^="stay-save-"]').first();
    if (await anyHeart.count()) {
      await anyHeart.scrollIntoViewIfNeeded();
      await anyHeart.click();
      await a.waitForTimeout(800);
      ok((await anyHeart.getAttribute('aria-pressed')) === 'true', '3 detail + saved', 'heart on a Home stay card saves it');
      await anyHeart.click();
      await a.waitForTimeout(800);
    } else ok(false, '3 detail + saved', 'Home stay cards have a heart');
  });

  // ---------------- 4. Trip plans ----------------
  const { ctx: bCtx, page: b } = await context(browser, { user: B, label: 'B' });
  const { ctx: cCtx, page: c } = await context(browser, { user: C, label: 'C' });
  let planId = null;
  const planTitle = `Walk trip ${T}`;
  await step('4 trip plans', async () => {
    await go(a, '/feed');
    await tid(a, 'feed-plan-trip').click();
    await a.waitForURL(/\/plan$/, { timeout: 8000 });
    await tid(a, 'plan-title').fill(planTitle);
    const start = new Date(Date.now() + 12 * 864e5).toISOString().slice(0, 10);
    await tid(a, 'plan-date').fill(start);
    await tid(a, 'plan-nights').fill('2');
    await shot(a, 'plan-step1');
    await tid(a, 'plan-next').click();
    ok(await visible(tid(a, 'plan-step-1')), '4 trip plans', 'step 2 (route) opens');
    ok(await a.locator('[data-testid^="plan-day-place-"]').count() === 3, '4 trip plans', '2 nights give 3 days');
    // Next without places: says what is missing.
    await tid(a, 'plan-next').click();
    ok(/2 places/i.test(await a.locator('#plan-err').innerText().catch(() => '')), '4 trip plans', 'Next without places asks for 2 places');
    const places = ['Darjeeling', 'Mirik', 'Kurseong'];
    for (let j = 1; j <= 3; j++) {
      await tid(a, `plan-day-place-${j}`).click();
      await tid(a, 'plan-place-q').fill(places[j - 1]);
      const optn = a.locator('[data-testid="plan-place-list"] .ag-plan-opt', { hasText: places[j - 1] }).first();
      await optn.waitFor({ timeout: 6000 });
      await optn.click();
      ok((await tid(a, `plan-day-place-${j}`).innerText()).includes(places[j - 1]), '4 trip plans', `day ${j} at ${places[j - 1]}`);
      await tid(a, `plan-day-text-${j}`).fill(`Day ${j}: walk around ${places[j - 1]} and see the market`);
    }
    await tid(a, 'plan-pick-stay').click();
    await a.locator('[data-testid="plan-homestay-list"] .ag-plan-opt').first().waitFor({ timeout: 8000 });
    await a.locator('[data-testid="plan-homestay-list"] .ag-plan-opt').first().click();
    ok(await visible(tid(a, 'plan-chosen-homestay')), '4 trip plans', 'a homestay is picked');
    await tid(a, 'plan-pick-driver').click();
    await a.locator('[data-testid="plan-driver-list"] .ag-plan-opt').first().waitFor({ timeout: 8000 });
    await a.locator('[data-testid="plan-driver-list"] .ag-plan-opt').first().click();
    ok(await visible(tid(a, 'plan-chosen-driver')), '4 trip plans', 'a driver is picked');
    await shot(a, 'plan-step2');
    await tid(a, 'plan-next').click();
    ok(await visible(tid(a, 'plan-step-2')), '4 trip plans', 'step 3 (people, cost) opens');
    await tid(a, 'plan-seats-plus').click();
    ok((await tid(a, 'plan-seats').innerText()).trim() === '5', '4 trip plans', 'seats 4 -> 5');
    const total = (await tid(a, 'plan-total').innerText()).trim();
    ok(/₹[1-9]/.test(total), '4 trip plans', 'cost per person is estimated from the listings', total);
    await tid(a, 'plan-notes').fill('Bring warm clothes. We share the car.');
    await shot(a, 'plan-step3');
    await tid(a, 'plan-next').click();
    ok(await visible(tid(a, 'plan-step-3')), '4 trip plans', 'step 4 (check) shows the card');
    ok((await a.locator('.ag-plan-title').innerText()).includes(planTitle), '4 trip plans', 'preview shows the title');
    await tid(a, 'plan-post').click();
    ok(await visible(tid(a, 'plan-done')), '4 trip plans', 'plan posted');
    const href = await tid(a, 'plan-done-open').getAttribute('href');
    planId = href.split('/').pop();
    await shot(a, 'plan-posted');
    await tid(a, 'plan-done-open').click();
    await tid(a, 'plan-detail').waitFor({ timeout: 8000 });
    const card = (await tid(a, `plan-${planId}`).innerText()).replace(/\s+/g, ' ');
    ok(card.includes('Darjeeling') && card.includes('Mirik') && card.includes('Kurseong') && /1\/5/.test(card), '4 trip plans', '/plan/:id shows the route and 1/5', card.slice(0, 160));
    ok(!/Not chosen yet/.test(card), '4 trip plans', 'the stay and the driver show on the plan');
    ok(/4 seats left/.test(await tid(a, `plan-mine-${planId}`).innerText()), '4 trip plans', 'organiser sees "4 seats left"');
    ok(await tid(a, 'plan-requests').count() > 0, '4 trip plans', 'organiser sees Join requests');
    await layout(a, '4 trip plans', '/plan/:id');
    await go(a, '/feed');
    ok(await visible(tid(a, `plan-${planId}`)), '4 trip plans', 'the plan is on /feed under Trip plans');

    const aBefore = (await notes(A)).unread_count;
    // B asks from the Feed.
    await go(b, '/feed');
    await tid(b, `plan-join-${planId}`).waitFor({ timeout: 8000 });
    const btnTxt = (await tid(b, `plan-join-${planId}`).innerText()).replace(/\s+/g, ' ');
    ok(/Ask to join · 4/.test(btnTxt), '4 trip plans', 'B sees "Ask to join · 4"', btnTxt);
    await tid(b, `plan-join-${planId}`).click();
    ok(await visible(tid(b, 'plan-sent')), '4 trip plans', 'B gets "Request sent"');
    await shot(b, 'plan-b-sent');
    await tid(b, 'plan-sent-later').click();
    ok(/Waiting/i.test(await tid(b, `plan-status-${planId}`).innerText()), '4 trip plans', 'B sees "Waiting for confirmation"');
    // B saves it.
    await tid(b, `plan-save-${planId}`).click();
    await b.waitForTimeout(800);
    ok((await tid(b, `plan-save-${planId}`).getAttribute('aria-pressed')) === 'true', '4 trip plans', 'B saves the plan (heart on)');
    await go(b, '/feed');
    await tid(b, `plan-save-${planId}`).waitFor({ timeout: 8000 });
    ok((await tid(b, `plan-save-${planId}`).getAttribute('aria-pressed')) === 'true', '4 trip plans', 'saved heart stays on after reload');
    await go(b, '/saved');
    await b.waitForTimeout(1200);
    const savedHasPlan = (await b.locator('main, body').first().innerText()).includes(planTitle);
    const svShot = await shot(b, 'saved-b-no-plan');
    ok(savedHasPlan, '4 trip plans', 'a saved trip plan is listed on Saved (prototype plans.js: "Trip plans" section on Saved)', svShot);
    // C asks from the plan page.
    await go(c, `/plan/${planId}`);
    await tid(c, `plan-join-${planId}`).click();
    await tid(c, 'plan-sent').waitFor({ timeout: 6000 });
    await tid(c, 'plan-sent-open').click();
    await c.waitForTimeout(500);
    ok(/Waiting/i.test(await tid(c, `plan-status-${planId}`).innerText()), '4 trip plans', 'C sees "Waiting for confirmation"');
    // D asks (API).
    const dj = await call(`/plans/${planId}/join`, { method: 'POST', token: D.token });
    ok(dj.status === 201, '4 trip plans', 'D asks to join', String(dj.status));

    const aNotes = await notes(A);
    const reqs = aNotes.items.filter((n) => n.kind === 'plan_join_request' && n.ref_id === planId);
    ok(reqs.length === 3 && aNotes.unread_count === aBefore + 3, '4 trip plans', 'A gets one notification per request', `${reqs.length} requests, unread ${aNotes.unread_count}`);
    await go(a, '/notifications');
    await tid(a, 'notes-list').waitFor({ timeout: 8000 });
    const badge = await unreadBadge(a);
    ok(Number(badge.replace('+', '')) >= 3, '4 trip plans', 'A\'s bell shows the unread count', badge);
    await shot(a, 'notes-a');
    await tid(a, `note-${reqs[0].id}`).click();
    await a.waitForURL(new RegExp(`/plan/${planId}`), { timeout: 6000 }).catch(() => {});
    ok(a.url().includes(`/plan/${planId}`), '4 trip plans', 'a join-request notification opens the plan');
    await tid(a, `plan-req-${B.id}`).waitFor({ timeout: 8000 });
    ok(await tid(a, `plan-req-${C.id}`).count() === 1 && await tid(a, `plan-req-${D.id}`).count() === 1, '4 trip plans', 'A sees all three requests');
    await shot(a, 'plan-a-requests');
    await tid(a, `plan-accept-${B.id}`).click();
    await tid(a, `plan-member-${B.id}`).waitFor({ timeout: 6000 }).catch(() => {});
    ok(await tid(a, `plan-member-${B.id}`).count() === 1, '4 trip plans', 'B moves to "In the trip"');
    await tid(a, `plan-decline-${C.id}`).click();
    await a.waitForTimeout(800);
    ok(await tid(a, `plan-req-${C.id}`).count() === 0, '4 trip plans', 'C leaves the waiting list');
    const card2 = (await tid(a, `plan-${planId}`).innerText()).replace(/\s+/g, ' ');
    ok(/2\/5/.test(card2) && /3 seats left · 1 request/.test(card2), '4 trip plans', 'card: 2/5, 3 seats left, 1 request', card2.match(/Your plan[^]*?(request|left)/)?.[0] || card2.slice(-80));
    await shot(a, 'plan-a-after');

    await go(b, `/plan/${planId}`);
    await tid(b, `plan-status-${planId}`).waitFor({ timeout: 8000 });
    ok(/Confirmed/.test(await tid(b, `plan-status-${planId}`).innerText()), '4 trip plans', 'B sees "Confirmed"');
    ok(/2\/5/.test(await tid(b, `plan-${planId}`).innerText()), '4 trip plans', 'B sees 2/5');
    await go(c, `/plan/${planId}`);
    await tid(c, `plan-status-${planId}`).waitFor({ timeout: 8000 });
    ok(/Not confirmed/.test(await tid(c, `plan-status-${planId}`).innerText()), '4 trip plans', 'C sees "Not confirmed"');
    await shot(c, 'plan-c-declined');
    const bN = (await notes(B)).items.filter((n) => n.ref_id === planId).map((n) => n.kind);
    const cN = (await notes(C)).items.filter((n) => n.ref_id === planId).map((n) => n.kind);
    ok(bN.includes('plan_join_accepted') && !bN.includes('plan_join_declined'), '4 trip plans', 'B is told "You are in"', bN.join(','));
    ok(cN.includes('plan_join_declined') && !cN.includes('plan_join_accepted'), '4 trip plans', 'C is told "Not confirmed"', cN.join(','));
    await go(b, '/notifications');
    await tid(b, 'notes-list').waitFor({ timeout: 8000 });
    const bNote = (await notes(B)).items.find((n) => n.kind === 'plan_join_accepted');
    await tid(b, `note-${bNote.id}`).click();
    await b.waitForURL(new RegExp(`/plan/${planId}`), { timeout: 6000 }).catch(() => {});
    ok(b.url().includes(`/plan/${planId}`), '4 trip plans', '"You are in" opens the plan');
    // 1280 look at the plan.
    {
      const { ctx, page } = await context(browser, { user: B, width: 1280, label: 'B' });
      await go(page, `/plan/${planId}`);
      await tid(page, 'plan-detail').waitFor({ timeout: 8000 });
      await layout(page, '4 trip plans', '/plan/:id at 1280');
      await shot(page, 'plan-1280');
      await ctx.close();
    }
    // B leaves.
    await go(b, `/plan/${planId}`);
    await tid(b, `plan-leave-${planId}`).click();
    await tid(b, `plan-join-${planId}`).waitFor({ timeout: 6000 }).catch(() => {});
    ok(await tid(b, `plan-join-${planId}`).count() === 1, '4 trip plans', 'B leaves: Ask to join shows again');
    const aLeft = (await notes(A)).items.some((n) => n.kind === 'plan_member_left' && n.ref_id === planId);
    ok(aLeft, '4 trip plans', 'A is told B left');
    await go(a, `/plan/${planId}`);
    await tid(a, `plan-${planId}`).waitFor({ timeout: 8000 });
    ok(/1\/5/.test(await tid(a, `plan-${planId}`).innerText()), '4 trip plans', 'A sees 1/5 again');
    // A deletes.
    await tid(a, 'plan-delete').click();
    await a.waitForURL(/\/feed$/, { timeout: 8000 }).catch(() => {});
    ok(a.url().endsWith('/feed'), '4 trip plans', 'delete goes back to /feed');
    await a.waitForTimeout(1200);
    ok(await tid(a, `plan-${planId}`).count() === 0, '4 trip plans', 'the plan is gone from the Feed');
    const dN = (await notes(D)).items.find((n) => n.kind === 'plan_cancelled' && n.ref_id === planId);
    ok(!!dN, '4 trip plans', 'D (still waiting) is told the trip was cancelled');
    const gone = await call(`/plans/${planId}`);
    ok(gone.status === 404, '4 trip plans', 'the plan is gone from the API', String(gone.status));
    if (dN) {
      const { ctx, page } = await context(browser, { user: D, label: 'D' });
      await go(page, '/notifications');
      await tid(page, `note-${dN.id}`).click();
      await page.waitForURL(/\/feed$/, { timeout: 6000 }).catch(() => {});
      ok(page.url().endsWith('/feed'), '4 trip plans', '"trip was cancelled" opens the Feed');
      await ctx.close();
    }
    // Mark all read + bell.
    await go(a, '/notifications');
    await tid(a, 'notes-read-all').waitFor({ timeout: 8000 });
    await tid(a, 'notes-read-all').click();
    await a.waitForTimeout(1200);
    ok(await a.locator('[aria-label="Unread"], [data-testid="notes-list"] .rounded-full').count() === 0, '7 notifications', 'mark all read clears the dots');
    ok((await unreadBadge(a)) === '0', '7 notifications', 'the bell count goes away', await unreadBadge(a));
    ok((await notes(A)).unread_count === 0, '7 notifications', 'server agrees: 0 unread');
    await layout(a, '7 notifications', '/notifications');
  });

  // The bell after something new arrives while the site is open (client-side page change).
  await step('7 notifications', async () => {
    await go(a, '/feed');
    const p2 = await call('/plans', { method: 'POST', token: A.token, body: { title: `Bell check ${T}`, stops: [{ place: 'Darjeeling' }, { place: 'Ghum' }], nights: 1, seats: 3 } });
    const pid = p2.data?.plan?.id;
    await call(`/plans/${pid}/join`, { method: 'POST', token: B.token });
    await tid(a, 'bottom-nav-saved').click();
    await a.waitForTimeout(1500);
    const n1 = await unreadBadge(a);
    if (n1 === '0') ux('7 notifications', 'a new notification does not show on the bell when moving to another page; the count is re-read at most every 30 s (Header.tsx: lastUnreadCheck 30_000) and there is no polling, so it stays 0 until a later page change');
    else ok(true, '7 notifications', 'bell updates on the next page', n1);
    await call(`/plans/${pid}`, { method: 'DELETE', token: A.token });
  });

  // ---------------- 5. Suggest a place ----------------
  let spotId = null;
  await step('5 suggest a place', async () => {
    await go(a, '/');
    const box = tid(a, 'home-suggest');
    await box.scrollIntoViewIfNeeded();
    await tid(a, 'home-suggest-open').click();
    const name = `Walk Falls ${T}`;
    await tid(a, 'home-suggest-send').click();
    ok(/name/i.test(await tid(a, 'home-suggest-error').innerText().catch(() => '')), '5 suggest a place', 'sending empty asks for the name');
    await tid(a, 'home-suggest-name').fill(name);
    await tid(a, 'home-suggest-place').selectOption('Mirik');
    await tid(a, 'home-suggest-area').fill('Behind the lake');
    await tid(a, 'home-suggest-details').fill('A small waterfall twenty minutes walk from the lake, best after the rains.');
    await tid(a, 'home-suggest-ticket').click();
    await tid(a, 'home-suggest-price').fill('20');
    await tid(a, 'home-suggest-photos').setInputFiles(PHOTO);
    const pic = await visible(a.locator('.ag-home-sugggal .pic'), 15000);
    ok(pic, '5 suggest a place', 'the photo uploads and shows');
    await shot(a, 'suggest-form');
    await tid(a, 'home-suggest-send').click();
    await a.locator('[data-testid^="my-sugg-status-"]').first().waitFor({ timeout: 8000 });
    ok(/Thank you/i.test(await box.innerText()), '5 suggest a place', 'thanks message after sending');
    const mine = (await call('/spots/suggestions/mine', { token: A.token })).data?.suggestions || [];
    const s1 = mine.find((s) => s.name === name);
    ok(!!s1 && s1.status === 'pending' && s1.photos.length === 1 && s1.entry_price === 20 && /Behind the lake, Mirik/.test(s1.place), '5 suggest a place', 'stored as pending with photo, ticket and area', JSON.stringify(s1 && { st: s1.status, p: s1.photos.length, e: s1.entry_price, pl: s1.place }));
    ok(/Waiting/i.test(await tid(a, `my-sugg-status-${s1.id}`).innerText()), '5 suggest a place', 'my suggestion shows "Waiting for the aangan team"');
    await shot(a, 'suggest-pending');
    // Admin approves.
    const ap = await call(`/admin/spots/suggestions/${s1.id}/approve`, { method: 'POST', token: admin, body: {} });
    ok(ap.status === 200, '5 suggest a place', 'admin approves', String(ap.status));
    spotId = ap.data?.spot?.id;
    await go(a, '/');
    await tid(a, `my-sugg-status-${s1.id}`).waitFor({ timeout: 8000 });
    ok(/Accepted/i.test(await tid(a, `my-sugg-status-${s1.id}`).innerText()), '5 suggest a place', 'traveller sees "Accepted"');
    const onSpots = async () => ((await call('/listings?type=spot&limit=200')).data?.items || []).some((x) => x.title === name);
    const liveAfterApprove = await onSpots();
    if (!liveAfterApprove) ux('5 suggest a place', `approving a suggestion does not put it on Offbeat Places; it becomes an unpublished draft that the team must publish separately (placeSuggestions.ts:296 published:false). The traveller sees "Accepted" but the place is nowhere to be seen`);
    const pub = await call(`/admin/spots/${spotId}/publish`, { method: 'POST', token: admin, body: { published: true } });
    ok(pub.status === 200, '5 suggest a place', 'admin publishes the spot', String(pub.status));
    ok(await onSpots(), '5 suggest a place', 'published: on Offbeat Places for everyone (API)');
    // "We will tell you here when it is live" (the thank-you copy): after publishing, does it?
    await go(a, '/');
    await tid(a, `my-sugg-${s1.id}`).waitFor({ timeout: 8000 }).catch(() => {});
    const cardTxt = (await tid(a, `my-sugg-${s1.id}`).innerText().catch(() => '')).replace(/\s+/g, ' ');
    const liveNote = (await notes(A)).items.some((n) => /live|published/i.test(`${n.title} ${n.body}`) && n.kind !== 'place_suggestion_approved');
    if (/once it is ready/i.test(cardTxt) || !liveNote) ux('5 suggest a place', `after the team publishes the spot, "My suggestions" still says "${cardTxt.match(/Accepted[^.]*\.?[^.]*once it is ready\.?/)?.[0] || cardTxt.slice(0, 80)}" with no link to the live place, and no "it is live" notification is sent (adminSpots.ts publish route notifies nobody), though the thank-you copy promises "We will tell you here when it is live" (${await shot(a, 'suggest-after-publish')})`);
    const { ctx: gCtx, page: g } = await context(browser, { label: 'guest' });
    await go(g, '/spots');
    await g.locator('[data-testid^="grid-tile-"]').first().waitFor({ timeout: 10000 }).catch(() => {});
    ok(await g.locator(`[data-testid="grid-tile-${spotId}"]`).count() === 1, '5 suggest a place', 'a guest sees it on /spots');
    await go(g, `/listing/${spotId}`);
    ok((await tid(g, 'listing-title').innerText().catch(() => '')).includes(name), '5 suggest a place', 'its page opens for a guest');
    await shot(g, 'suggest-live-spot');
    // Home's Offbeat places shows the first 4 spots; is the new one among them?
    await go(g, '/');
    const onHome = await g.locator(`[data-testid="spot-tile-${spotId}"]`).count();
    ok(true, '5 suggest a place', `new spot on Home's Offbeat places rail: ${onHome ? 'yes' : 'no (rail shows the first 4)'}`);
    ok(await tid(g, 'home-suggest-login').count() === 1, '5 suggest a place', 'a guest is offered Suggest a place via log in');
    await gCtx.close();
    // Notification.
    const aN = (await notes(A)).items.find((n) => n.kind === 'place_suggestion_approved' && n.ref_id === s1.id);
    ok(!!aN, '5 suggest a place', 'traveller gets "suggestion accepted" notification');
    if (aN) {
      await go(a, '/notifications');
      await tid(a, `note-${aN.id}`).click();
      await a.waitForTimeout(1200);
      const nShot = await shot(a, 'note-suggestion-click');
      if (a.url().endsWith('/notifications')) ux('5 suggest a place', `tapping the "Your place suggestion was accepted" notification does nothing (stays on /notifications); Notifications.tsx open() has no case for place_suggestion_* (expected: the spot, or Home's My suggestions) (${nShot})`);
    }

    // Second suggestion from the Offbeat Places list, rejected.
    await go(a, '/spots');
    await tid(a, 'home-suggest').scrollIntoViewIfNeeded();
    await tid(a, 'home-suggest-open').click();
    const name2 = `Walk Viewpoint ${T}`;
    await tid(a, 'home-suggest-name').fill(name2);
    await tid(a, 'home-suggest-place').selectOption('Kurseong');
    await tid(a, 'home-suggest-details').fill('A quiet viewpoint above the tea garden with a view of the plains at sunset.');
    await tid(a, 'home-suggest-send').click();
    await a.waitForTimeout(1500);
    const s2 = ((await call('/spots/suggestions/mine', { token: A.token })).data?.suggestions || []).find((s) => s.name === name2);
    ok(!!s2 && s2.entry_price === null, '5 suggest a place', 'second suggestion (from /spots, free entry) is stored');
    const rj = await call(`/admin/spots/suggestions/${s2.id}/reject`, { method: 'POST', token: admin, body: { note: 'This viewpoint is already listed as Eagle\'s Craig.' } });
    ok(rj.status === 200, '5 suggest a place', 'admin rejects with a note', String(rj.status));
    await go(a, '/spots');
    const st2 = tid(a, `my-sugg-status-${s2.id}`);
    await st2.waitFor({ timeout: 8000 }).catch(() => {});
    ok(/Not added/i.test(await st2.innerText().catch(() => '')), '5 suggest a place', 'traveller sees "Not added"');
    ok(/Eagle/.test(await tid(a, `my-sugg-note-${s2.id}`).innerText().catch(() => '')), '5 suggest a place', 'and the team\'s note');
    await shot(a, 'suggest-rejected');
    const rN = (await notes(A)).items.find((n) => n.kind === 'place_suggestion_rejected' && n.ref_id === s2.id);
    ok(!!rN && /Eagle/.test(rN.body), '5 suggest a place', 'rejection notification carries the note');
    await layout(a, '5 suggest a place', '/spots');
  });

  // ---------------- 6. Feed ----------------
  await step('6 feed', async () => {
    const { ctx, page: f } = await context(browser, { user: B, geo: true, label: 'B' });
    await go(f, '/feed');
    const wx = await visible(f.locator('[data-testid^="weather-forecast-day-"]'), 20000);
    ok(wx, '6 feed', 'weather forecast loads');
    await shot(f, 'feed-390');
    const placeChips = await f.locator('[data-testid^="weather-place-"]').count();
    ok(placeChips >= 3, '6 feed', 'place chips', String(placeChips));
    if (placeChips > 1) {
      const chip = tid(f, 'weather-place-1');
      const nm = (await chip.innerText()).split('\n')[0].trim();
      await chip.click();
      ok((await chip.getAttribute('aria-pressed')) === 'true' && (await tid(f, 'weather-forecast').innerText()).toLowerCase().includes(nm.replace(/\d+°/, '').trim().toLowerCase()), '6 feed', `place chip "${nm}" switches the forecast`);
    }
    // Search a place.
    await tid(f, 'weather-search').click();
    await tid(f, 'weather-search-input').fill('Lava');
    const hit = await visible(tid(f, 'weather-hit-0'), 12000);
    ok(hit, '6 feed', 'weather location search finds "Lava"');
    const hitTexts = (await f.locator('[data-testid^="weather-hit-"]').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
    if (new Set(hitTexts).size < hitTexts.length) ux('6 feed', `weather "Search location" lists the same place twice: ${hitTexts.join(' | ')} (geocoder results are not de-duplicated, WeatherForecast.tsx HillWeather hits) (${await shot(f, 'weather-dup-hits')})`);
    if (hit) {
      const hn = (await tid(f, 'weather-hit-0').innerText()).split('\n')[0].trim();
      await tid(f, 'weather-hit-0').click();
      await f.waitForTimeout(2500);
      ok((await tid(f, 'weather-forecast').innerText()).toLowerCase().includes(hn.toLowerCase()), '6 feed', `forecast now for ${hn}`);
    }
    // My location.
    await tid(f, 'weather-my-location').click();
    await f.waitForTimeout(3000);
    const sel = await f.locator('[data-testid^="weather-place-"][aria-pressed="true"]').innerText().catch(() => '');
    ok(/My location/i.test(sel) && /My location/i.test(await tid(f, 'weather-forecast').innerText()), '6 feed', 'My location adds its own chip and forecast', sel.replace(/\s+/g, ' '));
    await shot(f, 'feed-weather-mine');
    // Title track.
    const play = tid(f, 'feed-title-track-play');
    await play.click();
    await f.waitForTimeout(1500);
    const playing = await f.evaluate(() => { const au = document.querySelector('[data-testid="feed-title-track"] audio'); return au ? { paused: au.paused, t: au.currentTime } : null; });
    ok(playing && !playing.paused && playing.t > 0 && (await play.getAttribute('aria-pressed')) === 'true', '6 feed', 'title track plays', JSON.stringify(playing));
    await play.click();
    await f.waitForTimeout(400);
    const paused = await f.evaluate(() => document.querySelector('[data-testid="feed-title-track"] audio')?.paused);
    ok(paused === true && (await play.getAttribute('aria-pressed')) === 'false', '6 feed', 'title track pauses');
    // Filter: only trip plans.
    await tid(f, 'feed-filter').click();
    await tid(f, 'feed-show-all').click();
    const none = (await f.locator('main, body').first().innerText()).includes('Everything?');
    if (none) ux('6 feed', `with every kind unticked in the Feed filter the page shows only the word "Everything?" (Feed.tsx:332), no message saying nothing is selected (${await shot(f, 'feed-nothing')})`);
    await tid(f, 'feed-filter-clear').click();
    await tid(f, 'feed-filter-done').click();
    // Business websites.
    const sites = f.locator('[data-testid^="feed-site-"]');
    await sites.first().waitFor({ timeout: 10000 }).catch(() => {});
    const nSites = await sites.count();
    ok(nSites > 0, '6 feed', 'Business websites list', `${nSites} businesses`);
    const ids = (await sites.evaluateAll((els) => els.slice(0, 4).map((e) => [e.getAttribute('data-testid').replace('feed-site-', ''), e.querySelector('b')?.textContent || '']))).filter(Boolean);
    for (const [pid, nm] of ids) {
      await go(f, '/feed');
      await f.locator(`[data-testid="feed-site-${pid}"]`).click();
      await f.waitForURL((u) => !u.pathname.startsWith('/feed'), { timeout: 8000 }).catch(() => {});
      await f.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
      await f.waitForTimeout(800);
      const body = (await f.locator('body').innerText()).replace(/\s+/g, ' ');
      const site = await f.locator('[data-testid="host-mini-site"]').count();
      const nf = /not found|could not find/i.test(body) || await f.locator('[data-testid=not-found]').count();
      ok(!nf && (site > 0 || body.includes(nm.trim())), '6 feed', `business website "${nm}" opens with the host's details`, f.url().replace(WEB, ''));
    }
    await shot(f, 'business-site');
    await layout(f, '6 feed', 'business page');
    // Plan a trip from the Feed.
    await go(f, '/feed');
    await tid(f, 'feed-plan-trip').click();
    await f.waitForURL(/\/plan$/, { timeout: 6000 }).catch(() => {});
    const planner = await visible(tid(f, 'plan-step-0'), 10000);
    ok(f.url().endsWith('/plan') && planner, '6 feed', 'Plan a trip opens the planner', f.url().replace(WEB, '') + ' ' + await shot(f, 'feed-plan-trip'));
    // Guest: Plan a trip asks to sign in.
    const { ctx: gctx, page: gp } = await context(browser, { label: 'guest' });
    await go(gp, '/feed');
    await tid(gp, 'feed-plan-trip').click();
    await gp.waitForURL(/\/login/, { timeout: 6000 }).catch(() => {});
    ok(/\/login/.test(gp.url()), '6 feed', 'guest: Plan a trip goes to log in', gp.url().replace(WEB, ''));
    await gctx.close();
    // 1280.
    const { ctx: wctx, page: w } = await context(browser, { user: B, width: 1280, label: 'B' });
    await go(w, '/feed');
    await visible(w.locator('[data-testid^="weather-forecast-day-"]'), 15000);
    await layout(w, '6 feed', '/feed at 1280');
    await shot(w, 'feed-1280');
    await wctx.close();
    await ctx.close();
  });

  // ---------------- key screens at 1280 ----------------
  await step('1280', async () => {
    const { ctx, page: w } = await context(browser, { user: A, width: 1280, label: 'A' });
    await go(w, '/');
    await homeSearch(w, 'momo');
    ok(await w.locator('[data-testid^="booking-widget-pill-listing-"]').count() > 0, '1280', 'home search suggestions at 1280');
    await shot(w, 'home-1280-momo');
    await layout(w, '1280', '/');
    for (const p of ['/search?q=Ghum', `/listing/${spot.id}`, '/saved', '/notifications', '/spots']) {
      await go(w, p);
      await w.waitForTimeout(800);
      await layout(w, '1280', p);
      await shot(w, '1280' + p.replace(/[/?=&]/g, '_'));
    }
    await ctx.close();
  });

  // ---------------- 8. Real sign-in and sign-out ----------------
  await step('8 login', async () => {
    const { ctx, page: l } = await context(browser, { label: 'login' });
    await go(l, '/login');
    // The phone number comes first; a new account gives its name on the code screen.
    await tid(l, 'login-phone').waitFor({ timeout: 6000 });
    const ph = `98${String(Date.now()).slice(-8)}`;
    const input = (await tid(l, 'login-phone').evaluate((e) => e.tagName)) === 'INPUT' ? tid(l, 'login-phone') : tid(l, 'login-phone').locator('input');
    await input.fill(ph);
    await tid(l, 'login-agree').check();
    const [resp] = await Promise.all([
      l.waitForResponse((r) => r.url().includes('/auth/otp/send'), { timeout: 8000 }),
      tid(l, 'login-send-otp').click(),
    ]);
    const otp = (await resp.json()).mock_otp;
    ok(!!otp, '8 login', 'code sent (mock)');
    await tid(l, 'login-otp').waitFor({ timeout: 6000 });
    ok(/whatsapp/i.test(await tid(l, 'login-sent-via').innerText().catch(() => '')), '8 login', 'says the code went on WhatsApp');
    const otpIn = (await tid(l, 'login-otp').evaluate((e) => e.tagName)) === 'INPUT' ? tid(l, 'login-otp') : tid(l, 'login-otp').locator('input');
    await otpIn.fill(otp);
    await tid(l, 'login-verify').click();
    ok(/name/i.test(await tid(l, 'login-error').innerText().catch(() => '')), '8 login', 'a new account without a name is asked for it');
    const nameIn = (await tid(l, 'login-name').evaluate((e) => e.tagName)) === 'INPUT' ? tid(l, 'login-name') : tid(l, 'login-name').locator('input');
    await nameIn.fill(`Login Walk${T}`);
    await tid(l, 'login-verify').click();
    await l.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 8000 }).catch(() => {});
    const tok = await l.evaluate(() => localStorage.getItem('token'));
    ok(!!tok && !l.url().includes('/login'), '8 login', 'signed in and sent on', l.url().replace(WEB, ''));
    await shot(l, 'login-done');
    // Sign out.
    await go(l, '/profile/edit');
    await tid(l, 'account-sign-out').click();
    await l.waitForTimeout(1200);
    const tok2 = await l.evaluate(() => localStorage.getItem('token'));
    ok(!tok2, '8 login', 'sign out clears the session');
    await go(l, '/saved');
    ok(await visible(tid(l, 'saved-guest'), 6000), '8 login', 'after sign out, Saved asks to log in');
    await shot(l, 'signed-out');
    await ctx.close();
  });

  // Clean up the test spot this walk published.
  if (spotId && admin) await call(`/admin/spots/${spotId}`, { method: 'DELETE', token: admin });
  await aCtx.close(); await bCtx.close(); await cCtx.close();
  await browser.close();
  console.log(`\nscreenshots: ${OUT}`);
  console.log(problems.length ? `\n${problems.length} PROBLEMS\n${problems.join('\n')}` : '\nALL DISCOVERY FLOWS WORK');
})().catch((e) => { console.error(e); process.exit(1); });
