// Board: "Book > Waiting for approval > Call/WhatsApp". Clicks through the whole request flow for
// a homestay, a driver and a guide, the way people would:
//   guest (phone width) asks to book  -> sees "Request sent", My Trips says "Waiting for host"
//   host (desktop width) presses Accept on the dashboard
//   guest presses "Confirm booking"   -> no pass, so pays the ₹1 fee -> booking confirmed
// Needs a live (verified) host of each type on the local stack: run host-live-walk.cjs first.
// Same local stack as the other walks (API on :8020, website on 127.0.0.1:3100). Usage:
//   PLAYWRIGHT=<path to playwright> CHROME_EXE=<chrome> ADMIN_PASSWORD=<local admin pw> node tests/walk/approval-walk.cjs [outdir]
// Prints ALL APPROVAL FLOWS WORK, or one line per problem.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const path = require('path');
const fs = require('fs');

const WEB = 'http://127.0.0.1:3100';
const API = 'http://127.0.0.1:8020/api';
const OUT = process.argv[2] || path.join(process.cwd(), 'approval-walk');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = (process.env.TYPES || 'homestay,driver,guide').split(',');

const report = [];
const line = (type, ok, m, x = '') => { const s = `${ok ? 'OK  ' : 'FAIL'} [${type}] ${m}${x ? ' | ' + x : ''}`; console.log(s); if (!ok) report.push(s); };
const j = async (m, p, body, token) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, d: await r.json().catch(() => null) };
};
async function signIn(phone, name, role) {
  const s = (await j('POST', '/auth/otp/send', { phone, channel: 'whatsapp' })).d;
  const v = (await j('POST', '/auth/otp/verify', { phone, otp: s.mock_otp || '123456', name, role })).d;
  if (!v?.token) throw new Error('sign-in failed: ' + JSON.stringify(v));
  return v.token;
}
const iso = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

