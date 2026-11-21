// The admin dashboard (frontend-admin), used the way the team uses it, with every decision checked
// on the other side (host dashboard, traveller dashboard, public site, API):
//   1 sign in / refresh / log out      2 Dashboard figures and tabs     3 KYC: approve a homestay and
//   a cafe, reject a driver document and watch it come back     4 Moderation: trip plan, feed post,
//   comment, place suggestions     5 Feedback     6 Home deliveries     7 Push to one person
//   8 every admin screen at 1280px and 390px.
// Makes its own hosts (website sign-up, pay, profile, documents, as host-live-walk.cjs) and travellers.
// Needs a local stack with MESSAGING_PROVIDER=mock and MOCK_PAYMENTS=true. Never point it at the live site.
// Usage:
//   ADMIN_PASSWORD=<local admin pw> ADMIN_WEB=http://localhost:5173 WEB=http://localhost:3000 \
//     API=http://localhost:8001/api [PLAYWRIGHT=<path to playwright>] [CHROME_EXE=<chrome>] \
//     node tests/walk/admin-walk.cjs [outdir]
// ADMIN_API_FROM: the API address the admin bundle calls when VITE_API_URL is unset
// (frontend-admin/src/lib/api.ts default, http://localhost:8000/api); the walk sends those calls to API.
// Prints ALL ADMIN FLOWS WORK, or one line per problem.
const PW = process.env.PLAYWRIGHT || 'C:/Users/soumi/Desktop/1darjeelingvv1/frontend/node_modules/@playwright/test';
const { chromium } = require(PW);
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ADMIN = process.env.ADMIN_WEB || 'http://127.0.0.1:5174';
const WEB = process.env.WEB || 'http://127.0.0.1:3100';
const API = process.env.API || 'http://127.0.0.1:8020/api';
const ADMIN_API_FROM = process.env.ADMIN_API_FROM || 'http://localhost:8000/api';
const PASSWORD = process.env.ADMIN_PASSWORD;
const OUT = path.resolve(process.argv[2] || process.env.OUT || 'admin-walk-out');
fs.mkdirSync(OUT, { recursive: true });
if (!PASSWORD) { console.log('Set ADMIN_PASSWORD'); process.exit(2); }
if (/aanganerp\.in|1darjeeling\.in/.test(ADMIN + WEB + API)) { console.log('Refusing to run against the live site'); process.exit(2); }

// ---------- files to upload ----------
function png(seed) {
  const w = 64, h = 64;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 4 + seed * 31) & 255; raw[o + 1] = (y * 4 + seed * 17) & 255; raw[o + 2] = (seed * 53) & 255; }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = (b) => { let r = 0xffffffff; for (const x of b) r = crcT[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const RUN = String(Date.now()).slice(-6);
const IMG = [...Array(12)].map((_, i) => { const f = path.join(OUT, `img${i}.png`); fs.writeFileSync(f, png(i + 1 + (Number(RUN) % 50))); return f; });
const PDF = path.join(OUT, 'doc.pdf');
{
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`];
  const stream = `BT /F1 18 Tf 20 100 Td (KYC ${RUN}) Tj ET`;
  objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let s = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(PDF, s);
}
const CLIP = path.join(OUT, 'clip.mp4');
if (!fs.existsSync(CLIP)) {
  try { require('child_process').execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15', '-t', '2', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', CLIP]); }
  catch { fs.writeFileSync(CLIP, Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(32)])); }
}

// ---------- reporting ----------
const report = [];
const notes = [];
const line = (step, ok, m, x = '') => { const s = `${ok ? 'OK  ' : 'FAIL'} [${step}] ${m}${x ? ' | ' + x : ''}`; console.log(s); if (!ok) report.push(s); return ok; };
const note = (step, m) => { const s = `NOTE [${step}] ${m}`; console.log(s); notes.push(s); };
const j = async (m, p, body, token) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, d: await r.json().catch(() => null) };
};
let phoneSeq = 0;
const newPhone = (lead) => lead + String(Date.now() + (phoneSeq++) * 7919).slice(-9);
async function signIn(phone, name, role) {
  const s = (await j('POST', '/auth/otp/send', { phone, channel: 'whatsapp' })).d;
  const v = (await j('POST', '/auth/otp/verify', { phone, otp: s?.mock_otp || '123456', name, role })).d;
  if (!v?.token) throw new Error('sign-in failed: ' + JSON.stringify(v).slice(0, 200));
  return v.token;
}
const iso = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
let shotN = 0;
const shot = (page, name, full = false) => page.screenshot({ path: path.join(OUT, `${String(++shotN).padStart(3, '0')}-${name}.png`), fullPage: full }).catch(() => {});

/** Console errors, uncaught errors and API 5xx on a page. */
function watch(page) {
  const e = { console: [], page: [], server: [] };
  page.on('console', (m) => { if (m.type() === 'error') e.console.push(m.text().replace(/\s+/g, ' ').slice(0, 220)); });
  page.on('pageerror', (x) => e.page.push(x.message.split('\n')[0].slice(0, 220)));
  e.third = [];
  const ours = [ADMIN, WEB, API].map((u) => new URL(u).host);
  page.on('response', (r) => {
    if (r.status() < 500) return;
    const u = r.url();
    if (u.includes('/api/') || ours.includes(new URL(u).host)) e.server.push(`${r.status()} ${r.request().method()} ${u.includes('/api/') ? u.replace(/^.*?\/api/, '/api') : u.slice(0, 160)}`);
    else e.third.push(`${r.status()} ${u.slice(0, 120)}`);
  });
  return e;
}
function errsLine(step, what, e) {
  // A third-party image host failing (e.g. a stock-photo service) is noted, not counted; the
  // browser's matching "Failed to load resource" console line carries no URL, so it goes too.
  if (e.third.length) {
    note(step, `${what}: third-party resource failed: ${[...new Set(e.third)].slice(0, 3).join(' / ')}`);
    if (!e.server.length) e.console = e.console.filter((x) => !/Failed to load resource: the server responded with a status of 5\d\d/.test(x));
    e.third.length = 0;
  }
  const all = [...new Set([...e.page.map((x) => 'pageerror: ' + x), ...e.server.map((x) => 'API ' + x), ...e.console.map((x) => 'console: ' + x)])];
  line(step, all.length === 0, `${what}: no page errors, console errors or API 5xx`, all.slice(0, 6).join(' / '));
  e.console.length = 0; e.page.length = 0; e.server.length = 0;
}

let browser;
let rewrites = 0;
/** The admin bundle calls ADMIN_API_FROM directly when VITE_API_URL is unset; send those calls to API. */
async function adminContext(width, token) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 } });
  if (ADMIN_API_FROM.replace(/\/$/, '') !== API.replace(/\/$/, '')) {
    await ctx.route((u) => u.href.startsWith(ADMIN_API_FROM + '/'), (route) => { rewrites++; return route.continue({ url: API + route.request().url().slice(ADMIN_API_FROM.length) }); });
  }
  if (token) await ctx.addInitScript((t) => { localStorage.setItem('admin_token', t); }, token);
  return ctx;
}
/** A website tab signed in as this person (token + mode, splash skipped). */
async function webPage(token, mode, width = 390) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, permissions: ['geolocation'], geolocation: { latitude: 27.0418, longitude: 88.2663, accuracy: 12 } });
  await ctx.addInitScript(([t, m]) => { if (t) { localStorage.setItem('token', t); localStorage.setItem('mode', m); } sessionStorage.setItem('aangan-splash-seen', '1'); }, [token, mode]);
  const page = await ctx.newPage();
  const errs = watch(page);
  return { page, ctx, errs };
}
const settle = async (page, ms = 600) => { await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(ms); };
const bodyText = (page) => page.locator('body').innerText().catch(() => '');

// ---------- a new host waiting for review, made on the website (host-live-walk.cjs steps 1-6) ----------
async function onboardHost(type, opts = {}) {
  const S = `setup:${type}`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['geolocation'], geolocation: { latitude: 27.0418, longitude: 88.2663, accuracy: 12 } });
  await ctx.addInitScript(() => sessionStorage.setItem('aangan-splash-seen', '1'));
  const p = await ctx.newPage();
  const errs = watch(p);
  const digits = newPhone('8');
  const name = `Adm ${type} ${RUN}${digits.slice(-2)}`;
  const snap = (n) => shot(p, `setup-${type}-${n}`);
  try {
    await p.goto(WEB + '/login?next=' + encodeURIComponent('/provider/onboard'), { waitUntil: 'networkidle' });
    await p.fill('[data-testid="login-phone"]', digits);
    const sent = p.waitForResponse((r) => r.url().includes('/auth/otp/send'));
    await p.click('[data-testid="login-send-otp"]');
    await p.fill('[data-testid="login-otp"]', (await (await sent).json()).mock_otp);
    if (await p.locator('[data-testid="login-name"]').count()) await p.fill('[data-testid="login-name"] input, input[data-testid="login-name"]', 'Walk Host').catch(() => p.locator('[data-testid="login-name"] input').fill('Walk Host'));
    await p.click('[data-testid="login-verify"]');
    await p.waitForTimeout(2000);
    if (!p.url().includes('/provider/onboard')) await p.goto(WEB + '/provider/onboard', { waitUntil: 'networkidle' });
    const nextStep = async (step) => {
      await p.click('[data-testid="wz-next"]');
      await p.waitForTimeout(400);
      const err = (await p.locator('[data-testid="wz-err"]').allInnerTexts()).join(' ');
      if (err) line(S, false, `wizard refused at ${step}`, err);
      return !err;
    };
    await p.click(`[data-testid="wz-type-${type}"]`);
    await p.click('[data-testid="plan-now"]');
    let ok = await nextStep('type');
    if (ok) { await p.click('[data-testid="wz-place-Darjeeling"]'); ok = await nextStep('place'); }
    if (ok) { await p.fill('[data-testid="wz-name"]', name); await p.fill('[data-testid="onboard-phone"]', '9' + digits.slice(-9)); ok = await nextStep('name'); }
    if (ok && (type === 'cafe' || type === 'shop')) {
      await p.click('[data-testid="wz-add-dish"]');
      await p.fill('[data-testid="wz-dish-name-0"]', 'Veg momos');
      await p.fill('[data-testid="wz-dish-price-0"]', '120');
      ok = await nextStep('menu');
    } else if (ok) { await p.fill('[data-testid="onboard-price"]', '1800'); ok = await nextStep('price'); }
    if (ok) { await p.locator('[data-testid="wz-photos"]').setInputFiles(IMG.slice(0, 3)).catch(() => {}); await p.waitForTimeout(3000); ok = await nextStep('extras'); }
    if (!ok) { await snap('blocked'); throw new Error('wizard blocked'); }
    await p.locator('[data-testid="onboard-submit"]').click();
    await p.waitForTimeout(2000);
    const mockPay = p.locator('[data-testid="mock-payment-pay"]');
    await mockPay.waitFor({ timeout: 10000 }).catch(() => {});
    if (await mockPay.count()) await mockPay.click(); else await p.getByRole('button', { name: /pay|complete/i }).last().click();
    await p.waitForTimeout(2500);
    const token = await p.evaluate(() => localStorage.getItem('token'));
    let me = (await j('GET', '/providers/me', null, token)).d?.provider;
    if (!me?.plan_active) { await snap('not-paid'); throw new Error('plan not paid: ' + me?.status); }

    const missing = (me.profile_missing || []).map((m) => m.label);
    if (missing.length || opts.homeDelivery) {
      await p.goto(WEB + '/provider/profile', { waitUntil: 'networkidle' });
      await p.locator('[data-testid="profile-save"]').first().waitFor({ timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(500);
      for (const input of await p.locator('input[type="file"][multiple]').all()) await input.setInputFiles(IMG.slice(0, 8)).catch(() => {});
      await p.waitForTimeout(800);
      await p.waitForFunction(() => [...document.querySelectorAll('input[type="file"][multiple]')].every((i) => !i.disabled), null, { timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(500);
      const hn = p.locator('[data-testid="profile-host-name"]');
      if ((await hn.count()) && !(await hn.inputValue())) await hn.fill(`Owner ${digits.slice(-4)}`);
      if (opts.homeDelivery) await p.locator('[data-testid="profile-home-delivery"]').check({ force: true }).catch((e) => line(S, false, 'home delivery switch', e.message.split('\n')[0]));
      await p.click('[data-testid="profile-save"]').catch(() => {});
      await p.waitForTimeout(2500);
      me = (await j('GET', '/providers/me', null, token)).d?.provider;
      const still = (me.profile_missing || []).map((m) => m.label);
      if (still.length) line(S, false, 'profile still incomplete after saving', still.join(', '));
    }

    await p.goto(WEB + '/provider/dashboard', { waitUntil: 'networkidle' });
    await p.locator('[data-testid="host-figures"]').first().waitFor({ timeout: 20000 }).catch(() => {});
    await p.waitForTimeout(500);
    const up = p.getByRole('button', { name: /upload documents/i }).first();
    if (await up.count()) await up.click();
    else if (await p.locator('[data-testid="verification-cta"]').count()) await p.click('[data-testid="verification-cta"]');
    await p.waitForTimeout(1200);
    const nFiles = await p.locator('input[type="file"]').count();
    let usedPdf = false;
    for (let i = 0; i < nFiles; i++) {
      const box = p.locator('input[type="file"]').nth(i);
      const accept = (await box.getAttribute('accept')) || '';
      const video = /video/.test(accept) && !/image/.test(accept);
      let file = video ? CLIP : IMG[4 + i];
      if (!video && opts.pdf && !usedPdf && /pdf/.test(accept)) { file = PDF; usedPdf = true; }
      await box.setInputFiles(file).catch(() => {});
      await p.waitForTimeout(1500);
    }
    // A box can miss its file (the list re-renders while an upload is busy): send what is still missing.
    for (let pass = 0; pass < 2; pass++) {
      const left = ((await j('GET', '/providers/me/profile', null, token)).d?.checklist || []).filter((c) => c.kind === 'kyc' && c.required && c.state === 'missing');
      if (!left.length) break;
      for (const item of left) {
        const box = p.locator(`input[type="file"][aria-label*="${item.label.replace(/"/g, '\\"')}"]`).first();
        if (!(await box.count())) continue;
        const accept = (await box.getAttribute('accept')) || '';
        await box.setInputFiles(/video/.test(accept) && !/image/.test(accept) ? CLIP : IMG[(pass * 3 + left.indexOf(item)) % 12]).catch(() => {});
        await p.waitForTimeout(2000);
      }
    }
    const stillMissing = ((await j('GET', '/providers/me/profile', null, token)).d?.checklist || []).filter((c) => c.kind === 'kyc' && c.required && c.state === 'missing').map((c) => c.label);
    if (stillMissing.length) line(S, false, 'required documents still not sent after uploading every box twice', stillMissing.join(', '));
    const maps = p.locator('[data-testid="location-maps-url"]');
    if (await maps.count()) { await maps.fill('https://www.google.com/maps/place/Chowrasta/@27.0418,88.2663,17z'); await p.click('[data-testid="location-check-run"]'); await p.waitForTimeout(2500); }
    else if (await p.locator('[data-testid="location-check-live_capture"]').count()) { await p.click('[data-testid="location-check-run"]'); await p.waitForTimeout(2500); }
    await snap('documents');
    me = (await j('GET', '/providers/me', null, token)).d?.provider;
    const kyc = (await j('GET', '/providers/me/kyc', null, token)).d;
    const docs = kyc?.documents || [];
    line(S, docs.length >= 1, `host "${name}" made on the website and sent documents`, `${docs.length} documents (${docs.map((d) => d.doc_type + ':' + d.status).join(', ')}), kyc ${me?.kyc_status}`);
    await ctx.close();
    return { type, name, token, me, digits, phone: digits, docs };
  } catch (e) {
    line(S, false, 'making the host crashed', e.message.split('\n')[0]);
    await snap('crash');
    await ctx.close();
    return null;
  }
}

