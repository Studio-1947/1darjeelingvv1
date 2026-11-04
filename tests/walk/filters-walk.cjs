// Run against a local server started with MESSAGING_PROVIDER=mock MOCK_PAYMENTS=true and the
// website on 127.0.0.1:3100 (see tests/walk/README or site-walk.cjs). Usage:
//   PLAYWRIGHT=<path to playwright> CHROME_EXE=<chrome> ADMIN_PASSWORD=<local admin pw> node tests/walk/filters-walk.cjs [outdir]
// Category filters as a traveller standing at Chowrasta: Near me (each radius), search, price,
// cab type and sort, on drivers, stays, cafes, shops and guides. Phone and desktop widths.
const { chromium } = require(process.env.PLAYWRIGHT);
const WEB = 'http://127.0.0.1:3100';
const API = 'http://localhost:8020/api';
const fails = [];
const ok = (c, m, x = '') => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}${x ? ' | ' + x : ''}`); if (!c) fails.push(m); };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_EXE });
  for (const width of [390, 1280]) {
    const ctx = await b.newContext({ viewport: { width, height: 900 }, permissions: ['geolocation'], geolocation: { latitude: Number(process.env.LAT || 27.0425), longitude: Number(process.env.LNG || 88.2663), accuracy: 20 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    const tiles = () => p.locator('[data-testid^="grid-tile-"]');
    const count = async () => { await p.waitForTimeout(500); return tiles().count(); };
    const firstLines = async (n = 40) => (await tiles().allInnerTexts()).slice(0, n).map((t) => t.replace(/\s+/g, ' '));
    for (const [path, type] of [['/drivers', 'driver'], ['/homestays', 'homestay'], ['/cafes', 'cafe'], ['/shops', 'shop'], ['/guides', 'guide']]) {
      console.log(`\n[${width}] ${path}`);
      await p.goto(WEB + path, { waitUntil: 'networkidle' });
      await p.waitForTimeout(1200);
      const all = await count();
      const api = ((await (await fetch(`${API}/listings?type=${type}&limit=60`)).json()).items || []).length;
      ok(all > 0 && all <= api, `${path}: shows the listings`, `${all} shown, ${api} on the server`);
      // Near me.
      await p.click('[data-testid="near-me-toggle"]');
      await p.waitForTimeout(1200);
      const anyN = await count();
      ok(anyN === all, `${path}: Near me on keeps every listing (any distance)`, `${anyN}`);
      const lines = await firstLines();
      const withKm = lines.filter((l) => / km · /.test(l)).length;
      ok(withKm > 0, `${path}: distances are shown`, `${withKm}/${lines.length} with km, first: ${lines[0]?.slice(0, 70)}`);
      const kms = lines.map((l) => { const m = l.match(/(?:≈ )?([\d.]+) km · /); return m ? Number(m[1]) : Infinity; });
      ok(kms.every((k, i) => i === 0 || k >= kms[i - 1] - 0.51), `${path}: nearest first`, kms.slice(0, 6).join(', '));
      let prev = Infinity;
      for (const r of [25, 10, 5]) {
        await p.click(`[data-testid="near-${r}"]`);
        const n = await count();
        const ks = (await firstLines()).map((l) => { const m = l.match(/(?:≈ )?([\d.]+) km · /); return m ? Number(m[1]) : Infinity; });
        ok(ks.every((k) => k <= r + 0.5) && n <= prev, `${path}: within ${r} km keeps only closer ones`, `${n} shown`);
        prev = n;
      }
      await p.click('[data-testid="near-any"]');
      ok((await count()) === all, `${path}: any distance brings them all back`);
      await p.click('[data-testid="near-me-toggle"]');
      ok((await count()) === all, `${path}: Near me off`);
      // Search.
      const firstTitle = (await firstLines(1))[0]?.split(' ').slice(0, 1).join(' ');
      if (firstTitle) {
        await p.fill('[data-testid="category-search-input"]', firstTitle);
        const n = await count();
        ok(n >= 1 && n <= all, `${path}: search narrows the list`, `"${firstTitle}" -> ${n}`);
        await p.fill('[data-testid="category-search-input"]', 'zzzz-nothing');
        ok((await count()) === 0 && (await p.locator('[data-testid="category-empty"]').count()) > 0, `${path}: search with no match says so`);
        await p.fill('[data-testid="category-search-input"]', '');
      }
      // Price (desktop shows chips; phone opens the filter panel).
      const cap = type === 'driver' ? 1000 : 1500;
      const price = p.locator(`[data-testid="filter-price-${cap}"]:visible`).first();
      if (type === 'driver' || type === 'homestay') {
        if (await price.count()) {
          await price.click();
          const prices = (await firstLines()).map((l) => { const m = l.match(/₹\s?([\d,]+)/); return m ? Number(m[1].replace(/,/g, '')) : 0; });
          ok(prices.every((x) => x > 0 && x <= cap), `${path}: under ₹${cap} keeps only cheaper ones`, `${prices.length} shown: ${prices.slice(0, 5).join(', ')}`);
          await p.locator('[data-testid="filter-price-any"]:visible').first().click();
        } else ok(false, `${path}: price filter is reachable`);
      }
      if (type === 'driver') {
        for (const cab of ['hatchback', 'suv']) {
          const c = p.locator(`[data-testid="filter-cab-${cab}"]:visible`).first();
          if (await c.count()) { await c.click(); ok((await count()) <= all, `${path}: cab ${cab} filter works`, `${await count()} shown`); }
          else ok(false, `${path}: cab ${cab} filter is reachable`);
        }
        await p.locator('[data-testid="filter-cab-all"]:visible').first().click().catch(() => {});
      }
      // Sort by price.
      const sort = p.locator('[data-testid="category-sort-select"]:visible').first();
      if (await sort.count()) {
        await sort.selectOption('price_asc');
        const prices = (await firstLines()).map((l) => { const m = l.match(/₹\s?([\d,]+)/); return m ? Number(m[1].replace(/,/g, '')) : 0; }).filter((x) => x > 0);
        ok(prices.every((x, i) => i === 0 || x >= prices[i - 1]), `${path}: sort by price, low to high`, prices.slice(0, 6).join(', '));
        await sort.selectOption('recommended');
      }
      const sideways = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      ok(!sideways, `${path}: no sideways scroll`);
    }
    // A driver trip search from the home widget.
    await p.goto(`${WEB}/drivers?from=NJP&to=Darjeeling`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1200);
    ok((await count()) >= 1, `[${width}] driver trip search finds drivers on that route`, `${await count()} drivers for NJP → Darjeeling`);
    
    if (errs.length) ok(false, `[${width}] page errors`, errs.join(' / ').slice(0, 200));
    await ctx.close();
  }
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL FILTER CHECKS PASSED');
})();