/** A browser tab already signed in (token + mode in localStorage, as the site keeps them). */
async function signedInPage(browser, token, mode, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 } });
  await ctx.addInitScript(([t, m]) => { localStorage.setItem('token', t); localStorage.setItem('mode', m); }, [token, mode]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) errs.push(`${r.status()} ${r.url().replace(/^.*\/api/, '')}`); });
  return { page, errs, ctx };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE });
  const admin = (await j('POST', '/auth/admin/login', { phone: 'admin', password: process.env.ADMIN_PASSWORD || 'local_admin_pw' })).d.token;
  const users = (await j('GET', '/admin/users', null, admin)).d?.items || (await j('GET', '/admin/users', null, admin)).d || [];

  for (const type of TYPES) {
    console.log(`\n=== ${type} ===`);
    let n = 0;
    try {
      // A live host of this type and their public listing.
      const listings = (await j('GET', `/listings?type=${type}&limit=100`)).d?.items || [];
      const host = users.find((u) => u.providerId && listings.some((l) => l.provider_id === u.providerId));
      const listing = host && listings.find((l) => l.provider_id === host.providerId);
      if (!host || !listing) { line(type, false, 'no live host of this type (run host-live-walk.cjs first)'); continue; }

      // 1. Guest (no pass) asks to book, on a phone.
      const digits = '7' + String(Date.now()).slice(-9);
      const guestToken = await signIn('+91' + digits, `Guest ${type}`, 'tourist');
      const g = await signedInPage(browser, guestToken, 'tourist', 390);
      const snapG = (name) => g.page.screenshot({ path: path.join(OUT, `${type}-${String(++n).padStart(2, '0')}-guest-${name}.png`), fullPage: false });
      await g.page.goto(`${WEB}/listing/${listing.id}`, { waitUntil: 'networkidle' });
      await g.page.waitForTimeout(800);
      const cin = g.page.locator('[data-testid="booking-checkin"]');
      if (await cin.count()) await cin.first().fill(iso(20));
      const cout = g.page.locator('[data-testid="booking-checkout"]');
      if (await cout.count()) await cout.first().fill(iso(22));
      const route = g.page.locator('select[data-testid="booking-route"]');
      if (await route.count()) {
        const opts = await route.locator('option').evaluateAll((o) => o.map((x) => x.value).filter(Boolean));
        if (opts[0]) await route.selectOption(opts[0]);
      }
      const svc = g.page.locator('[data-testid^="booking-service-"]');
      if (await svc.count()) await svc.first().click();
      await g.page.locator('[data-testid="booking-submit"]').first().click();
      await g.page.waitForTimeout(1500);
      const sent = await g.page.locator('[data-testid="booking-request-sent"]').count();
      const msg = sent ? '' : (await g.page.locator('[data-testid="booking-msg"]').allInnerTexts()).join(' ');
      line(type, sent > 0, 'guest sees "Request sent" (nothing charged yet)', msg);
      await snapG('request-sent');
      const feeAsked = await g.page.locator('[data-testid="booking-fee-modal"]').count();
      line(type, feeAsked === 0, 'no fee asked before the host accepts');

      const mine = (await j('GET', '/bookings/me', null, guestToken)).d?.items || [];
      const booking = mine.find((b) => b.listing_id === listing.id);
      line(type, booking?.status === 'pending_payment' && booking?.awaiting_host === true, 'booking is a request waiting for the host', booking ? `${booking.status}, awaiting ${booking.awaiting_host}` : 'none');
      if (!booking) continue;

      if (sent) await g.page.click('[data-testid="request-go-trips"]');
      else await g.page.goto(`${WEB}/my-trips`, { waitUntil: 'networkidle' });
      await g.page.waitForTimeout(1500);
      line(type, (await g.page.locator(`[data-testid="trip-waiting-${booking.id}"]`).count()) > 0, 'My Trips says "Waiting for host"');
      await snapG('my-trips-waiting');

      // 2. Host accepts on the dashboard, at desktop width.
      const hostToken = await signIn(host.phone, host.name || 'Host', 'provider');
      const h = await signedInPage(browser, hostToken, 'provider', 1280);
      await h.page.goto(`${WEB}/provider/dashboard`, { waitUntil: 'networkidle' });
      await h.page.waitForTimeout(1500);
      const tab = h.page.getByRole('button', { name: /bookings/i }).first();
      if (await tab.count()) await tab.click().catch(() => {});
      await h.page.waitForTimeout(800);
      const acceptBtn = h.page.locator(`[data-testid="booking-accept-${booking.id}"]`);
      line(type, (await acceptBtn.count()) > 0, 'host sees the request with an Accept button');
      await h.page.screenshot({ path: path.join(OUT, `${type}-${String(++n).padStart(2, '0')}-host-request.png`) });
      if (await acceptBtn.count()) {
        await acceptBtn.scrollIntoViewIfNeeded();
        await acceptBtn.click();
        await h.page.waitForTimeout(1500);
      }
      const afterAccept = (await j('GET', '/bookings/me', null, guestToken)).d.items.find((b) => b.id === booking.id);
      line(type, afterAccept.status === 'accepted', 'host Accept makes it accepted (not yet confirmed)', afterAccept.status);
      await h.page.screenshot({ path: path.join(OUT, `${type}-${String(++n).padStart(2, '0')}-host-accepted.png`) });
      if (h.errs.length) line(type, false, 'host page errors', h.errs.slice(0, 3).join(' / '));
      await h.ctx.close();

      // 3. Guest confirms; without the pass that is the ₹1 fee.
      await g.page.goto(`${WEB}/my-trips`, { waitUntil: 'networkidle' });
      await g.page.waitForTimeout(1500);
      const confirmBtn = g.page.locator(`[data-testid="trip-confirm-${booking.id}"]`);
      line(type, (await confirmBtn.count()) > 0, 'guest sees "Confirm booking" after the host accepts');
      await snapG('my-trips-accepted');
      if (await confirmBtn.count()) {
        await confirmBtn.click();
        await g.page.waitForTimeout(1200);
        const fee = g.page.locator('[data-testid="booking-fee-modal"]');
        line(type, (await fee.count()) > 0, 'no pass: guest is offered the ₹1 fee or the pass');
        await snapG('fee-choice');
        if (await fee.count()) {
          await g.page.click('[data-testid="fee-pay-once"]');
          await g.page.waitForTimeout(1000);
          if (await g.page.locator('[data-testid="mock-payment-pay"]').count()) await g.page.click('[data-testid="mock-payment-pay"]');
          await g.page.waitForTimeout(2500);
        }
      }
      const done = (await j('GET', '/bookings/me', null, guestToken)).d.items.find((b) => b.id === booking.id);
      line(type, done.status === 'confirmed', 'after the ₹1 fee the booking is confirmed', done.status);
      await g.page.goto(`${WEB}/my-trips`, { waitUntil: 'networkidle' });
      await g.page.waitForTimeout(1200);
      await snapG('confirmed');
      if (g.errs.length) line(type, false, 'guest page errors', g.errs.slice(0, 3).join(' / '));
      await g.ctx.close();
    } catch (e) {
      line(type, false, 'walk crashed', e.message.split('\n')[0]);
    }
  }
  await browser.close();
  console.log(report.length ? `\n${report.length} PROBLEMS:\n${report.join('\n')}` : '\nALL APPROVAL FLOWS WORK');
})();