/** The KYC list rows (not the "hosts not live yet" rows) for one business. */
/** Click a KYC status filter and wait for its list. */
const kycFilter = async (page, status) => {
  const res = page.waitForResponse((r) => r.url().includes('/admin/kyc?') && r.url().includes(`status=${status}`), { timeout: 15000 }).catch(() => null);
  await page.click(`[data-testid="kyc-filter-${status}"]`);
  await res;
  await page.waitForTimeout(400);
};
const kycRows = (page, business) => page.locator('[data-testid="kyc-review-page"] div.space-y-2 > div:not([data-testid])').filter({ hasText: business });

(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROME_EXE });
  const adminLogin = await j('POST', '/auth/admin/login', { phone: 'admin', password: PASSWORD });
  const admin = adminLogin.d?.token;
  if (!admin) { console.log('Admin API login failed: ' + adminLogin.s); process.exit(1); }

  // ======================= setup: people and content to act on =======================
  console.log('\n=== setup ===');
  const homestay = await onboardHost('homestay', { pdf: true });
  const driver = await onboardHost('driver');
  const cafe = await onboardHost('cafe', { homeDelivery: true });
  const t1Phone = '+91' + newPhone('7');
  const t2Phone = '+91' + newPhone('6');
  const t1Name = `Walker ${RUN}`;
  const t1 = await signIn(t1Phone, t1Name, 'tourist');
  const t2 = await signIn(t2Phone, `Reporter ${RUN}`, 'tourist');
  const planTitle = `Tea gardens loop ${RUN}`;
  const planRes = await j('POST', '/plans', { title: planTitle, stops: [{ place: 'Darjeeling' }, { place: 'Mirik' }], nights: 2, seats: 3, start_date: iso(30), visibility: 'public', notes: 'Shared jeep, early start for the sunrise.' }, t1);
  const plan = planRes.d?.plan;
  line('setup', planRes.s === 201 && !!plan, 'traveller posts a trip plan', `${planRes.s} ${plan?.id || JSON.stringify(planRes.d).slice(0, 120)}`);

  // ======================= 1. sign in =======================
  console.log('\n=== 1. login ===');
  const actx = await adminContext(1280);
  const ap = await actx.newPage();
  const aerr = watch(ap);
  await ap.goto(ADMIN + '/', { waitUntil: 'networkidle' });
  await ap.waitForTimeout(800);
  line('1 login', /\/login$/.test(new URL(ap.url()).pathname), 'signed-out visit to / goes to /login', ap.url().replace(ADMIN, ''));
  await ap.locator('[data-testid="admin-login-form"] input[type="text"]').fill('admin');
  await ap.fill('[data-testid="admin-login-password"]', 'not-the-password-' + RUN);
  await ap.click('[data-testid="admin-login-btn"]');
  const errBox = ap.locator('[data-testid="admin-login-error"]');
  await errBox.waitFor({ timeout: 10000 }).catch(() => {});
  const errMsg = (await errBox.innerText().catch(() => '')).trim();
  await shot(ap, '1-login-wrong-password');
  line('1 login', !!errMsg && /\/login$/.test(new URL(ap.url()).pathname) && !(await ap.evaluate(() => localStorage.getItem('admin_token'))), 'wrong password is refused with a message', errMsg || 'no message');
  if (/reach the server/i.test(errMsg)) line('1 login', false, 'wrong password reads as a connection problem', errMsg);
  // The browser logs the expected 401 of the refused sign-in; that is not a fault.
  aerr.console = aerr.console.filter((x) => !/401/.test(x));
  await ap.fill('[data-testid="admin-login-password"]', PASSWORD);
  await ap.click('[data-testid="admin-login-btn"]');
  const inOk = await ap.locator('[data-testid="admin-page"]').waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
  await shot(ap, '1-login-ok');
  if (!line('1 login', inOk, 'right password gets in', ap.url().replace(ADMIN, ''))) {
    console.log('Cannot continue without signing in: ' + (await bodyText(ap)).slice(0, 200));
  }
  await ap.reload({ waitUntil: 'networkidle' });
  line('1 login', await ap.locator('[data-testid="admin-page"]').waitFor({ timeout: 20000 }).then(() => true).catch(() => false), 'refresh keeps you signed in');
  // Log out exists on other screens too?
  await ap.goto(ADMIN + '/kyc', { waitUntil: 'networkidle' });
  const logoutElsewhere = await ap.getByRole('button', { name: /log ?out|sign ?out/i }).count();
  if (!logoutElsewhere) note('1 login', 'Log Out is only on the Dashboard screen; KYC, Moderation, Feedback, Deliveries and Notifications have no way to sign out (frontend-admin/src/App.tsx nav has no log-out, the button lives in pages/Admin.tsx).');
  await ap.goto(ADMIN + '/', { waitUntil: 'networkidle' });
  await ap.locator('[data-testid="admin-page"]').waitFor({ timeout: 20000 }).catch(() => {});
  await ap.getByRole('button', { name: /log out/i }).click();
  await ap.waitForTimeout(800);
  const outOk = /\/login$/.test(new URL(ap.url()).pathname) && !(await ap.evaluate(() => localStorage.getItem('admin_token')));
  await ap.goto(ADMIN + '/moderation', { waitUntil: 'networkidle' });
  await ap.waitForTimeout(600);
  line('1 login', outOk && /\/login$/.test(new URL(ap.url()).pathname), 'log out signs out, and a protected screen then sends you to /login', ap.url().replace(ADMIN, ''));
  // Back in for the rest of the walk, through the form again.
  await ap.locator('[data-testid="admin-login-form"] input[type="text"]').fill('admin');
  await ap.fill('[data-testid="admin-login-password"]', PASSWORD);
  await ap.click('[data-testid="admin-login-btn"]');
  await ap.locator('[data-testid="admin-page"]').waitFor({ timeout: 20000 }).catch(() => {});
  // Signed in as admin, the website's API gives /auth/me as admin
  errsLine('1 login', 'login screens', aerr);
  if (rewrites) note('env', `the admin bundle called ${ADMIN_API_FROM} (frontend-admin/src/lib/api.ts:4 falls back to it when VITE_API_URL is unset), not its own /api proxy; the walk redirected ${rewrites} calls to ${API}.`);

  // ======================= 2. Dashboard =======================
  console.log('\n=== 2. dashboard ===');
  const statsResP = ap.waitForResponse((r) => r.url().includes('/admin/stats') && r.request().method() === 'GET', { timeout: 20000 }).catch(() => null);
  await ap.reload({ waitUntil: 'networkidle' });
  const statsRes = await statsResP;
  const uiStats = statsRes ? await statsRes.json().catch(() => null) : null;
  await ap.locator('[data-testid="admin-page"]').waitFor({ timeout: 20000 }).catch(() => {});
  await settle(ap);
  await shot(ap, '2-dashboard-overview', true);
  const card = async (label) => {
    const c = ap.locator('.mist-panel').filter({ has: ap.locator(`text="${label}"`) }).first();
    const t = (await c.innerText().catch(() => '')).replace(label, '').trim();
    return t.match(/-?\d+/) ? Number(t.match(/-?\d+/)[0]) : null;
  };
  const apiStats = (await j('GET', '/admin/stats', null, admin)).d || {};
  const cards = {};
  for (const [label, key] of [['Total Users', 'users'], ['Service Providers', 'providers'], ['Active Services', 'active_services'], ['Bookings Made', 'bookings'], ['Paid Transactions', 'payments']]) {
    cards[key] = await card(label);
    line('2 overview', cards[key] !== null && cards[key] === apiStats[key], `card "${label}" matches GET /admin/stats`, `card ${cards[key]}, API ${apiStats[key]}`);
  }
  line('2 overview', !!uiStats, 'the page loaded /admin/stats', uiStats ? '' : 'no /admin/stats response seen');
  // Spot-checks against the underlying lists.
  const aUsers = (await j('GET', '/admin/users', null, admin)).d?.items || [];
  const aPays = (await j('GET', '/admin/payments', null, admin)).d?.items || [];
  const aListings = (await j('GET', '/admin/listings', null, admin)).d?.items || [];
  const aBookings = (await j('GET', '/admin/bookings', null, admin)).d?.items || [];
  line('2 overview', aUsers.length === apiStats.users || aUsers.length >= 200, 'Total Users agrees with the users list', `stats ${apiStats.users}, /admin/users ${aUsers.length}`);
  line('2 overview', aPays.filter((p) => p.status === 'paid').length === apiStats.payments, 'Paid Transactions agrees with the payments list', `stats ${apiStats.payments}, paid in /admin/payments ${aPays.filter((p) => p.status === 'paid').length} of ${aPays.length}`);
  line('2 overview', aBookings.length === apiStats.bookings, 'Bookings Made agrees with the bookings list', `stats ${apiStats.bookings}, /admin/bookings ${aBookings.length}`);
  const byType = aListings.reduce((m, l) => { m[l.type] = (m[l.type] || 0) + 1; return m; }, {});
  const services = aListings.filter((l) => !['spot', 'event', 'biodiversity'].includes(l.type));
  const pubServices = [];
  for (const t of ['homestay', 'driver', 'guide', 'cafe', 'shop']) pubServices.push(...((await j('GET', `/listings?type=${t}&limit=200`)).d?.items || []));
  line('2 overview', apiStats.active_services === pubServices.length, '"Active Services" is the business listings travellers can see', `card ${apiStats.active_services}, publicly listed ${pubServices.length}`);
  if (apiStats.active_services !== pubServices.length) {
    line('2 overview', false, '"Active Services" counts every listing row (spots, events, drafts, hosts not live yet), not active services', `card ${apiStats.active_services}; listings by type ${JSON.stringify(byType)}; non-spot listings ${services.length}; publicly listed services ${pubServices.length} (backend/src/routes/admin.ts:120 counts schema.listings with no filter)`);
  }
  const fbOpen = ((await j('GET', '/feedback/aangan/all', null, admin)).d?.items || []).filter((f) => f.status === 'open').length + ((await j('GET', '/admin/host-feedback', null, admin)).d?.items || []).filter((f) => f.status === 'open').length;
  const insight = async (tid) => Number(((await ap.locator(`[data-testid="${tid}"]`).innerText().catch(() => '')).match(/(\d+)\s*→/) || [])[1]);
  line('2 overview', (await insight('stat-open-feedback')) === fbOpen, 'Open feedback figure matches the feedback lists', `card ${await insight('stat-open-feedback')}, lists ${fbOpen}`);
  const rateRow = await ap.locator('div.flex').filter({ has: ap.locator('text="Paid Bookings Rate"') }).last().innerText().catch(() => '');
  const rate = Number((rateRow.match(/(\d+)%/) || [])[1]);
  const flows = aPays.filter((p) => p.status === 'paid').reduce((m, p) => { m[p.flow] = (m[p.flow] || 0) + 1; return m; }, {});
  line('2 overview', rate <= 100, '"Paid Bookings Rate" is a sensible share of bookings', `shows ${rate}%: paid payments ${apiStats.payments} / bookings ${apiStats.bookings}, but paid payments by kind are ${JSON.stringify(flows)} (frontend-admin/src/components/admin/OverviewTab.tsx:22 divides every paid payment, host plans and passes included, by bookings)`);
  // Every tab of the dashboard opens without errors.
  for (const tab of ['Users & Businesses', 'Services (Listings)', 'Tourist Spots', 'Place suggestions', 'Bookings', 'Payments', 'Clean-up', 'Overview']) {
    await ap.locator('[data-testid="admin-page"]').getByRole('button', { name: tab, exact: true }).click();
    await settle(ap, 800);
    const txt = await bodyText(ap);
    const bad = /Failed to load|Could not load|Something went wrong|Access Denied/i.exec(txt);
    await shot(ap, `2-tab-${tab.replace(/\W+/g, '-')}`, true);
    line('2 overview', !bad, `tab "${tab}" opens`, bad ? bad[0] : '');
    if (tab === 'Users & Businesses') {
      const rows = await ap.locator('tbody tr').count();
      if (rows >= 150) note('2 overview', `Users & Businesses renders ${rows} rows at once with no paging (GET /admin/users returns every user); it will get slow as the user count grows.`);
    }
  }
  errsLine('2 overview', 'Dashboard and its tabs', aerr);

  // ======================= 3. KYC =======================
  console.log('\n=== 3. KYC ===');
  await ap.goto(ADMIN + '/kyc', { waitUntil: 'networkidle' });
  await ap.locator('[data-testid="kyc-review-page"]').waitFor({ timeout: 20000 }).catch(() => {});
  await settle(ap, 1000);
  await shot(ap, '3-kyc-pending', true);
  const hosts = [homestay, driver, cafe].filter(Boolean);
  for (const h of hosts) {
    const w = ap.locator(`[data-testid="waiting-step-${h.me.id}"]`);
    const step = (await w.innerText().catch(() => '')).trim();
    line('3 kyc', /review documents/i.test(step), `${h.type} shows in "Hosts not live yet" as the team's turn`, step || 'not listed');
    // The list pages 20 at a time, newest first: count this host's rows on every page.
    let n = await kycRows(ap, h.name).count();
    let pages = 1;
    while (await ap.locator('[data-testid="kyc-page-next"]').isEnabled().catch(() => false)) {
      await ap.click('[data-testid="kyc-page-next"]'); await settle(ap, 500); pages++;
      n += await kycRows(ap, h.name).count();
    }
    while (await ap.locator('[data-testid="kyc-page-prev"]').isEnabled().catch(() => false)) { await ap.click('[data-testid="kyc-page-prev"]'); await settle(ap, 400); }
    line('3 kyc', n === h.docs.length && n > 0, `${h.type}'s documents are in the Pending list`, `${n} rows for ${h.docs.length} uploaded, over ${pages} page(s)`);
  }
  // Open every document of the homestay (image, PDF, video) and one of the others.
  const viewDocs = async (h) => {
    const rows = kycRows(ap, h.name);
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const label = (await row.innerText()).split('\n').slice(0, 3).join(' ').slice(0, 80);
      const resP = ap.waitForResponse((r) => /\/providers\/kyc\/[^/]+\/file/.test(r.url()), { timeout: 20000 }).catch(() => null);
      const popP = ap.context().waitForEvent('page', { timeout: 20000 }).catch(() => null);
      await row.getByRole('button', { name: /view document/i }).click();
      const res = await resP;
      const pop = await popP;
      const ct = res ? res.headers()['content-type'] || '' : '';
      let rendered = '';
      if (pop) {
        await pop.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
        await pop.waitForTimeout(800);
        if (/image/.test(ct)) rendered = (await pop.evaluate(() => { const i = document.querySelector('img'); return i && i.naturalWidth > 0 ? 'image shown' : 'image NOT shown'; }).catch(() => 'n/a'));
        else if (/video/.test(ct)) rendered = (await pop.evaluate(() => document.querySelector('video') ? 'video player' : 'no video element').catch(() => 'n/a'));
        else rendered = 'opened ' + pop.url().slice(0, 20);
        await shot(pop, `3-kyc-doc-${h.type}-${i}`);
        await pop.close().catch(() => {});
      }
      const err = (await ap.locator('text=/Could not open the document/').count()) > 0;
      line('3 kyc', res?.status() === 200 && !!pop && !err && !/NOT|no video/.test(rendered), `View document opens (${h.type}: ${label.replace(/\s+/g, ' ')})`, `${res?.status() ?? 'no response'} ${ct}, ${pop ? rendered : 'no new tab'}`);
    }
  };
  if (homestay) {
    // Its documents spread over several pages of the queue: open them on every page.
    for (let pg = 0; pg < 10; pg++) {
      await viewDocs(homestay);
      if (!(await ap.locator('[data-testid="kyc-page-next"]').isEnabled().catch(() => false))) break;
      await ap.click('[data-testid="kyc-page-next"]'); await settle(ap, 500);
    }
    while (await ap.locator('[data-testid="kyc-page-prev"]').isEnabled().catch(() => false)) { await ap.click('[data-testid="kyc-page-prev"]'); await settle(ap, 400); }
  }

  // APPROVE the homestay and the cafe, clicking each pending document.
  const approveAll = async (h) => {
    for (let guard = 0; guard < 10; guard++) {
      const btn = kycRows(ap, h.name).getByRole('button', { name: /^Approve$/ }).first();
      // This host's documents can sit on a later page of the queue.
      while (!(await btn.count()) && await ap.locator('[data-testid="kyc-page-next"]').isEnabled().catch(() => false)) { await ap.click('[data-testid="kyc-page-next"]'); await settle(ap, 500); }
      if (!(await btn.count())) break;
      const done = ap.waitForResponse((r) => /\/admin\/kyc\/[^/]+\/review/.test(r.url()), { timeout: 15000 }).catch(() => null);
      await btn.click();
      const r = await done;
      if (!r || r.status() !== 200) { line('3 kyc', false, `approving a ${h.type} document`, `${r?.status()} ${await r?.text().catch(() => '')}`); break; }
      await ap.waitForResponse((x) => /\/admin\/kyc\?/.test(x.url()), { timeout: 10000 }).catch(() => {});
      await ap.waitForTimeout(500);
    }
    while (await ap.locator('[data-testid="kyc-page-prev"]').isEnabled().catch(() => false)) { await ap.click('[data-testid="kyc-page-prev"]'); await settle(ap, 400); }
    const left = ((await j('GET', '/admin/kyc?status=pending&limit=200', null, admin)).d?.documents || []).filter((d) => d.provider_id === h.me.id).length;
    const me = (await j('GET', '/providers/me', null, h.token)).d?.provider;
    line('3 kyc', left === 0 && me?.kyc_status === 'verified', `approving every ${h.type} document from the list makes the host verified`, `${left} rows left, kyc ${me?.kyc_status}, approval_pending ${me?.approval_pending}`);
    return me;
  };
  const afterApprove = {};
  for (const h of [homestay, cafe].filter(Boolean)) afterApprove[h.type] = await approveAll(h);
  if (homestay) {
    const stale = await ap.locator(`[data-testid="waiting-step-${homestay.me.id}"]`).innerText().catch(() => '');
    await ap.locator('[data-testid="kyc-review-page"] > div').first().getByRole('button', { name: /refresh/i }).click().catch(() => {});
    await settle(ap, 1000);
    const afterRefresh = await ap.locator(`[data-testid="waiting-step-${homestay.me.id}"]`).innerText().catch(() => '');
    line('3 kyc', !stale, '"Hosts not live yet" drops a host once all their documents are approved', stale ? `the live homestay still shows "${stale.trim()}"; after the page's Refresh button: "${afterRefresh.trim() || 'gone'}"` : '');
  }
  await shot(ap, '3-kyc-after-approve', true);
  const anyFeedback = await ap.locator('text=/approved|Approved\\b.*document|was approved/').count();
  if (!anyFeedback) note('3 kyc', 'Approving a pending document gives no confirmation: the row just disappears from the list (pages/KycReview.tsx:282, no notice is set on success). With several documents per host it is easy to lose track of what was approved.');
  note('3 kyc', 'Each document is its own row with its own Approve, grouped by nothing; there is no way to see a host\'s documents side by side or approve a host in one step, and documents are not previewed in the list (each opens in a new tab).');
  note('3 kyc', 'There is no separate "request changes" action: Reject (with a reason) is what sends the host the "A document needs changing" message.');

  // Approved hosts on the other side.
  for (const h of [homestay, cafe].filter(Boolean)) {
    const S = `3 kyc → ${h.type}`;
    const me = afterApprove[h.type];
    const notes_ = (await j('GET', '/notifications', null, h.token)).d?.items || [];
    const got = notes_.find((n) => /verified and live/i.test(n.title || '') || n.kind === 'kyc_approved');
    line(S, !!got, 'host gets a "verified and live" notification', got ? got.title : notes_.slice(0, 3).map((n) => n.title).join(' / ') || 'none');
    const pubType = h.type;
    const listing = ((await j('GET', `/listings?type=${pubType}&limit=200`)).d?.items || []).find((l) => l.provider_id === me?.id || l.title === h.name);
    line(S, !!listing, 'their listing is in GET /listings', listing ? listing.title : 'missing');
    h.listing = listing;
    const host = await webPage(h.token, 'provider', 390);
    for (let a = 0; a < 2; a++) {
      await host.page.goto(WEB + '/provider/dashboard', { waitUntil: 'networkidle' });
      if (await host.page.locator('[data-testid="provider-status"]').waitFor({ timeout: 20000 }).then(() => true).catch(() => false)) break;
    }
    await settle(host.page);
    const status = (await host.page.locator('[data-testid="provider-status"]').innerText().catch(() => '')).trim();
    const verifiedChip = await host.page.locator('.ag-host-status').getByText(/verified/i).count();
    await shot(host.page, `3-host-${h.type}-dashboard-live`);
    line(S, /live/i.test(status) && verifiedChip > 0, 'host dashboard says live and verified', `status "${status}", verified chip ${verifiedChip}`);
    await host.page.goto(WEB + '/notifications', { waitUntil: 'networkidle' });
    await settle(host.page, 1000);
    const nt = await bodyText(host.page);
    line(S, /verified and live/i.test(nt), 'the notification is on the website /notifications page', /verified and live/i.test(nt) ? '' : nt.slice(0, 120).replace(/\s+/g, ' '));
    await shot(host.page, `3-host-${h.type}-notifications`);
    errsLine(S, 'host website pages', host.errs);
    await host.ctx.close();
    if (listing) {
      const g = await webPage(null, 'tourist', 390);
      const cat = { homestay: '/homestays', cafe: '/cafes', driver: '/drivers' }[h.type];
      await g.page.goto(WEB + cat, { waitUntil: 'networkidle' });
      await g.page.locator(`text=${listing.title}`).first().waitFor({ timeout: 15000 }).catch(() => {});
      let seen = (await g.page.locator(`text=${listing.title}`).count()) > 0;
      for (let k = 0; k < 4 && !seen; k++) {
        await g.page.mouse.wheel(0, 4000); await g.page.waitForTimeout(800);
        const more = g.page.getByRole('button', { name: /show more|load more|see more/i }).first();
        if (await more.count()) { await more.click().catch(() => {}); await g.page.waitForTimeout(1200); }
        seen = (await g.page.locator(`text=${listing.title}`).count()) > 0;
      }
      await shot(g.page, `3-guest-${h.type}-category`, true);
      line(S, seen, `listing shows on the ${cat} category page`, seen ? '' : 'title not on the page');
      await g.ctx.close();
    }
  }

  // REJECT one driver document with a reason; the host sees it and uploads again.
  /** Pages through the current KYC filter until this business's row for docType shows. */
  const findDocRow = async (business, docType) => {
    while (await ap.locator('[data-testid="kyc-page-prev"]').isEnabled().catch(() => false)) { await ap.click('[data-testid="kyc-page-prev"]'); await settle(ap, 400); }
    for (let pg = 0; pg < 15; pg++) {
      const r = kycRows(ap, business).filter({ hasText: new RegExp(`\\b${docType}\\b`) });
      if (await r.count()) return r.first();
      if (!(await ap.locator('[data-testid="kyc-page-next"]').isEnabled().catch(() => false))) break;
      await ap.click('[data-testid="kyc-page-next"]'); await settle(ap, 500);
    }
    return null;
  };
  const rejectInUi = async (S, business, docType, reason) => {
    const row = await findDocRow(business, docType);
    if (!line(S, !!row, `the ${docType} row is in Pending`)) return false;
    await row.getByRole('button', { name: /^Reject$/ }).click();
    const dlg = ap.locator('[data-testid="kyc-review-dialog"]');
    const opened = await dlg.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
    line(S, opened, 'Reject opens a dialog asking for the reason');
    if (!opened) return false;
    line(S, await ap.locator('[data-testid="kyc-review-confirm"]').isDisabled(), 'Reject is disabled until a reason is written');
    await ap.fill('[data-testid="kyc-review-reason"]', reason);
    await shot(ap, `3-kyc-reject-dialog-${docType}`);
    const done = ap.waitForResponse((r) => /\/admin\/kyc\/[^/]+\/review/.test(r.url()), { timeout: 15000 }).catch(() => null);
    await ap.click('[data-testid="kyc-review-confirm"]');
    const r = await done;
    await dlg.waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    line(S, r?.status() === 200 && !(await dlg.count()), 'rejecting closes the dialog', `${r?.status()}`);
    return r?.status() === 200;
  };
  /** The host dashboard, loaded again once if the page came up blank (dev-server reloads). */
  const hostDashboard = async (token) => {
    const host = await webPage(token, 'provider', 390);
    for (let a = 0; a < 2; a++) {
      await host.page.goto(WEB + '/provider/dashboard', { waitUntil: 'networkidle' });
      if (await host.page.locator('[data-testid="provider-status"]').waitFor({ timeout: 20000 }).then(() => true).catch(() => false)) break;
    }
    await settle(host.page, 800);
    return host;
  };
  if (driver) {
    const S = '3 kyc → driver (reject)';
    const reason = `The licence photo is blurred, please upload a sharper copy ${RUN}`;
    const rejected = await rejectInUi(S, driver.name, 'driving_license', reason);
    if (rejected) {
      await kycFilter(ap, 'rejected');
      const rr = kycRows(ap, driver.name).filter({ hasText: reason }).first();
      const seenRej = await rr.waitFor({ timeout: 8000 }).then(() => true).catch(() => false);
      const shown = seenRej ? '' : (await ap.locator('[data-testid="kyc-review-page"] div.space-y-2 > div:not([data-testid])').allInnerTexts()).map((t) => t.split('\n').slice(0, 4).join(' ')).join(' || ').slice(0, 300);
      line(S, seenRej, 'the Rejected filter shows the document with its reason', shown && `rows shown: ${shown}; filter ${await ap.locator('[aria-selected="true"][data-testid^="kyc-filter-"]').getAttribute('data-testid').catch(() => '?')}`);
      await shot(ap, '3-kyc-rejected-filter', true);
    }
    const dNotes = (await j('GET', '/notifications', null, driver.token)).d?.items || [];
    const dn = dNotes.find((n) => n.kind === 'kyc_changes' || /needs changing/i.test(n.title || ''));
    line(S, !!dn && (dn.body || '').includes(reason), 'host gets "A document needs changing" with the reason', dn ? `${dn.title}: ${dn.body}` : 'none');
    const host = await hostDashboard(driver.token);
    const trackerTxt = await host.page.locator('[data-testid="verification-action"]').innerText().catch(() => '');
    await host.page.locator('[data-testid="verification-tracker"]').scrollIntoViewIfNeeded().catch(() => {});
    await shot(host.page, '3-host-driver-dashboard-rejected');
    const ver = (await j('GET', '/providers/me/profile', null, driver.token)).d?.verification;
    const tracker = (await host.page.locator('[data-testid="verification-tracker"]').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 140);
    line(S, trackerTxt.includes(reason), 'host dashboard "Next step" shows what to fix and the reason', `${trackerTxt.slice(0, 160).replace(/\s+/g, ' ') || 'no "action needed" box'}; tracker "${tracker || 'none'}"; API verification ${JSON.stringify({ status: ver?.status, action_message: ver?.action_message })}`);
    await host.page.locator('[data-testid="verification-cta"]').click().catch(() => {});
    await host.page.waitForTimeout(1500);
    const docRow = host.page.locator('li.ag-host-docrow').filter({ hasText: reason });
    const docRowSeen = await docRow.count();
    line(S, docRowSeen === 1, 'the documents list shows the reason next to the document', docRowSeen ? '' : 'no document row with the reason');
    await shot(host.page, '3-host-driver-docs-rejected', true);
    if (docRowSeen) {
      const input = docRow.locator('input[type="file"]');
      const upRes = host.page.waitForResponse((r) => /\/providers\/me\/kyc/.test(r.url()) && r.request().method() === 'POST', { timeout: 20000 }).catch(() => null);
      await input.setInputFiles(IMG[11]);
      const ur = await upRes;
      await host.page.waitForTimeout(1500);
      const kyc = (await j('GET', '/providers/me/kyc', null, driver.token)).d;
      const lic = (kyc?.documents || []).find((d) => d.doc_type === 'driving_license');
      line(S, ur?.status() < 300 && lic?.status === 'pending', 'host uploads it again and it goes back to review', `upload ${ur?.status()}, driving_license ${lic?.status}`);
      await shot(host.page, '3-host-driver-reuploaded', true);
    }
    errsLine(S, 'host website pages', host.errs);
    await host.ctx.close();
    await kycFilter(ap, 'pending');
    line(S, !!(await findDocRow(driver.name, 'driving_license')), 'the re-uploaded document is back in Pending for the team');

    // An OPTIONAL document rejected: the host is told it "needs changing"; does the dashboard agree?
    const S2 = '3 kyc → driver (reject optional)';
    const reason2 = `Insurance has expired, please upload the current one ${RUN}`;
    if (await rejectInUi(S2, driver.name, 'vehicle_insurance', reason2)) {
      const n2 = ((await j('GET', '/notifications', null, driver.token)).d?.items || []).find((n) => (n.body || '').includes(reason2));
      const v2 = (await j('GET', '/providers/me/profile', null, driver.token)).d?.verification;
      const h2 = await hostDashboard(driver.token);
      const act2 = await h2.page.locator('[data-testid="verification-action"]').innerText().catch(() => '');
      await h2.page.locator('[data-testid="verification-tracker"]').scrollIntoViewIfNeeded().catch(() => {});
      await shot(h2.page, '3-host-driver-optional-rejected');
      line(S2, !!n2 && (v2?.action_required === true || act2.includes(reason2)), 'host told an optional document needs changing also sees it as the next step on the dashboard', `notification "${n2?.title || 'none'}"; verification ${JSON.stringify({ status: v2?.status, action_required: v2?.action_required, action_message: v2?.action_message })}; dashboard action box "${act2.replace(/\s+/g, ' ').slice(0, 80) || 'none'}"`);
      errsLine(S2, 'host website pages', h2.errs);
      await h2.ctx.close();
    }
    // Close the loop: approve the driver now (the optional document stays rejected).
    await kycFilter(ap, 'pending').catch(() => {});
    const dme = await approveAll(driver);
    const dl = ((await j('GET', '/listings?type=driver&limit=200')).d?.items || []).find((l) => l.provider_id === dme?.id);
    line(S, !!dl, 'after approval the driver is public too', dl?.title || 'missing');
  }
  errsLine('3 kyc', 'KYC screen', aerr);

  // ======================= 4. Moderation =======================
  console.log('\n=== 4. moderation ===');
  let post = null;
  if (cafe) {
    const pr = await j('POST', '/posts', { body: `Run ${RUN}: fresh momos and hot thukpa all evening at ${cafe.name}. Come by after the toy train ride.` }, cafe.token);
    post = pr.d?.post;
    line('4 moderation', pr.s === 201, 'verified cafe posts to the host feed', `${pr.s} ${post?.id || JSON.stringify(pr.d).slice(0, 120)}`);
  }
  let comment = null;
  if (post) {
    const cr = await j('POST', `/posts/${post.id}/comments`, { body: `Are you open on Sunday morning ${RUN}?` }, t1);
    comment = cr.d?.comment;
    line('4 moderation', cr.s === 201 || cr.s === 200, 'traveller comments on the post', `${cr.s} ${comment?.id || JSON.stringify(cr.d).slice(0, 120)}`);
  }
  const rp1 = plan ? await j('POST', '/reports', { target_type: 'plan', target_id: plan.id, reason: 'spam', details: `Looks like an ad ${RUN}` }, t2) : null;
  const rp2 = post ? await j('POST', '/reports', { target_type: 'post', target_id: post.id, reason: 'offensive', details: `Rude post ${RUN}` }, t2) : null;
  line('4 moderation', rp1?.s === 201 && (!post || rp2?.s === 201), 'another traveller reports the plan and the post', `${rp1?.s} ${rp2?.s}`);
  const g0 = await webPage(t2, 'tourist', 390);
  await g0.page.goto(WEB + '/feed', { waitUntil: 'networkidle' });
  await settle(g0.page, 1500);
  const feedBefore = await bodyText(g0.page);
  line('4 moderation', feedBefore.includes(planTitle), 'the plan is on the website /feed before moderation', feedBefore.includes(planTitle) ? '' : 'not on /feed');
  if (post) line('4 moderation', feedBefore.includes(post.body.slice(0, 30)), 'the post is on /feed before moderation', feedBefore.includes(post.body.slice(0, 30)) ? '' : 'not on /feed');
  await g0.ctx.close();

  await ap.goto(ADMIN + '/moderation', { waitUntil: 'networkidle' });
  await ap.locator('[data-testid="moderation-page"]').waitFor({ timeout: 20000 }).catch(() => {});
  await settle(ap, 800);
  await shot(ap, '4-moderation-reports', true);
  const reportCard = (txt) => ap.locator('[data-testid^="report-"]').filter({ hasText: txt });
  // Plan: hide, check, then unhide from Resolved.
  if (plan) {
    const S = '4 moderation → plan';
    const c = reportCard(planTitle);
    line(S, (await c.count()) >= 1, 'the reported plan is in Reports with its title', `${await c.count()} cards`);
    await c.first().getByRole('button', { name: /hide plan/i }).click().catch((e) => line(S, false, 'Hide plan button', e.message.split('\n')[0]));
    await ap.locator('text=Trip plan hidden from the feed.').waitFor({ timeout: 10000 }).catch(() => {});
    line(S, (await ap.locator('text=Trip plan hidden from the feed.').count()) > 0, 'hiding says so on screen');
    await shot(ap, '4-moderation-plan-hidden', true);
    const inList = ((await j('GET', '/plans?limit=50')).d?.plans || []).some((p) => p.id === plan.id);
    const one = await j('GET', `/plans/${plan.id}`);
    const g = await webPage(t2, 'tourist', 390);
    await g.page.goto(WEB + '/feed', { waitUntil: 'networkidle' });
    await settle(g.page, 1500);
    const ft = await bodyText(g.page);
    line(S, !inList && one.s === 404 && !ft.includes(planTitle), 'hidden plan is gone from GET /plans, GET /plans/:id and /feed', `in list ${inList}, /plans/:id ${one.s}, on /feed ${ft.includes(planTitle)}`);
    await shot(g.page, '4-feed-after-plan-hidden');
    const own = (await j('GET', '/plans/me', null, t1)).d?.mine || [];
    const mine = own.find((p) => p.id === plan.id);
    if (mine && !('hidden' in mine) && !mine.hidden_at && !mine.hidden) note(S, 'The organiser is not told their plan was hidden: GET /plans/me returns it with no hidden flag, so My trips keeps showing it as normal while nobody else can open it (backend/src/routes/plans.ts:817 sets hiddenAt only; no notification).');
    await g.ctx.close();
    await ap.getByRole('button', { name: 'Resolved', exact: true }).click();
    await settle(ap, 800);
    const rc = reportCard(planTitle).first();
    await rc.getByRole('button', { name: /unhide plan/i }).click().catch((e) => line(S, false, 'Unhide plan button under Resolved', e.message.split('\n')[0]));
    await ap.locator('text=Trip plan is back in the feed.').waitFor({ timeout: 10000 }).catch(() => {});
    const back = ((await j('GET', '/plans?limit=50')).d?.plans || []).some((p) => p.id === plan.id);
    line(S, back, 'unhide from Resolved puts the plan back in GET /plans');
  }
  // Post: hide from the report (asks for a reason in a browser prompt), check, unhide from Feed posts.
  if (post) {
    const S = '4 moderation → post';
    await ap.getByRole('button', { name: 'Open', exact: true }).click();
    await settle(ap, 800);
    const c = reportCard(post.body.slice(0, 30));
    line(S, (await c.count()) >= 1, 'the reported post is in Reports with its text', `${await c.count()} cards`);
    const hideReason = `Please keep it polite ${RUN}`;
    let dialogKind = '';
    ap.once('dialog', async (d) => { dialogKind = d.type(); await d.accept(hideReason); });
    await c.first().getByRole('button', { name: /hide post/i }).click().catch((e) => line(S, false, 'Hide post button', e.message.split('\n')[0]));
    await ap.locator('text=Post hidden from the feed.').waitFor({ timeout: 10000 }).catch(() => {});
    if (dialogKind === 'prompt') note(S, 'Hiding a post asks for the reason in the browser\'s native prompt() (pages/Moderation.tsx:159 and :406), and deleting uses confirm(); KYC uses a proper in-app dialog. A native prompt cannot be styled, is blocked in some embedded browsers, and its Cancel silently does nothing.');
    const pub = ((await j('GET', '/posts?limit=50')).d?.posts || []).some((p) => p.id === post.id);
    const mineP = ((await j('GET', '/posts/me', null, cafe.token)).d?.posts || []).find((p) => p.id === post.id);
    line(S, !pub, 'hidden post is gone from GET /posts', `still listed ${pub}`);
    line(S, mineP?.hidden && mineP?.hidden_reason === hideReason, 'the host sees their post as hidden, with the reason', JSON.stringify({ hidden: mineP?.hidden, reason: mineP?.hidden_reason }));
    const g = await webPage(t2, 'tourist', 390);
    await g.page.goto(WEB + '/feed', { waitUntil: 'networkidle' });
    await settle(g.page, 1500);
    line(S, !(await bodyText(g.page)).includes(post.body.slice(0, 30)), 'hidden post is gone from /feed');
    await g.ctx.close();
    await ap.getByRole('tab', { name: /feed posts/i }).click();
    await settle(ap, 800);
    await ap.getByRole('button', { name: 'Hidden', exact: true }).click();
    await settle(ap, 800);
    const hp = ap.locator(`[data-testid="admin-post-${post.id}"]`);
    const hpTxt = await hp.innerText().catch(() => '');
    line(S, hpTxt.includes(hideReason), 'Feed posts > Hidden shows it with the reason');
    await shot(ap, '4-moderation-posts-hidden', true);
    await hp.getByRole('button', { name: /unhide/i }).click().catch(() => {});
    await ap.waitForTimeout(1500);
    const back = ((await j('GET', '/posts?limit=50')).d?.posts || []).some((p) => p.id === post.id);
    line(S, back, 'Unhide puts it back in GET /posts');
    const unhideFeedback = (await ap.locator('text=/back in the feed|unhidden/i').count()) > 0;
    if (!unhideFeedback) note(S, 'Hide/Unhide/Delete on the Feed posts tab give no message after they work (pages/Moderation.tsx:390 run() only reloads); the post just moves between filters.');
  }
  // Comment: delete from the Comments tab.
  if (comment) {
    const S = '4 moderation → comment';
    await ap.getByRole('tab', { name: /comments/i }).click();
    await settle(ap, 800);
    const cc = ap.locator(`[data-testid="admin-comment-${comment.id}"]`);
    line(S, (await cc.count()) === 1, 'the comment is in the Comments tab');
    ap.once('dialog', (d) => d.accept());
    await cc.getByRole('button', { name: /delete/i }).click().catch(() => {});
    await ap.waitForTimeout(1500);
    const still = ((await j('GET', `/posts/${post.id}/comments`)).d?.comments || []).some((x) => x.id === comment.id);
    line(S, !still && (await cc.count()) === 0, 'deleting removes it from the post', `still there ${still}`);
  }
  note('4 moderation', 'The Moderation screen has no list of trip plans or reviews: a plan or review can only be hidden or deleted after somebody reports it. Place suggestions are not here either; they are under Dashboard > Place suggestions.');
  errsLine('4 moderation', 'Moderation screen', aerr);

  // Place suggestions: suggested on the website, approved and published by the team.
  {
    const S = '4 moderation → place suggestion';
    const sugName = `Hidden falls ${RUN}`;
    const sugName2 = `Old quarry view ${RUN}`;
    const tp = await webPage(t1, 'tourist', 390);
    const suggest = async (nm) => {
      await tp.page.goto(WEB + '/spots', { waitUntil: 'networkidle' });
      await settle(tp.page, 800);
      const open = tp.page.locator('[data-testid="home-suggest-open"]');
      await open.scrollIntoViewIfNeeded().catch(() => {});
      await open.click({ timeout: 10000 });
      await tp.page.fill('[data-testid="home-suggest-name"]', nm);
      await tp.page.fill('[data-testid="home-suggest-details"]', 'A short walk below the tea estate road, a small waterfall with a pool. Best after the monsoon, carry shoes with grip.');
      const r = tp.page.waitForResponse((x) => x.url().includes('/spots/suggestions') && x.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
      await tp.page.click('[data-testid="home-suggest-send"]');
      const res = await r;
      return res && res.status() === 201 ? (await res.json()).suggestion : null;
    };
    let s1 = null, s2 = null;
    try { s1 = await suggest(sugName); s2 = await suggest(sugName2); } catch (e) { line(S, false, 'suggest a place on the website', e.message.split('\n')[0]); }
    await shot(tp.page, '4-web-suggest-sent');
    line(S, !!s1 && !!s2, 'traveller suggests two places on the website /spots page', `${s1?.id || 'none'} ${s2?.id || 'none'}`);
    await ap.goto(ADMIN + '/', { waitUntil: 'networkidle' });
    await ap.locator('[data-testid="admin-page"]').waitFor({ timeout: 20000 }).catch(() => {});
    await ap.getByRole('button', { name: 'Place suggestions', exact: true }).click();
    await settle(ap, 800);
    await shot(ap, '4-admin-suggestions', true);
    if (s1) {
      line(S, (await ap.locator(`[data-testid="sugg-${s1.id}"]`).count()) === 1, 'the suggestion is in Place suggestions (pending)');
      await ap.click(`[data-testid="sugg-approve-${s1.id}"]`);
      await ap.locator('text=/added to Tourist Spots as a draft/').waitFor({ timeout: 10000 }).catch(() => {});
      line(S, (await ap.locator('text=/added to Tourist Spots as a draft/').count()) > 0, 'approving says it was added as a draft spot');
      const sg = ((await j('GET', '/admin/spots/suggestions?status=approved', null, admin)).d?.items || []).find((x) => x.id === s1.id);
      const spotId = sg?.listing_id;
      let pubBefore = ((await j('GET', '/listings?type=spot&limit=500')).d?.items || []).some((l) => l.id === spotId);
      line(S, !!spotId && !pubBefore, 'approved suggestion becomes a draft spot (not public yet)', `spot ${spotId}, public ${pubBefore}`);
      await ap.getByRole('button', { name: 'Tourist Spots', exact: true }).click();
      await settle(ap, 800);
      await ap.fill('[data-testid="spots-search"]', sugName).catch(() => {});
      await ap.waitForTimeout(600);
      const pubBtn = ap.locator(`[data-testid="spot-publish-${spotId}"]`);
      line(S, (await pubBtn.count()) === 1, 'the draft is in Tourist Spots with a Publish button');
      await shot(ap, '4-admin-spot-draft', true);
      await pubBtn.click().catch(() => {});
      await ap.waitForTimeout(1500);
      const pubAfter = ((await j('GET', '/listings?type=spot&limit=500')).d?.items || []).some((l) => l.id === spotId);
      const one = await j('GET', `/listings/${spotId}`);
      line(S, pubAfter || one.s === 200, 'after Publish the spot is public', `in /listings?type=spot ${pubAfter}, /listings/:id ${one.s}`);
      await tp.page.goto(WEB + `/listing/${spotId}`, { waitUntil: 'networkidle' });
      await settle(tp.page, 1000);
      line(S, (await bodyText(tp.page)).includes(sugName), 'the spot page opens on the website');
      await shot(tp.page, '4-web-approved-spot');
      const tn = (await j('GET', '/notifications', null, t1)).d?.items || [];
      line(S, tn.some((n) => (n.title + ' ' + n.body).includes(sugName)), 'the traveller is told it was approved', tn.slice(0, 3).map((n) => n.title).join(' / '));
      const liveNote = tn.find((n) => n.kind === 'place_suggestion_live');
      line(S, !!liveNote, 'publishing it tells the traveller it is live (kind place_suggestion_live)', liveNote ? `${liveNote.title}: ${liveNote.body}` : tn.slice(0, 4).map((n) => `${n.kind}: ${n.title}`).join(' / '));
      const mineS = ((await j('GET', '/spots/suggestions/mine', null, t1)).d?.suggestions || []).find((x) => x.id === s1.id);
      line(S, mineS?.live === true, 'GET /spots/suggestions/mine marks it live', JSON.stringify({ status: mineS?.status, live: mineS?.live }));
    }
    if (s2) {
      const rejNote = `It is on private land ${RUN}`;
      await ap.getByRole('button', { name: 'Place suggestions', exact: true }).click();
      await settle(ap, 800);
      await ap.fill(`[data-testid="sugg-note-${s2.id}"]`, rejNote);
      ap.once('dialog', (d) => d.accept());
      await ap.click(`[data-testid="sugg-reject-${s2.id}"]`);
      await ap.waitForTimeout(1500);
      await tp.page.goto(WEB + '/spots', { waitUntil: 'networkidle' });
      await settle(tp.page, 1000);
      const noteEl = tp.page.locator(`[data-testid="my-sugg-note-${s2.id}"]`);
      const seenNote = (await noteEl.innerText().catch(() => '')).includes(rejNote);
      line(S, seenNote, 'rejected with a note: the traveller sees the note on the website', seenNote ? '' : 'note not shown under My suggestions');
      await shot(tp.page, '4-web-rejected-suggestion', true);
    }
    errsLine(S, 'website pages', tp.errs);
    await tp.ctx.close();
  }
  errsLine('4 moderation', 'Dashboard suggestions and spots', aerr);

  // ======================= 5. Feedback =======================
  console.log('\n=== 5. feedback ===');
  {
    const S = '5 feedback';
    const msg = `The map on the homestay page took long to load ${RUN}`;
    const tp = await webPage(t1, 'tourist', 390);
    await tp.page.goto(WEB + '/dashboard?s=tdash', { waitUntil: 'networkidle' });
    const panel = tp.page.locator('[data-testid="panel-feedback"]');
    await panel.waitFor({ timeout: 20000 }).catch(() => {});
    await panel.scrollIntoViewIfNeeded().catch(() => {});
    await panel.getByRole('radio').nth(3).click().catch((e) => line(S, false, 'rating stars', e.message.split('\n')[0]));
    await tp.page.fill('[data-testid="feedback-message"]', msg);
    const r = tp.page.waitForResponse((x) => x.url().includes('/feedback/aangan') && x.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
    await tp.page.click('[data-testid="feedback-send"]');
    const res = await r;
    await tp.page.waitForTimeout(800);
    await shot(tp.page, '5-web-feedback-sent');
    const fb = res ? (await res.json().catch(() => null))?.feedback : null;
    line(S, res?.status() === 201 && fb?.rating === 4, 'traveller sends 4-star feedback from the dashboard panel', `${res?.status()} rating ${fb?.rating}`);
    await ap.goto(ADMIN + '/feedback', { waitUntil: 'networkidle' });
    await ap.locator('[data-testid="feedback-page"]').waitFor({ timeout: 20000 }).catch(() => {});
    await settle(ap, 800);
    const item = fb ? ap.locator(`[data-testid="feedback-${fb.id}"]`) : ap.locator('[data-testid^="feedback-"]').filter({ hasText: msg });
    const txt = await item.innerText().catch(() => '');
    const stars = await item.locator('svg.fill-gold').count();
    await shot(ap, '5-admin-feedback', true);
    line(S, txt.includes(msg) && txt.includes(t1Name) && stars === 4, 'it shows in Feedback > From travellers with the text, the sender and 4 stars', `text ${txt.includes(msg)}, name ${txt.includes(t1Name)}, stars ${stars}`);
    if (fb) {
      await ap.click(`[data-testid="feedback-resolve-${fb.id}"]`);
      await ap.waitForTimeout(1000);
      const gone = (await item.count()) === 0;
      const mine = ((await j('GET', '/feedback/aangan', null, t1)).d?.items || []).find((x) => x.id === fb.id);
      line(S, gone && mine?.status === 'resolved', 'Mark resolved moves it out of Open and the traveller\'s copy is resolved', `gone ${gone}, status ${mine?.status}`);
    }
    await ap.click('[data-testid="feedback-tab-hosts"]');
    await settle(ap, 800);
    line(S, !(await ap.locator('text=/Could not load/').count()), 'From hosts tab loads');
    await shot(ap, '5-admin-feedback-hosts', true);
    errsLine(S, 'website dashboard', tp.errs);
    await tp.ctx.close();
  }
  errsLine('5 feedback', 'Feedback screen', aerr);

  // ======================= 6. Deliveries =======================
  console.log('\n=== 6. deliveries ===');
  {
    const S = '6 deliveries';
    const listing = cafe?.listing;
    const del = listing ? ((await j('GET', `/listings/${listing.id}`)).d) : null;
    const delOn = (del?.item || del?.listing || del)?.extras?.home_delivery === true;
    line(S, delOn, 'the cafe switched on home delivery in its profile and the listing has it', `listing ${listing?.id}, home_delivery ${(del?.item || del?.listing || del)?.extras?.home_delivery}`);
    let reqId = null;
    if (listing) {
      const tp = await webPage(t1, 'tourist', 390);
      await tp.page.goto(WEB + `/listing/${listing.id}`, { waitUntil: 'networkidle' });
      await settle(tp.page, 1000);
      const openBtn = tp.page.locator('[data-testid="delivery-request-open"]');
      if (await openBtn.count()) {
        await openBtn.first().scrollIntoViewIfNeeded().catch(() => {});
        await openBtn.first().click();
        await tp.page.waitForTimeout(600);
        const plus = tp.page.locator('[data-testid^="delivery-plus-"]').first();
        if (await plus.count()) await plus.click();
        await tp.page.locator('[data-testid="delivery-address"] textarea, textarea[data-testid="delivery-address"]').first().fill(`Room 4, Hotel Seven Seventeen, HD Lama Road ${RUN}`).catch(async () => { await tp.page.fill('[data-testid="delivery-address"]', `Room 4, Hotel Seven Seventeen, HD Lama Road ${RUN}`); });
        const r = tp.page.waitForResponse((x) => /\/api\/deliveries$/.test(x.url()) && x.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
        await tp.page.click('[data-testid="delivery-request-send"]');
        const res = await r;
        reqId = res && res.status() === 201 ? (await res.json()).request?.id : null;
        await tp.page.waitForTimeout(800);
        await shot(tp.page, '6-web-delivery-sent');
        line(S, !!reqId && (await tp.page.locator('[data-testid="delivery-request-sent"]').count()) > 0, 'traveller asks the cafe for a home delivery on the website', `${res?.status()} ${reqId || (res ? await res.text().catch(() => '') : 'no request')}`);
      } else {
        await shot(tp.page, '6-web-no-delivery-button', true);
        line(S, false, 'the cafe listing page has the home delivery button', 'no delivery-request-open on /listing/' + listing.id);
      }
      errsLine(S, 'website listing page', tp.errs);
      await tp.ctx.close();
    }
    await ap.goto(ADMIN + '/deliveries', { waitUntil: 'networkidle' });
    await ap.locator('[data-testid="deliveries-page"]').waitFor({ timeout: 20000 }).catch(() => {});
    await settle(ap, 800);
    await shot(ap, '6-admin-deliveries', true);
    if (reqId) {
      const d = ap.locator(`[data-testid="delivery-${reqId}"]`);
      const t = await d.innerText().catch(() => '');
      line(S, t.includes('Veg momos') && t.includes(RUN) && t.includes(cafe.name), 'the request is in Deliveries (Waiting) with the items, address, guest and host', t.slice(0, 160).replace(/\s+/g, ' ') || 'not listed');
      const st = (await j('GET', '/admin/stats', null, admin)).d;
      line(S, st.open_deliveries >= 1, 'Dashboard "Home delivery requests waiting" counts it', `${st.open_deliveries}`);
    } else {
      const t = await bodyText(ap);
      note(S, `No delivery request could be made; the screen loads and shows: ${t.replace(/\s+/g, ' ').slice(0, 160)}`);
    }
    note(S, 'Deliveries is read-only for the team: no way to nudge or close a request that a place never answers.');
  }
  errsLine('6 deliveries', 'Deliveries screen', aerr);

  // ======================= 7. Push notifications =======================
  console.log('\n=== 7. push ===');
  {
    const S = '7 push';
    await ap.goto(ADMIN + '/notifications', { waitUntil: 'networkidle' });
    await ap.locator('[data-testid="push-page"]').waitFor({ timeout: 20000 }).catch(() => {});
    await settle(ap, 800);
    await ap.click('[data-testid="push-audience-person"]');
    // An unknown number first: Send must stay off.
    await ap.fill('[data-testid="push-phone"]', '+91 99999 0' + RUN.slice(-5));
    await ap.fill('[data-testid="push-title"]', `Walk message ${RUN}`);
    await ap.fill('[data-testid="push-body"]', 'A short note from the aangan team to check messages reach you.');
    await ap.waitForTimeout(1500);
    line(S, await ap.locator('[data-testid="push-review"]').isDisabled(), 'Send stays off for a number with no account', (await ap.locator('[data-testid="push-reach"]').innerText().catch(() => '')).trim());
    await ap.fill('[data-testid="push-phone"]', t1Phone);
    await ap.locator('[data-testid="push-reach"]').filter({ hasText: /Reaches 1 person/ }).waitFor({ timeout: 10000 }).catch(() => {});
    const reach = (await ap.locator('[data-testid="push-reach"]').innerText().catch(() => '')).trim();
    line(S, /Reaches 1 person/.test(reach), 'typing the traveller\'s number finds exactly one person', reach);
    await shot(ap, '7-push-compose', true);
    const title = `Walk message ${RUN}`;
    const r = ap.waitForResponse((x) => /\/admin\/broadcasts$/.test(x.url()) && x.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
    await ap.click('[data-testid="push-review"]');
    // A confirm step comes first, even for one person.
    line(S, await ap.locator('[data-testid="push-confirm"]').waitFor({ timeout: 5000 }).then(() => true, () => false), 'Send to one person asks to confirm first');
    await ap.click('[data-testid="push-send"]');
    const res = await r;
    await ap.locator('[data-testid="push-sent"]').waitFor({ timeout: 10000 }).catch(() => {});
    line(S, res?.status() === 201 && (await ap.locator('[data-testid="push-sent"]').count()) > 0, 'Send to one person works and says so', `${res?.status()}`);
    await shot(ap, '7-push-sent', true);
    const tn = (await j('GET', '/notifications', null, t1)).d?.items || [];
    line(S, tn.some((n) => n.title === title), 'it arrives in the traveller\'s GET /notifications', tn.slice(0, 3).map((n) => n.title).join(' / '));
    const tp = await webPage(t1, 'tourist', 390);
    await tp.page.goto(WEB + '/notifications', { waitUntil: 'networkidle' });
    await settle(tp.page, 1000);
    line(S, (await bodyText(tp.page)).includes(title), 'and on the website /notifications page');
    await shot(tp.page, '7-web-notifications');
    const t2n = (await j('GET', '/notifications', null, t2)).d?.items || [];
    line(S, !t2n.some((n) => n.title === title), 'nobody else got it');
    const hist = await ap.locator('[data-testid="push-history"]').innerText().catch(() => '');
    line(S, hist.includes(title), 'it is listed under Sent');
    errsLine(S, 'website notifications', tp.errs);
    await tp.ctx.close();
    note(S, 'Did not send to Everyone / Travellers / Hosts: those reach every account on this database.');
  }
  errsLine('7 push', 'Notifications screen', aerr);
  await actx.close();

  // ======================= 8. Layout at 1280 and 390 =======================
  console.log('\n=== 8. layout ===');
  const screens = [['/', 'admin-page'], ['/kyc', 'kyc-review-page'], ['/moderation', 'moderation-page'], ['/feedback', 'feedback-page'], ['/deliveries', 'deliveries-page'], ['/notifications', 'push-page'], ['/login', 'admin-login-form']];
  for (const width of [1280, 390]) {
    const ctx = await adminContext(width, admin);
    for (const [route, tid] of screens) {
      const S = `8 layout ${width}`;
      const p = await ctx.newPage();
      const e = watch(p);
      if (route === '/login') await p.evaluate(() => {}).catch(() => {});
      const t0 = Date.now();
      await p.goto(ADMIN + route, { waitUntil: 'networkidle' });
      if (route === '/login') { /* signed in: /login still shows the form */ }
      const loaded = await p.locator(`[data-testid="${tid}"]`).waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
      const ms = Date.now() - t0;
      await settle(p, 800);
      const lay = await p.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
        const wide = [];
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > vw + 1 || r.left < -1) {
            let a = el.parentElement, clipped = false;
            while (a && a !== document.body) { const s = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) { clipped = true; break; } a = a.parentElement; }
            if (!clipped) wide.push(`${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? '[' + el.getAttribute('data-testid') + ']' : ''}.${String(el.className).split(' ').slice(0, 2).join('.')} ${Math.round(r.left)}..${Math.round(r.right)}`);
          }
        }
        return { vw, sw, wide: wide.slice(0, 4) };
      });
      await shot(p, `8-${width}-${route === '/' ? 'dashboard' : route.slice(1)}`, true);
      line(S, loaded, `${route} renders`, `${ms} ms`);
      line(S, lay.sw <= lay.vw + 1, `${route} has no sideways scroll`, lay.sw > lay.vw + 1 ? `page ${lay.sw}px wide in a ${lay.vw}px window; ${lay.wide.join(', ')}` : '');
      if (lay.sw <= lay.vw + 1 && lay.wide.length) note(S, `${route}: content cut off at the edge: ${lay.wide.join(', ')}`);
      if (ms > 5000) note(S, `${route} took ${ms} ms to load`);
      errsLine(S, route, e);
      await p.close();
    }
    await ctx.close();
  }

  await browser.close();
  console.log(`\nScreenshots: ${OUT}`);
  if (notes.length) console.log(`\n${notes.length} NOTES (UX / not tested):\n${notes.join('\n')}`);
  console.log(report.length ? `\n${report.length} PROBLEMS:\n${report.join('\n')}` : '\nALL ADMIN FLOWS WORK');
})().catch(async (e) => { console.log('WALK CRASHED: ' + (e.stack || e.message)); try { await browser?.close(); } catch {} process.exit(1); });
