// Walks every website page as guest, traveller and host, at phone (390) and desktop (1280) width.
// Per page: crashes, console errors, failed API calls, "page not found", sideways scrolling.
// Per role: the actions a person must be able to reach on a phone (sign out, saved, edit profile...).
// Also follows every internal link it sees and flags any that land on "page not found".
// Run before a release, against a local stack (API on :8020, website on 127.0.0.1:3100):
//   PLAYWRIGHT=<path to playwright package> CHROME_EXE=<chromium binary> HOST_PHONE=<an active host's phone> //   node tests/walk/site-walk.cjs <screenshot folder>
// Prints NO PROBLEMS FOUND, or one line per problem.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const BASE = 'http://127.0.0.1:3100';
const API = 'http://127.0.0.1:8020/api';
const HOST_PHONE = process.env.HOST_PHONE;

async function signIn(phone, name, role) {
  const s = await (await fetch(`${API}/auth/otp/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, channel: 'whatsapp' }) })).json();
  const v = await (await fetch(`${API}/auth/otp/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, otp: s.mock_otp || '123456', name, role }) })).json();
  if (!v.token) throw new Error('sign-in failed: ' + JSON.stringify(v));
  return v;
}

const PUBLIC = ['/', '/explore', '/spots', '/homestays', '/drivers', '/guides', '/shops', '/cafes', '/events', '/biodiversity',
  '/search', '/search?q=momo', '/feed', '/login', '/about', '/privacy', '/terms', '/refunds', '/contact', '/responsible',
  '/policies', '/delete-account', '/provider/onboard'];
const TRAVELLER = ['/dashboard', '/my-trips', '/saved', '/profile/edit', '/profile/edit?setup=1', '/support', '/explore', '/feed'];
const HOST = ['/provider/dashboard', '/my-listings', '/provider/profile', '/feed', '/profile/edit'];

// What each role must be able to reach on a phone, and where: [page, selector, label].
const MUST_REACH = {
  traveller: [
    ['/dashboard', '[data-testid=account-sign-out]', 'Log out'],
    ['/dashboard', '[data-testid=dashboard-saved]', 'Saved places'],
    ['/dashboard', '[data-testid=account-edit-profile]', 'Edit profile'],
    ['/dashboard', '[data-testid=account-switch-business]', 'Switch to Business / list a business'],
    ['/dashboard', '[data-testid=panel-feedback]', 'Feedback for aangan'],
    ['/', '[data-testid=bottom-nav-trips]', 'My Trips tab'],
    ['/', '[data-testid=bottom-nav-explore]', 'Explore tab'],
    ['/', '[data-testid=bottom-nav-feed]', 'Feed tab'],
    ['/', '[data-testid=bottom-nav-account]', 'Account tab'],
  ],
  host: [
    ['/provider/profile', '[data-testid=account-sign-out]', 'Log out'],
    ['/provider/dashboard', 'text=Switch to Traveller', 'Switch to Traveller'],
    ['/provider/dashboard', '[data-testid=bottom-nav-trips]', 'My Listings tab'],
    ['/provider/dashboard', '[data-testid=bottom-nav-account]', 'Profile tab'],
    ['/provider/dashboard', '[data-testid=host-figures]', 'Dashboard figures'],
    ['/provider/dashboard', '[data-testid=host-page-card]', 'Link to my public page'],
    ['/provider/dashboard', '[data-testid=host-reviews-card]', 'Ratings and reviews'],
  ],
  guest: [
    ['/', 'a[data-testid=header-login]', 'Log in'],
    ['/', '[data-testid=header-download-app]', 'Get the app'],
    ['/homestays', '[data-testid=near-me-toggle]', 'Near me filter'],
  ],
};

