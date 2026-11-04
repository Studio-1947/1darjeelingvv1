// Run against a local server started with MESSAGING_PROVIDER=mock MOCK_PAYMENTS=true and the
// website on 127.0.0.1:3100 (see tests/walk/README or site-walk.cjs). Usage:
//   PLAYWRIGHT=<path to playwright> CHROME_EXE=<chrome> ADMIN_PASSWORD=<local admin pw> node tests/walk/host-live-walk.cjs [outdir]
// Each host type from sign-in to live, clicking like a person: sign up, pay, finish the
// profile, send documents, the team approves, then the listing is public.
const { chromium } = require(process.env.PLAYWRIGHT);
const fs = require('fs');
const path = require('path');
const WEB = 'http://127.0.0.1:3100';
const API = 'http://localhost:8020/api';
const OUT = path.resolve(process.argv[2] || 'host-live-walk-out');
fs.mkdirSync(OUT, { recursive: true });
// A real 64x64 PNG, made unique per copy so uploads are not treated as duplicates.
const zlib = require('zlib');
function png(seed) {
  const w = 64, h = 64;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 4 + seed * 31) & 255; raw[o + 1] = (y * 4 + seed * 17) & 255; raw[o + 2] = (seed * 53) & 255; }
  const crc = (b) => { let c, crcT = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = crcT[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const IMG = [...Array(10)].map((_, i) => { const f = path.join(OUT, `img${i}.png`); fs.writeFileSync(f, png(i + 1)); return f; });

const TYPES = (process.env.TYPES || 'homestay,driver,cafe,shop').split(',');
const report = [];
const line = (type, ok, m, x = '') => { const s = `${ok ? 'OK  ' : 'FAIL'} [${type}] ${m}${x ? ' | ' + x : ''}`; console.log(s); if (!ok) report.push(s); };
const j = async (m, p, body, token) => { const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, d: await r.json().catch(() => null) }; };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_EXE });
  const admin = (await j('POST', '/auth/admin/login', { phone: 'admin', password: process.env.ADMIN_PASSWORD || 'local_admin_pw' })).d.token;
  for (const type of TYPES) {
    console.log(`\n=== ${type} ===`);
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['geolocation'], geolocation: { latitude: 27.0418, longitude: 88.2663, accuracy: 12 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) errs.push(`${r.status()} ${r.url().replace(/^.*\/api/, '')}`); });
    let n = 0;
    const snap = (name) => p.screenshot({ path: path.join(OUT, `${type}-${String(++n).padStart(2, '0')}-${name}.png`) });
    const digits = '8' + String(Date.now()).slice(-9);
    const name = `Live ${type} ${digits.slice(-4)}`;

    try {
      // 1. Sign in as a host.
      await p.goto(WEB + '/login', { waitUntil: 'networkidle' });
      await p.click('[data-testid="role-provider"]');
      await p.fill('[data-testid="login-phone"]', digits);
      const sent = p.waitForResponse((r) => r.url().includes('/auth/otp/send'));
      await p.click('[data-testid="login-send-otp"]');
      await p.fill('[data-testid="login-otp"]', (await (await sent).json()).mock_otp);
      if (await p.locator('[data-testid="login-name"]').count()) await p.fill('[data-testid="login-name"]', `Owner ${digits.slice(-4)}`);
      await p.click('[data-testid="login-verify"]');
      await p.waitForTimeout(2000);
      if (!p.url().includes('/provider/onboard')) await p.goto(WEB + '/provider/onboard', { waitUntil: 'networkidle' });
      line(type, true, 'signed in as host');

      // 2. Business type and name.
      await p.locator('select').first().selectOption(type);
      await p.locator('input').first().fill(name);
      await p.getByRole('button', { name: /next/i }).first().click();
      await p.waitForTimeout(1000);

      // 3. The type's form.
      if (type === 'driver') {
        await p.getByRole('button', { name: /^\+ / }).first().click();
        await p.waitForTimeout(300);
      }
      const search = p.locator('[data-testid="location-search"]');
      if (await search.count()) {
        await search.first().click();
        await search.first().fill('Chow');
        await p.waitForTimeout(800);
        const pick = p.locator('[data-testid="location-landmark-0"], [data-testid="location-result-0"]').first();
        if (await pick.count()) await pick.click();
        else line(type, false, 'map search offers no place to pick');
        await p.waitForTimeout(400);
      }
      for (const ta of await p.locator('textarea:visible').all()) if (!(await ta.inputValue())) await ta.fill('Family-run in Darjeeling for ten years. Warm welcome, local food and honest prices.');
      for (const inp of await p.locator('input:visible').all()) {
        const tp = (await inp.getAttribute('type')) || 'text';
        const ph = ((await inp.getAttribute('placeholder')) || '').toLowerCase();
        const im = (await inp.getAttribute('inputmode')) || '';
        const tid = (await inp.getAttribute('data-testid')) || '';
        const aria = ((await inp.getAttribute('aria-label')) || '').toLowerCase();
        if (['file', 'checkbox', 'radio', 'hidden'].includes(tp) || tid === 'location-search') continue;
        if (await inp.inputValue()) continue;
        if (tp === 'tel' || im === 'tel' || tid === 'onboard-phone' || /phone|mobile|98765/.test(ph)) { await inp.fill('9' + digits.slice(-9)); continue; }
        if (tp === 'number' || im === 'numeric' || tid === 'onboard-price' || ph === '₹' || /price|rate|fare/.test(aria) || /price|rate|fare|₹|^\d+$/.test(ph)) { await inp.fill('1800'); continue; }
        if (/http|instagram|facebook|youtube|website|url|@/.test(ph)) continue;
        await inp.fill(/language/.test(ph) ? 'English, Nepali' : /model|car/.test(ph) ? 'Bolero' : /number/.test(ph) ? 'WB 76 A 1234' : 'Mall Road, Darjeeling');
      }
      await p.waitForTimeout(600);
      await snap('form');
      const submit = p.locator('[data-testid="onboard-submit"]');
      await submit.scrollIntoViewIfNeeded();
      if (await submit.isDisabled()) {
        const why = (await p.locator('[data-testid="onboard-missing"]').allInnerTexts()).join(' ').replace(/\s+/g, ' ');
        line(type, false, 'form still blocked after filling', why);
        await snap('blocked');
        await ctx.close();
        continue;
      }
      await submit.click();
      await p.waitForTimeout(2000);
      const formMsg = (await p.locator('text=/must|required|invalid|failed/i').allInnerTexts()).join(' ');
      if (formMsg) line(type, false, 'form refused on submit', formMsg.slice(0, 200));

      // 4. Pay (mock checkout).
      const pay = p.getByRole('button', { name: /pay|complete/i }).last();
      await pay.click();
      await p.waitForTimeout(2500);
      const token = await p.evaluate(() => localStorage.getItem('token'));
      let me = (await j('GET', '/providers/me', null, token)).d?.provider;
      line(type, me?.plan_active === true, 'plan paid (₹598.80)', `status ${me?.status}`);
      if (!me?.plan_active) { await snap('not-paid'); await ctx.close(); continue; }

      // 5. Profile: the board's mandatory items before documents.
      const missing = (me.profile_missing || []).map((m) => m.label);
      line(type, true, 'profile items still needed after sign-up', missing.join(', ') || 'none');
      if (missing.length) {
        await p.goto(WEB + '/provider/profile', { waitUntil: 'networkidle' });
        await p.waitForTimeout(1500);
        await snap('profile');
        for (const input of await p.locator('input[type="file"][multiple]').all()) await input.setInputFiles(IMG.slice(0, 8)).catch(() => {});
        await p.waitForTimeout(4000);
        const hn = p.locator('[data-testid="profile-host-name"]');
        if ((await hn.count()) && !(await hn.inputValue())) await hn.fill(`Owner ${digits.slice(-4)}`);
        await p.click('[data-testid="profile-save"]').catch(() => {});
        await p.waitForTimeout(2500);
        await snap('profile-saved');
        me = (await j('GET', '/providers/me', null, token)).d?.provider;
        const still = (me.profile_missing || []).map((m) => m.label);
        line(type, still.length === 0, 'profile completed on the profile page', still.join(', ') || 'all done');
      }

      // 6. Documents from the dashboard.
      await p.goto(WEB + '/provider/dashboard', { waitUntil: 'networkidle' });
      await p.waitForTimeout(1200);
      const up = p.getByRole('button', { name: /upload documents/i }).first();
      if (await up.count()) await up.click();
      await p.waitForTimeout(1200);
      const nFiles = await p.locator('input[type="file"]').count();
      const CLIP = path.join(OUT, 'clip.mp4');
      for (let i = 0; i < nFiles; i++) {
        const box = p.locator('input[type="file"]').nth(i);
        const accept = (await box.getAttribute('accept')) || '';
        await box.setInputFiles(/video/.test(accept) && !/image/.test(accept) ? CLIP : IMG[i]).catch(() => {});
        await p.waitForTimeout(1500);
      }
      // Anything the server still wants, by name.
      const kyc = (await j('GET', '/providers/me/kyc', null, token)).d;
      const want = JSON.stringify(kyc || {}).slice(0, 0);
      const needed = (kyc?.requirements || kyc?.items || []).filter((r) => r.required && !['pending', 'approved', 'uploaded'].includes(r.status));
      if (needed.length) line(type, false, 'documents still needed after uploading every box', needed.map((r) => r.label || r.docType || r.doc_type).join(', '));
      await p.waitForTimeout(1200);
      await snap('documents');
      const docErr = (await p.locator('text=/upload failed|could not|complete your profile|profile.*first/i').allInnerTexts()).join(' ');
      if (docErr) line(type, false, 'documents refused', docErr.slice(0, 200));
      // The location check on the same page.
      const maps = p.locator('[data-testid="location-maps-url"]');
      if (await maps.count()) {
        await maps.fill('https://www.google.com/maps/place/Chowrasta/@27.0418,88.2663,17z');
        await p.click('[data-testid="location-check-run"]');
        await p.waitForTimeout(2500);
      } else if (await p.locator('[data-testid="location-check-live_capture"]').count()) {
        await p.click('[data-testid="location-check-run"]');
        await p.waitForTimeout(2500);
      }
      const locErr = (await p.locator('[data-testid="location-check-error"]').allInnerTexts()).join(' ');
      const locLeft = await p.locator('[data-testid^="location-check-"]').count();
      if (['homestay', 'cafe', 'shop'].includes(type)) line(type, !locErr && locLeft === 0, 'location check done on the website', locErr || (locLeft ? 'still shown' : 'verified'));
      await snap('location');
      const docs = ((await j('GET', '/admin/kyc?status=pending&limit=200', null, admin)).d?.documents || []).filter((d) => d.provider_id === me.id);
      line(type, docs.length >= 1, 'documents reach the team', `${docs.length} uploaded from ${nFiles} boxes`);

      // 7. Team approves.
      for (const d of docs) await j('POST', `/admin/kyc/${d.id}/review`, { decision: 'approve' }, admin);
      me = (await j('GET', '/providers/me', null, token)).d?.provider;
      line(type, me.kyc_status === 'verified' && !me.approval_pending, 'approved and live', `kyc ${me.kyc_status}, waiting ${me.approval_pending}`);

      // 8. Public: listing, host page and category page as a guest.
      const listing = ((await j('GET', `/listings?type=${type}&limit=100`)).d?.items || []).find((l) => l.provider_id === me.id || l.title === name);
      line(type, !!listing, 'listing is public', listing?.title);
      const guest = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
      if (listing) {
        await guest.goto(`${WEB}/listing/${listing.id}`, { waitUntil: 'networkidle' });
        await guest.waitForTimeout(1500);
        const ok = (await guest.locator(`text=${listing.title}`).count()) > 0 && (await guest.locator('text=/page not found|something went wrong/i').count()) === 0;
        line(type, ok, 'listing page opens for a guest', guest.url().replace(WEB, ''));
      }
      await guest.goto(WEB + me.page_path, { waitUntil: 'networkidle' });
      await guest.waitForTimeout(1200);
      line(type, (await guest.locator('[data-testid="badge-verified"]').count()) > 0 && (await guest.locator('[data-testid="badge-member"]').count()) > 0, 'host page shows the blue tick and Member badge', me.page_path);
      await guest.screenshot({ path: path.join(OUT, `${type}-zz-host-page.png`) });
      await guest.context().close();
      if (errs.length) line(type, false, 'page or server errors', errs.slice(0, 4).join(' / '));
    } catch (e) {
      line(type, false, 'walk crashed', e.message.split('\n')[0]);
      await snap('crash').catch(() => {});
    }
    await ctx.close();
  }
  await b.close();
  console.log(report.length ? `\n${report.length} PROBLEMS:\n${report.join('\n')}` : '\nALL HOST TYPES WENT LIVE');
})();
