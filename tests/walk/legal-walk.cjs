// Checks the legal / action-list fixes of 22 Nov 2026 in a real browser against the local stack
// (MESSAGING_PROVIDER=mock). Usage:
//   PLAYWRIGHT=<frontend/node_modules/playwright> CHROME_EXE=<chromium> WEB=http://127.0.0.1:3000 \
//   STAY_ID=<a homestay with priced rooms> node tests/walk/legal-walk.cjs [outdir]
const { chromium } = require(process.env.PLAYWRIGHT);
const fs = require('fs');
const path = require('path');
const WEB = process.env.WEB || 'http://127.0.0.1:3000';
const STAY_ID = process.env.STAY_ID;
const OUT = path.resolve(process.argv[2] || 'legal-walk-out');
fs.mkdirSync(OUT, { recursive: true });
const fails = [];
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m); };
const tid = (p, id) => p.locator(`[data-testid="${id}"]`);

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_EXE });
  const errs = [];
  const mk = async (vw) => {
    const ctx = await b.newContext({ viewport: vw, userAgent: 'Mozilla/5.0 Chrome/140' });
    await ctx.addInitScript(() => sessionStorage.setItem('aangan-splash-seen', '1'));
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${p.url()}: ${e.message}`));
    return { ctx, p };
  };
  const shot = (p, n) => p.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: false });

  // ---- 1. Login: I Agree is required before a code goes out ----
  {
    const { ctx, p } = await mk({ width: 390, height: 844 });
    await p.goto(WEB + '/login', { waitUntil: 'networkidle' });
    const phone = `98${String(Date.now()).slice(-8)}`;
    await tid(p, 'login-phone').fill(phone);
    ok(await tid(p, 'login-consent').isVisible(), 'login: consent box is shown on the phone screen');
    ok((await tid(p, 'login-consent').innerText()).includes('I Agree'), 'login: the box says "I Agree"');
    ok(!(await tid(p, 'login-agree').isChecked()), 'login: the box starts unticked');
    ok(await tid(p, 'login-send-otp').isDisabled(), 'login: Continue is off until the box is ticked');
    ok(await tid(p, 'login-google').count() === 0, 'login: no Google button (not configured)');
    // Even a forced submit (Enter in the phone field) must not send a code.
    let sentEarly = false;
    p.on('request', (r) => { if (r.url().includes('/auth/otp/send') && !(globalThis.__agreed)) sentEarly = true; });
    await tid(p, 'login-phone').press('Enter');
    await p.waitForTimeout(800);
    ok(!sentEarly, 'login: Enter without ticking sends no code');
    ok(await tid(p, 'login-step-1').isVisible(), 'login: still on the phone screen');
    await shot(p, '1-login-unticked');
    globalThis.__agreed = true;
    await tid(p, 'login-agree').check();
    ok(!(await tid(p, 'login-send-otp').isDisabled()), 'login: Continue turns on once ticked');
    await shot(p, '2-login-ticked');
    const [resp] = await Promise.all([
      p.waitForResponse((r) => r.url().includes('/auth/otp/send')),
      tid(p, 'login-send-otp').click(),
    ]);
    const otp = (await resp.json()).mock_otp;
    await tid(p, 'login-otp').locator('input').or(tid(p, 'login-otp')).first().fill(otp);
    const verifyReq = p.waitForRequest((r) => r.url().includes('/auth/otp/verify'));
    await tid(p, 'login-verify').click();
    const body = JSON.parse((await verifyReq).postData() || '{}');
    ok(body.consent === true, 'login: the code check carries consent: true');
    await tid(p, 'login-step-3').waitFor({ timeout: 10000 });
    await tid(p, 'login-name').locator('input').or(tid(p, 'login-name')).first().fill('Legal Walk Guest');
    const createReq = p.waitForRequest((r) => r.url().includes('/auth/otp/verify'));
    await tid(p, 'login-create').click();
    ok(JSON.parse((await createReq).postData() || '{}').consent === true, 'login: account creation carries consent: true');
    await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10000 }).catch(() => {});
    ok(!new URL(p.url()).pathname.startsWith('/login'), 'login: signed in and left the login page');
    fs.writeFileSync(path.join(OUT, 'phone.txt'), phone);
    await ctx.close();
  }

  // ---- 2. Logo + Beta in the top-left corner, phone and desktop ----
  for (const [w, h, n] of [[390, 844, 'phone'], [1440, 900, 'desktop']]) {
    const { ctx, p } = await mk({ width: w, height: h });
    await p.goto(WEB + '/', { waitUntil: 'networkidle' });
    const brand = await tid(p, 'brand-link').boundingBox();
    const beta = await tid(p, 'beta-label').boundingBox();
    ok(!!brand && brand.x <= 24 && brand.y <= 24, `logo top-left on ${n} (x=${brand?.x}, y=${brand?.y})`);
    ok(!!beta && (await tid(p, 'beta-label').innerText()).trim() === 'Beta', `Beta beside the logo on ${n}`);
    ok(!!beta && !!brand && beta.x > brand.x && beta.x - brand.x < 160 && Math.abs((beta.y + beta.height / 2) - (brand.y + brand.height / 2)) < 8,
      `Beta sits right after the wordmark on ${n}`);
    await shot(p, `3-header-${n}`);
    await ctx.close();
  }

  const { ctx, p } = await mk({ width: 390, height: 844 });

  // ---- 3. /providers no longer 404s ----
  await p.goto(WEB + '/providers', { waitUntil: 'networkidle' });
  await p.waitForURL((u) => u.pathname === '/provider/onboard', { timeout: 10000 }).catch(() => {});
  ok(new URL(p.url()).pathname === '/provider/onboard', `/providers opens ${new URL(p.url()).pathname}`);

  // ---- 4. Policy pages ----
  await p.goto(WEB + '/privacy', { waitUntil: 'networkidle' });
  const priv = await tid(p, 'privacy-page').innerText();
  ok(priv.includes('Digital Personal Data Protection Act'), 'privacy: rewritten under the DPDP Act');
  ok(priv.includes('WBIN 1947 Studio LLP'), 'privacy: names the LLP');
  ok(!priv.includes('{{'), 'privacy: no unfilled {{placeholders}}');
  ok(priv.includes('aanganerp@gmail.com'), 'privacy: support email filled in');
  ok(/18 or older/.test(priv) && !/\b13\b/.test(priv), 'privacy: age is 18');
  ok(!/sign in via a third-party service/i.test(priv), 'privacy: old Google sign-in paragraph gone');
  ok(/do not upload an Aadhaar/i.test(priv), 'privacy: tells hosts not to upload Aadhaar');
  ok(/Grievance Officer/.test(priv), 'privacy: grievance contact present');
  await p.screenshot({ path: path.join(OUT, '4-privacy.png'), fullPage: true });

  await p.goto(WEB + '/contact', { waitUntil: 'networkidle' });
  const contact = await tid(p, 'contact-page').innerText();
  ok(!contact.includes('{{') && contact.includes('aanganerp@gmail.com'), 'contact: email cards filled in');
  ok(contact.includes('/provider/onboard'), 'contact: For Providers names the real page');

  await p.goto(WEB + '/terms', { waitUntil: 'networkidle' });
  await tid(p, 'terms-page').waitFor({ timeout: 10000 }).catch(() => {});
  const terms = await p.locator('body').innerText();
  ok(terms.includes('ticking "I Agree"'), 'terms: consent is by ticking I Agree');

  await p.goto(WEB + '/about', { waitUntil: 'networkidle' });
  ok((await tid(p, 'site-footer').innerText()).includes('Beta'), 'footer: Beta beside the wordmark');

  // ---- 5. Listing: room-aware price, no review form before a stay ----
  if (STAY_ID) {
    await p.goto(WEB + `/listing/${STAY_ID}`, { waitUntil: 'networkidle' });
    const lead = await p.locator('.ag-listing-lead').first().innerText().catch(() => '');
    ok(/room \/ night/.test(lead), `listing: headline price is per room per night ("${lead.replace(/\s+/g, ' ')}")`);
    await shot(p, '5-listing-top');
    await tid(p, 'detail-reviews').scrollIntoViewIfNeeded();
    ok(await tid(p, 'review-submit').count() === 0, 'listing (signed out): no Send review button');
    ok(await p.locator('[data-testid^="review-star-"]').count() === 0, 'listing (signed out): no stars to tap');
    ok(await tid(p, 'review-signed-out').isVisible(), 'listing (signed out): says reviews come from real trips');
    await tid(p, 'detail-reviews').screenshot({ path: path.join(OUT, '6-reviews-signed-out.png') });
    const hero = await p.locator('.ag-listing-tag.ok').allInnerTexts();
    ok(hero.every((t) => t.trim() !== 'Verified'), `listing: no bare "Verified" tag (${hero.join(', ') || 'none'})`);
  }

  await p.goto(WEB + '/homestays', { waitUntil: 'networkidle' });
  await p.locator('.ag-category-price b').first().waitFor({ timeout: 15000 }).catch(() => {});
  const cards = await p.locator('.ag-category-price').allInnerTexts();
  ok(cards.some((c) => /room \/ night/.test(c)), 'category: a homestay with rooms shows per room per night');
  ok(cards.some((c) => /person \/ night/.test(c)), 'category: a homestay without rooms keeps per person per night');
  const vb = await p.locator('.ag-category-vb').first().getAttribute('aria-label').catch(() => null);
  ok(!vb || vb === 'Documents verified', `category: tick reads "${vb}"`);
  await shot(p, '7-homestays');
  await ctx.close();

  ok(errs.length === 0, 'no page errors' + (errs.length ? `: ${errs.join(' | ')}` : ''));
  await b.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL OK');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