const IGNORE_CONSOLE = [/Download the React DevTools/, /\[vite\]/, /favicon/, /service-worker/i, /Failed to load resource/, /maps\.googleapis|tile|openstreetmap/i, /accounts\.google\.com/];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE });
  const problems = [];
  const seenLinks = new Set();
  const listings = await (await fetch(`${API}/listings?limit=5`)).json();
  const listingId = listings.items?.[0]?.id;
  const extraPublic = listingId ? [`/listing/${listingId}`] : [];

  const traveller = await signIn(`+9190000${String(Date.now()).slice(-5)}`, 'Audit Traveller', 'tourist');
  const host = HOST_PHONE ? await signIn(HOST_PHONE, 'Audit Host', 'provider') : null;
  // The host's public page (aanganerp.in/<type>/<slug>) is walked as everyone.
  const hostPage = host ? (await (await fetch(`${API}/providers/me`, { headers: { Authorization: `Bearer ${host.token}` } })).json()).provider?.page_path : null;
  if (hostPage) { extraPublic.push(hostPage); MUST_REACH.guest.push([hostPage, '[data-testid=host-mini-site]', 'Host page']); }
  const roles = [
    { name: 'guest', token: null, mode: 'tourist', pages: [...PUBLIC, ...extraPublic] },
    { name: 'traveller', token: traveller.token, mode: 'tourist', pages: [...TRAVELLER, ...extraPublic] },
    ...(host ? [{ name: 'host', token: host.token, mode: 'provider', pages: [...HOST, ...(hostPage ? [hostPage] : [])] }] : []),
  ];

  for (const role of roles) {
    for (const width of [390, 1280]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
      await ctx.addInitScript(([token, mode]) => {
        try {
          if (token) localStorage.setItem('token', token); else localStorage.removeItem('token');
          localStorage.setItem('mode', mode);
        } catch {}
      }, [role.token, role.mode]);
      const page = await ctx.newPage();
      let current = '';
      const note = (what) => problems.push(`[${role.name} ${width}px] ${current}: ${what}`);
      page.on('pageerror', (e) => note('crash: ' + e.message.slice(0, 160)));
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const t = m.text();
        if (IGNORE_CONSOLE.some((r) => r.test(t))) return;
        note('console error: ' + t.slice(0, 160));
      });
      page.on('response', (r) => {
        const u = r.url();
        if (!u.includes('/api/')) { if (r.status() >= 400 && !u.includes('loremflickr.com')) note(`asset ${r.status()} ${u.slice(0, 140)}`); return; }
        if (r.status() >= 500) note(`API ${r.status()} ${u.replace(/^.*\/api/, '/api')}`);
        if (r.status() === 404 && !/\/api\/(posts\/[^/]+|listings\/[^/]+\/reviews)/.test(u)) note(`API 404 ${u.replace(/^.*\/api/, '/api')}`);
      });

      for (const path of role.pages) {
        current = path;
        await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1800);
        if (await page.locator('[data-testid=not-found]').count()) note('shows "page not found"');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 2) note(`scrolls sideways by ${overflow}px`);
        const hrefs = await page.$$eval('a[href^="/"]', (as) => as.map((a) => a.getAttribute('href')));
        hrefs.forEach((h) => seenLinks.add(`${role.name}|${h.split('#')[0]}`));
        if (width === 390) await page.screenshot({ path: `${process.argv[2]}/${role.name}${path.replace(/[/?=&]/g, '_') || '_home'}.png` });
      }

      if (width === 390) {
        for (const [path, sel, label] of MUST_REACH[role.name] || []) {
          current = path;
          await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(1500);
          const el = page.locator(sel).first();
          if (!(await el.count())) { note(`cannot find "${label}" on a phone`); continue; }
          await el.scrollIntoViewIfNeeded().catch(() => {});
          if (!(await el.isVisible())) note(`"${label}" exists but is hidden on a phone`);
        }
      }

      // Every internal link seen as this role must open a real page.
      if (width === 1280) {
        for (const key of [...seenLinks].filter((k) => k.startsWith(role.name + '|'))) {
          const href = key.split('|')[1];
          if (role.pages.includes(href)) continue;
          current = 'link ' + href;
          await page.goto(BASE + href, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(900);
          if (await page.locator('[data-testid=not-found]').count()) note('link leads to "page not found"');
        }
      }
      await ctx.close();
    }
  }

  // Sign-out really signs out (phone, traveller).
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript((token) => { if (!sessionStorage.getItem('done')) { localStorage.setItem('token', token); sessionStorage.setItem('done', '1'); } }, traveller.token);
    const page = await ctx.newPage();
    await page.goto(BASE + '/dashboard');
    await page.waitForTimeout(1500);
    await page.locator('[data-testid=account-sign-out]').click();
    await page.waitForTimeout(1200);
    const still = await page.evaluate(() => !!localStorage.getItem('token'));
    if (still) problems.push('[traveller 390px] Log out did not clear the sign-in');
    await ctx.close();
  }

  await browser.close();
  console.log(`checked roles: ${roles.map((r) => r.name).join(', ')}; links followed: ${seenLinks.size}`);
  console.log(problems.length ? problems.join('\n') : 'NO PROBLEMS FOUND');
})().catch((e) => { console.error(e); process.exit(1); });
