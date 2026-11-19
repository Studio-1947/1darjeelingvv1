// Run against the local stack like the other walks (MESSAGING_PROVIDER=mock, MOCK_PAYMENTS=true, website on
// 127.0.0.1:3100). Usage: PLAYWRIGHT=<path to playwright> node tests/walk/onboard-signedout-walk.cjs [outdir]
// The prototype flow: List your business opens the wizard signed out; "Put it live" asks to log in once,
// comes back to the review step, and the listing goes up with the photo picked before sign-in.
const { chromium } = require(process.env.PLAYWRIGHT);
const fs = require('fs');
const path = require('path');
const WEB = process.env.WEB || 'http://127.0.0.1:3100';
const OUT = path.resolve(process.argv[2] || 'onboard-signedout-out');
fs.mkdirSync(OUT, { recursive: true });
const IMG = path.resolve(__dirname, '../../frontend/public/media/list-business.jpg');
const shot = (p, n) => p.screenshot({ path: path.join(OUT, `${n}.png`) });
const fails = [];
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails.push(m); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_EXE });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 Chrome/140' });
  await ctx.addInitScript(() => sessionStorage.setItem('aangan-splash-seen', '1'));
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  const step = async (k) => p.locator(`[data-testid=wz-step-${k}]`).waitFor({ timeout: 20000 }).then(() => true, () => false);

  await p.goto(WEB + '/provider/onboard', { waitUntil: 'networkidle' });
  ok(await step('type'), 'signed out: wizard opens on the type step (no login first) ' + new URL(p.url()).pathname);
  await shot(p, '1-type');
  await p.click('[data-testid=wz-type-homestay]'); await p.click('[data-testid=wz-next]');
  ok(await step('place'), 'place step');
  await p.click('[data-testid="wz-place-Darjeeling"]'); await p.click('[data-testid=wz-next]');
  ok(await step('name'), 'name step');
  const nm = 'Signedout Stay ' + String(Date.now()).slice(-5);
  const digits = '87' + String(Date.now()).slice(-8);
  await p.fill('[data-testid=wz-name]', nm); await p.fill('[data-testid=onboard-phone]', digits);
  await p.click('[data-testid=wz-next]');
  ok(await step('price'), 'price step');
  await p.click('[data-testid=wz-next]');
  ok(await step('extras'), 'extras step');
  await p.setInputFiles('[data-testid=wz-photos]', IMG);
  await p.waitForTimeout(500);
  const src = await p.evaluate(() => document.querySelector('.ag-onboard-photos [style*="background-image"]')?.getAttribute('style') || '');
  ok(/blob:/.test(src), 'photo picked signed out is shown from the page (blob:)');
  await shot(p, '2-extras');
  await p.click('[data-testid=wz-next]');
  ok(await step('review'), 'review step');
  await shot(p, '3-review');
  await p.click('[data-testid=onboard-submit]');
  const lu = new URL(p.url());
  ok(lu.pathname === '/login' && (lu.searchParams.get('next') || '').startsWith('/provider/onboard') && lu.searchParams.get('role') === 'provider', 'Put it live asks to log in: ' + lu.pathname + lu.search);
  await shot(p, '4-login');
  await p.fill('[data-testid=login-phone]', digits);
  const sent = p.waitForResponse((r) => r.url().includes('/auth/otp/send'));
  await p.click('[data-testid=login-send-otp]');
  const otp = (await (await sent).json()).mock_otp;
  await p.fill('[data-testid=login-otp]', otp);
  if (await p.locator('[data-testid="login-name"]').count()) await p.fill('[data-testid="login-name"] input, input[data-testid="login-name"]', 'Walk Host').catch(() => p.locator('[data-testid="login-name"] input').fill('Walk Host'));
  await p.click('[data-testid=login-verify]');
  // Back from sign-in, the listing goes up by itself (no second "Put my listing up").
  ok(await p.locator('[data-testid=wz-done]').waitFor({ timeout: 30000 }).then(() => true, () => false), 'after sign-in the listing goes up by itself (done screen)');
  await shot(p, '6-done');
  const me = await p.evaluate(async () => { const h = { Authorization: 'Bearer ' + localStorage.getItem('token') }; const u = await (await fetch('/api/auth/me', { headers: h })).json(); const pr = await (await fetch('/api/providers/me', { headers: h })).json(); return { u: u.user || u, pr }; });
  const pv = me.pr.provider || me.pr;
  ok(me.u.role === 'provider', 'account is a host now: role=' + me.u.role);
  ok(pv.business_name === nm, 'business name saved: ' + pv.business_name);
  const imgs = JSON.stringify([pv.images, pv.extras && pv.extras.images]);
  ok(/(\/uploads\/|https?:)/.test(imgs) && !/blob:/.test(imgs), 'photo uploaded at Put it live: ' + imgs.slice(0, 160));
  // Carry straight on, in the same session: Business dashboard, then the profile page must load.
  await p.click('[data-testid=wz-dashboard]');
  await p.locator('a[href="/provider/profile"]').first().waitFor({ timeout: 20000 }).catch(() => {});
  await p.locator('a[href="/provider/profile"]').first().click().catch(() => {});
  ok(await p.locator('[data-testid=profile-save]').first().waitFor({ timeout: 15000 }).then(() => true, () => false), 'profile page loads in the same session as sign-up');
  await shot(p, '7-profile-same-session');
  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  console.log(fails.length ? `${fails.length} PROBLEMS` : 'SIGNED-OUT ONBOARDING WORKS');
  await b.close();
  process.exitCode = fails.length ? 1 : 0;
})();
