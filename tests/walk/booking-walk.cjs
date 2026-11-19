// Booking walk: a guest books a homestay and a driver the way people do, through every booking
// state, and the host answers on the dashboard. Clicks in the UI; the API is only read to check.
//   1. homestay: Book now, pick a room, people, dates; the total shown is what the server stores;
//      Send -> "Request sent", My trip waiting; the host sees the request with the room, and a notice
//   2. host Accept -> guest notice + Confirm -> ₹1 fee (mock payment) -> confirmed both sides, contacts
//   3. driver: Find a ride with a day (drivers free that day), the ride form; host declines with a reason
//   4. driver again: accept + confirm; guest asks to cancel, takes it back, asks again, host keeps it,
//      asks again, host accepts the cancel -> cancelled both sides, notices both sides
//   5. guest cancels a request the host has not answered, with a reason
//   6. completing a trip and reviewing it (only possible when the API allows it without the DB)
//   7. "Report a problem" on a confirmed trip
//   8. the host cancels a confirmed booking with a reason; the guest is told and the ₹1 fee goes back
// Needs live hosts of each type on the local stack (tests/walk/host-live-walk.cjs), the server with
// MESSAGING_PROVIDER=mock MOCK_PAYMENTS=true. Usage:
//   WEB=http://localhost:3000 API=http://localhost:8001/api ADMIN_PASSWORD=<local admin pw> \
//     [PLAYWRIGHT=<path to playwright>] [CHROME_EXE=<chrome>] node tests/walk/booking-walk.cjs [outdir]
// Prints ALL BOOKING FLOWS WORK, or one line per problem.
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || path.join(__dirname, '../../frontend/node_modules/@playwright/test'));

const WEB = process.env.WEB || 'http://127.0.0.1:3100';
const API = process.env.API || 'http://127.0.0.1:8020/api';
const OUT = path.resolve(process.argv[2] || 'booking-walk-out');
fs.mkdirSync(OUT, { recursive: true });

const report = [];
const notes = [];
const line = (step, ok, m, x = '') => {
  const s = `${ok ? 'OK  ' : 'FAIL'} [${step}] ${m}${x ? ' | ' + x : ''}`;
  console.log(s);
  if (!ok) report.push(s);
  return ok;
};
/** Something a person would trip over that is not a broken flow. */
const ux = (step, m) => { const s = `UX   [${step}] ${m}`; console.log(s); notes.push(s); };

const j = async (m, p, body, token) => {
  const r = await fetch(API + p, { method: m, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, d: await r.json().catch(() => null) };
};
async function signIn(phone, name, role) {
  const s = (await j('POST', '/auth/otp/send', { phone, channel: 'whatsapp' })).d;
  const v = (await j('POST', '/auth/otp/verify', { phone, otp: s?.mock_otp || '123456', name, role })).d;
  if (!v?.token) throw new Error('sign-in failed: ' + JSON.stringify(v));
  return v.token;
}
const iso = (days) => { const d = new Date(Date.now() + 5.5 * 3600e3); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const digitsOf = (s) => Number(String(s || '').replace(/[^\d]/g, '')) || 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Ask the API until `fn` gives something truthy (state settles after a click), or give up. */
async function until(fn, ms = 10000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) { v = await fn().catch(() => null); if (v) return v; await sleep(300); }
  return v;
}

// 4xx answers the walk expects (the ₹1 fee is asked for with a 402 on checkout).
const EXPECTED_4XX = [/\/bookings\/[^/]+\/checkout$/, /\/auth\/me$/];

/** A browser tab already signed in (token + mode in localStorage, splash already seen). */
async function signedInPage(browser, token, mode, width, who) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 } });
  await ctx.addInitScript(([t, m]) => {
    localStorage.setItem('token', t); localStorage.setItem('mode', m);
    try { sessionStorage.setItem('aangan-splash-seen', '1'); } catch { /* */ }
  }, [token, mode]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message.split('\n')[0]}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/Failed to load resource/.test(text)) return; // the response itself is checked below
    errs.push(`console: ${text.slice(0, 200)}`);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (!u.includes('/api/')) return;
    const p = u.replace(/^.*\/api/, '').split('?')[0];
    if (r.status() >= 500) errs.push(`${r.status()} ${r.request().method()} ${p}`);
    else if (r.status() >= 400 && !EXPECTED_4XX.some((re) => re.test(p))) errs.push(`${r.status()} ${r.request().method()} ${p}`);
  });
  let n = 0;
  const snap = (name) => page.screenshot({ path: path.join(OUT, `${who}-${String(++n).padStart(2, '0')}-${name}.png`), fullPage: false }).catch(() => {});
  return { page, errs, ctx, snap, who };
}
async function go(t, url) {
  await t.page.goto(WEB + url, { waitUntil: 'domcontentloaded' });
  await t.page.waitForFunction(() => !document.getElementById('app-splash'), null, { timeout: 20000 }).catch(() => {});
}
const seen = async (t, sel, ms = 15000) => t.page.locator(sel).first().waitFor({ state: 'visible', timeout: ms }).then(() => true).catch(() => false);
/** Wider than the phone: something makes the page scroll sideways. */
async function checkOverflow(t, step, where) {
  const o = await t.page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= w + 1) return null;
    const wide = [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > w + 1)
      .map((el) => `${el.tagName.toLowerCase()}${el.getAttribute('data-testid') ? '[' + el.getAttribute('data-testid') + ']' : el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}`);
    return `${document.documentElement.scrollWidth}px > ${w}px (${wide.slice(0, 4).join(', ')})`;
  });
  if (o) ux(step, `${where} scrolls sideways at 390px: ${o}`);
}
function flushErrs(t, step) {
  const e = [...new Set(t.errs.splice(0))];
  if (e.length) line(step, false, `${t.who} page errors`, e.slice(0, 5).join(' / '));
}

/** The guest's booking, the host's view of it, and the notices each side has for it. */
const guestBooking = async (tok, id) => (await j('GET', '/bookings/me', null, tok)).d?.items?.find((b) => b.id === id);
const hostBooking = async (tok, id) => (await j('GET', '/bookings/provider', null, tok)).d?.items?.find((b) => b.id === id);
const noticesFor = async (tok, id) => ((await j('GET', '/notifications?limit=100', null, tok)).d?.items || []).filter((n) => n.ref_id === id);

/**
 * Book now on the listing page, fill step 1 with `fill`, Next, maybe a note, Send.
 * Returns what the screen showed and what the server answered.
 */
async function bookViaUI(g, listing, step, fill, { note = '', url = `/listing/${listing.id}` } = {}) {
  await go(g, url);
  if (!(await seen(g, '[data-testid="mobile-sticky-cta"]', 20000))) { line(step, false, 'listing page shows "Book now"', 'no mobile-sticky-cta'); await g.snap('no-book-now'); return null; }
  await checkOverflow(g, step, 'listing page');
  await g.page.click('[data-testid="mobile-sticky-cta"]');
  if (!(await seen(g, '[data-testid="booking-next"]'))) { line(step, false, 'Book now opens the booking screen'); await g.snap('no-booking-screen'); return null; }
  await g.page.waitForTimeout(300); // its first render fills tomorrow in; let that land before typing over it
  const filled = await fill(g.page);
  const shownTotal = digitsOf(await g.page.locator('[data-testid="booking-breakdown"] .t.price').first().innerText().catch(() => ''));
  await checkOverflow(g, step, 'booking screen step 1');
  await g.snap('booking-step1');
  await g.page.click('[data-testid="booking-next"]');
  if (!(await seen(g, '[data-testid="booking-submit"]'))) {
    const errsShown = (await g.page.locator('.ag-err, [role="alert"]').allInnerTexts()).join(' ');
    line(step, false, 'Next goes to the Send step', errsShown);
    await g.snap('next-refused');
    return null;
  }
  const summary = await g.page.locator('[data-testid="detail-reserve"] .ag-listing-sum').first().innerText().catch(() => '');
  const sendTotal = digitsOf(await g.page.locator('[data-testid="detail-reserve"] .ag-listing-sum .t.price').first().innerText().catch(() => ''));
  const cancelNote = await g.page.locator('[data-testid="booking-cancel-note"]').innerText().catch(() => '');
  if (note) await g.page.fill('[data-testid="booking-notes"]', note);
  await checkOverflow(g, step, 'booking screen send step');
  await g.snap('booking-send');
  const posted = g.page.waitForResponse((r) => r.url().endsWith('/api/bookings') && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null);
  await g.page.click('[data-testid="booking-submit"]');
  const res = await posted;
  const body = res ? await res.json().catch(() => null) : null;
  await g.page.locator('[data-testid="booking-request-sent"], [data-testid="booking-msg"]').first().waitFor({ timeout: 15000 }).catch(() => {});
  const sent = await g.page.locator('[data-testid="booking-request-sent"]').count() > 0;
  const msg = sent ? '' : (await g.page.locator('[data-testid="booking-msg"]').allInnerTexts()).join(' ');
  return { filled, shownTotal, sendTotal, summary, cancelNote, sent, msg, status: res?.status(), booking: body?.booking || null, body };
}

/** On the guest's My trip: open the cancel sheet on a card, pick a reason, a note, press the sheet's go button. */
async function guestCancelSheet(g, id, reason, note) {
  await g.page.click(`[data-testid="cancel-booking-${id}"]`);
  if (!(await seen(g, `[data-testid="cancel-sheet-${id}"]`, 8000))) return 'no sheet';
  await g.page.click(`[data-testid="cancel-reason-${reason}"]`);
  if (note) await g.page.fill(`#cx-note-${id}`, note);
  const info = await g.page.locator(`[data-testid="cancel-sheet-${id}"] .ag-cx-info`).innerText().catch(() => '');
  const goLabel = await g.page.locator(`[data-testid="confirm-cancel-${id}"]`).innerText().catch(() => '');
  await g.snap(`cancel-sheet-${reason}`);
  await g.page.click(`[data-testid="confirm-cancel-${id}"]`);
  await g.page.locator(`[data-testid="cancel-sheet-${id}"]`).waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  return { info, goLabel };
}

/** The host's Bookings screen with this booking's card on it. */
async function hostCard(h, id) {
  await go(h, '/provider/dashboard?s=bookings');
  return seen(h, `[data-testid="booking-${id}"]`, 20000);
}

/** My trip with this booking's card on it. */
async function tripCard(g, id) {
  await go(g, '/my-trips');
  return seen(g, `[data-testid="my-trip-card-${id}"]`, 20000);
}

/** Guest presses Confirm on an accepted trip and pays the ₹1 fee in the mock checkout. */
async function guestConfirm(g, step, gTok, id, hostTok) {
  await tripCard(g, id);
  const btn = g.page.locator(`[data-testid="trip-confirm-${id}"]`);
  if (!line(step, (await btn.count()) > 0, 'guest sees "Confirm booking" after the host accepts')) { await g.snap('no-confirm'); return false; }
  const accNote = await g.page.locator(`[data-testid="trip-accepted-${id}"]`).innerText().catch(() => '');
  await g.snap('trip-accepted');
  await btn.click();
  const fee = await seen(g, '[data-testid="booking-fee-modal"]', 10000);
  line(step, fee, 'without the pass, Confirm offers the ₹1 fee or the pass');
  if (fee) {
    await g.page.waitForTimeout(500); // the sheet slides up
    await g.snap('fee-choice');
    await g.page.click('[data-testid="fee-pay-once"]');
    if (await seen(g, '[data-testid="mock-payment-pay"]', 10000)) await g.page.click('[data-testid="mock-payment-pay"]');
    else line(step, false, 'the mock checkout opens for the ₹1 fee');
  }
  const done = await until(async () => (await guestBooking(gTok, id))?.status === 'confirmed', 15000);
  line(step, !!done, 'after paying the fee the booking is confirmed', (await guestBooking(gTok, id))?.status);
  await g.page.locator('[data-testid="booking-fee-modal"]').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  // One confirmation says it once: each side should get one "Booking confirmed" notice.
  await sleep(800);
  const gC = (await noticesFor(gTok, id)).filter((n) => n.kind === 'booking_confirmed').length;
  line(step, gC === 1, 'guest gets exactly one "Booking confirmed" notice', `${gC} notices`);
  if (hostTok) {
    const hC = (await noticesFor(hostTok, id)).filter((n) => n.kind === 'booking_confirmed').length;
    line(step, hC === 1, 'host gets exactly one "Booking confirmed" notice', `${hC} notices`);
  }
  return { ok: !!done, accNote };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined });
  const admin = (await j('POST', '/auth/admin/login', { phone: 'admin', password: process.env.ADMIN_PASSWORD || 'local_admin_pw' })).d?.token;
  if (!admin) { console.log('FAIL [setup] admin sign-in (set ADMIN_PASSWORD)'); process.exit(1); }
  const ur = (await j('GET', '/admin/users?limit=500', null, admin)).d;
  const users = ur?.items || ur || [];

  // A live homestay with rooms and a live driver with a per-trip route and a day-rate route.
  const pick = async (type, good) => {
    const ls = (await j('GET', `/listings?type=${type}&limit=100`)).d?.items || [];
    const live = ls.filter((l) => users.some((u) => u.providerId && u.providerId === l.provider_id));
    const l = live.find(good) || live[0];
    return l ? { listing: l, host: users.find((u) => u.providerId === l.provider_id) } : null;
  };
  const stay = await pick('homestay', (l) => Array.isArray(l.extras?.rooms) && l.extras.rooms.length > 1);
  const ride = await pick('driver', (l) => {
    const r = l.extras?.routes || [];
    return r.some((x) => x?.unit === 'trip' && x.price) && r.some((x) => x?.unit === 'day');
  });
  if (!stay || !ride) { console.log('FAIL [setup] no live homestay or driver (run host-live-walk.cjs first)'); process.exit(1); }
  /** The ₹1 fee payment for a booking (admin list of payments). */
  const feeFor = async (bookingId) => {
    const items = (await j('GET', '/admin/payments', null, admin)).d?.items || [];
    return items.find((p) => p.flow === 'booking_commission' && p.referenceId === bookingId) || null;
  };
  console.log(`homestay: ${stay.listing.title} (${stay.listing.id}), host ${stay.host.name}`);
  console.log(`driver:   ${ride.listing.title} (${ride.listing.id}), host ${ride.host.name}`);

  const guestPhone = '+917' + String(Date.now()).slice(-9);
  const guestName = `Walker ${guestPhone.slice(-4)}`;
  const gTok = await signIn(guestPhone, guestName, 'tourist');
  const g = await signedInPage(browser, gTok, 'tourist', 390, 'guest');
  const hsTok = await signIn(stay.host.phone, stay.host.name || 'Host', 'provider');
  const hs = await signedInPage(browser, hsTok, 'provider', 1280, 'stayhost');
  const hdTok = await signIn(ride.host.phone, ride.host.name || 'Host', 'provider');
  const hd = await signedInPage(browser, hdTok, 'provider', 1280, 'drivehost');
  let stayBooking = null;

  /* ================= 1. homestay request ================= */
  let S = '1 homestay';
  console.log(`\n=== ${S} ===`);
  try {
    const rooms = stay.listing.extras?.rooms || [];
    const room = rooms.find((r) => r.unit === 'head') || rooms[1] || rooms[0];
    const people = Math.min(3, Number(room?.occ) || 3);
    let r = null;
    let cin = '', cout = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const off = 40 + Math.floor(Math.random() * 300);
      cin = iso(off); cout = iso(off + 2);
      r = await bookViaUI(g, stay.listing, S, async (p) => {
        for (let k = 0; k < 3; k++) {
          await p.fill('[data-testid="booking-checkin"]', cin);
          await p.fill('[data-testid="booking-checkout"]', cout);
          await p.waitForTimeout(200);
          if ((await p.inputValue('[data-testid="booking-checkin"]')) === cin && (await p.inputValue('[data-testid="booking-checkout"]')) === cout) break;
        }
        const sel = p.locator('select[data-testid="booking-room"]');
        const hasRoom = (await sel.count()) > 0;
        if (hasRoom && room) await sel.selectOption(room.name);
        const plus = p.locator('[data-testid="booking-guests"] button').nth(1);
        for (let k = 1; k < people; k++) await plus.click();
        const shownPeople = Number(await p.locator('[data-testid="booking-guests"] .n').innerText());
        const night = await p.locator('.ag-listing-nightline').first().innerText().catch(() => '');
        return { hasRoom, shownPeople, night, roomShown: hasRoom ? await sel.inputValue() : '' };
      }, { note: 'We arrive by the evening train.' });
      if (r && !r.sent && /already booked|dates_taken/i.test(r.msg)) { console.log(`     (dates ${cin} taken, trying others)`); continue; }
      break;
    }
    if (r) {
      line(S, r.filled.hasRoom, 'the booking screen offers the host\'s rooms');
      line(S, r.filled.roomShown === room.name, `room "${room.name}" can be chosen`, r.filled.roomShown);
      line(S, r.filled.shownPeople === people, `people stepper reaches ${people}`, String(r.filled.shownPeople));
      line(S, /2 nights/.test(r.filled.night), 'the night line says 2 nights', r.filled.night);
      const expect = Number(room.price) * (room.unit === 'head' ? people : 1) * 2;
      line(S, r.shownTotal === expect, `step 1 total is room price x ${room.unit === 'head' ? 'people x ' : ''}nights = ₹${expect}`, `shown ₹${r.shownTotal}`);
      line(S, r.sendTotal === r.shownTotal, 'Send step shows the same total', `₹${r.sendTotal}`);
      line(S, r.summary.includes(room.name), 'Send step names the room', r.summary.replace(/\s+/g, ' '));
      line(S, r.sent, 'guest sees "Request sent"', r.msg || `HTTP ${r.status}`);
      if (/any time before your trip/i.test(r.cancelNote)) ux(S, `the Send step promises "${r.cancelNote.replace(/\s+/g, ' ').trim()}", but once confirmed the guest can only ASK to cancel and the host may keep the booking (TripCard/CancelSheet guest_request); the cancel sheet also calls it "the ₹1 fee" where this says ₹1.20`);
      await g.snap('request-sent');
      const b = r.booking;
      if (b) {
        stayBooking = b;
        line(S, b.amount === r.shownTotal, 'the amount the server stores equals the total shown', `server ₹${b.amount}, shown ₹${r.shownTotal}`);
        line(S, b.room_name === room.name && b.guests === people && b.check_in === cin && b.check_out === cout, 'server has the room, people and dates asked for', `${b.room_name}, ${b.guests}, ${b.check_in}..${b.check_out}`);
        line(S, (await g.page.locator('[data-testid="booking-fee-modal"]').count()) === 0, 'no fee asked before the host accepts');
        if (r.sent) await g.page.click('[data-testid="request-go-trips"]');
        const onTrips = await seen(g, `[data-testid="trip-waiting-${b.id}"]`, 15000);
        line(S, onTrips, 'My trip says it is waiting for the host');
        const more = await g.page.locator(`[data-testid="trip-more-${b.id}"]`).innerText().catch(() => '');
        line(S, more.includes(room.name), 'My trip card names the room', more);
        await checkOverflow(g, S, 'My trip');
        await g.snap('my-trip-waiting');
        const gNotes = await noticesFor(gTok, b.id);
        line(S, gNotes.some((n) => n.kind === 'booking_requested'), 'guest has a "Request sent" notice', gNotes.map((n) => n.kind).join(','));

        // Host side.
        const onDash = await hostCard(hs, b.id);
        line(S, onDash, 'host sees the request on the dashboard');
        const roomLine = await hs.page.locator(`[data-testid="booking-room-${b.id}"]`).innerText().catch(() => '');
        line(S, roomLine.includes(room.name), 'host card names the room (booking-room)', roomLine);
        const card = await hs.page.locator(`[data-testid="booking-${b.id}"]`).innerText().catch(() => '');
        line(S, card.includes(guestName), 'host card names the guest', card.split('\n').find((x) => /Guest/.test(x)) || '');
        line(S, card.includes('We arrive by the evening train'), 'host card shows the guest\'s message');
        line(S, digitsOf((card.match(/₹[\d,]+/) || [''])[0]) === b.amount, 'host card shows the same amount', (card.match(/₹[\d,]+/) || ['none'])[0]);
        line(S, (await hs.page.locator(`[data-testid="booking-accept-${b.id}"]`).count()) > 0, 'host card has Accept');
        await hs.snap('stay-request');
        const hb = await hostBooking(hsTok, b.id);
        line(S, hb?.amount === b.amount, 'GET /bookings/provider has the same amount', String(hb?.amount));
        const hNotes = await noticesFor(hsTok, b.id);
        const hn = hNotes.find((n) => n.kind === 'booking_request');
        line(S, !!hn, 'host has a "New booking request" notice (API)', hNotes.map((n) => n.kind).join(',') || 'none');
        if (hn) {
          await go(hs, '/notifications');
          const shown = await seen(hs, `[data-testid="note-${hn.id}"]`, 15000);
          line(S, shown, 'host\'s Notifications page lists it');
          if (shown) {
            const txt = await hs.page.locator(`[data-testid="note-${hn.id}"]`).innerText();
            line(S, txt.includes(stay.listing.title), 'the notice names the place', txt.replace(/\s+/g, ' '));
            await hs.snap('notifications');
            await hs.page.click(`[data-testid="note-${hn.id}"]`);
            await hs.page.waitForURL(/provider\/dashboard/, { timeout: 8000 }).catch(() => {});
            const url = hs.page.url();
            if (!/s=bookings/.test(url)) ux(S, `tapping the host's "New booking request" notice opens ${url.replace(WEB, '')}, the dashboard home, not the Bookings screen where the request is`);
          }
        }
      }
    }
  } catch (e) { line(S, false, 'walk crashed', e.message.split('\n')[0]); await g.snap('crash'); }
  flushErrs(g, S); flushErrs(hs, S);

  /* ================= 2. host accepts, guest confirms ================= */
  S = '2 accept+confirm';
  console.log(`\n=== ${S} ===`);
  try {
    const b = stayBooking;
    if (!b) throw new Error('no homestay request from step 1');
    await hostCard(hs, b.id);
    await hs.page.click(`[data-testid="booking-accept-${b.id}"]`);
    const acc = await until(async () => (await guestBooking(gTok, b.id))?.status === 'accepted', 10000);
    line(S, !!acc, 'host Accept makes it accepted (not yet confirmed)', (await guestBooking(gTok, b.id))?.status);
    await hs.page.locator(`[data-testid="booking-accept-${b.id}"]`).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    const hcard = await hs.page.locator(`[data-testid="booking-${b.id}"]`).innerText().catch(() => '');
    line(S, /Host said yes/i.test(hcard), 'host card now says "Host said yes"', hcard.split('\n').slice(0, 3).join(' / '));
    await hs.snap('stay-accepted');
    const gn = (await noticesFor(gTok, b.id)).find((n) => n.kind === 'booking_accepted' || /accepted/i.test(n.title));
    line(S, !!gn, 'guest gets a "request accepted" notice', (await noticesFor(gTok, b.id)).map((n) => n.kind).join(','));
    if (gn) {
      await go(g, '/notifications');
      const shown = await seen(g, `[data-testid="note-${gn.id}"]`, 15000);
      line(S, shown, 'guest\'s Notifications page lists it');
      await checkOverflow(g, S, 'Notifications');
      await g.snap('notifications-accepted');
      if (shown) {
        await g.page.click(`[data-testid="note-${gn.id}"]`);
        await g.page.waitForURL(/my-trips/, { timeout: 8000 }).catch(() => {});
        line(S, /my-trips/.test(g.page.url()), 'tapping it opens My trip', g.page.url().replace(WEB, ''));
      }
    }
    const c = await guestConfirm(g, S, gTok, b.id, S.startsWith('2') ? hsTok : hdTok);
    if (c && c.ok) {
      await tripCard(g, b.id);
      await seen(g, `[data-testid="trip-contact-${b.id}"]`, 10000);
      const gb = await guestBooking(gTok, b.id);
      line(S, (await g.page.locator(`[data-testid="trip-call-${b.id}"]`).count()) > 0 && (await g.page.locator(`[data-testid="trip-whatsapp-${b.id}"]`).count()) > 0, 'guest sees Call and WhatsApp for the host');
      const amt = digitsOf(await g.page.locator(`[data-testid="trip-amount-${b.id}"]`).innerText().catch(() => ''));
      line(S, amt === b.amount && gb?.amount_due === b.amount, 'guest card shows the amount to pay the host', `card ₹${amt}, api ₹${gb?.amount_due}, booked ₹${b.amount}`);
      const pill = await g.page.locator(`[data-testid="my-trip-card-${b.id}"] .ag-status, [data-testid="my-trip-card-${b.id}"] [class*="status"]`).first().innerText().catch(() => '');
      line(S, /confirm/i.test(pill), 'guest card status says confirmed', pill);
      await g.snap('trip-confirmed');
      await hostCard(hs, b.id);
      const hc = await hs.page.locator(`[data-testid="booking-${b.id}"]`).innerText().catch(() => '');
      line(S, /Confirmed/i.test(hc), 'host card says Confirmed', hc.split('\n').slice(0, 3).join(' / '));
      line(S, (await hs.page.locator(`[data-testid="booking-call-${b.id}"]`).count()) > 0 && (await hs.page.locator(`[data-testid="booking-wa-${b.id}"]`).count()) > 0, 'host sees Call and WhatsApp for the guest');
      const hn = (await noticesFor(hsTok, b.id)).map((n) => n.kind);
      line(S, hn.some((k) => /confirm/.test(k)), 'host gets a notice that the guest confirmed', hn.join(','));
      await hs.snap('stay-confirmed');
      await go(g, '/notifications');
      await seen(g, '[data-testid="notes-list"]', 10000);
      await g.snap('notifications-after-confirm');
    }
  } catch (e) { line(S, false, 'walk crashed', e.message.split('\n')[0]); await g.snap('crash'); }
  flushErrs(g, S); flushErrs(hs, S);

  /* ================= 3. driver: find a ride on a day, request, host declines ================= */
  S = '3 driver decline';
  console.log(`\n=== ${S} ===`);
  const routes = ride.listing.extras.routes;
  const tripRoute = routes.find((x) => x.unit === 'trip' && x.price);
  const dayRoute = routes.find((x) => x.unit === 'day');
  let rideDay = iso(30 + Math.floor(Math.random() * 300));
  try {
    // Find a ride: from, to and the day; the list says it shows drivers free that day.
    await go(g, '/drivers');
    const hasSearch = await seen(g, '[data-testid="ride-search"]', 15000);
    line(S, hasSearch, '/drivers has Find a ride (from, to, day)');
    let fromSearch = false;
    if (hasSearch) {
      await g.page.fill('[data-testid="ride-from"]', 'NJP Station');
      await g.page.fill('[data-testid="ride-to"]', 'Darjeeling');
      await g.page.fill('[data-testid="ride-date"]', rideDay);
      const listed = g.page.waitForResponse((r) => r.url().includes('/api/listings') && r.url().includes('available_on='), { timeout: 15000 }).catch(() => null);
      await g.page.click('[data-testid="ride-go"]');
      const lr = await listed;
      line(S, !!lr && lr.ok(), 'the search asks for drivers free that day (available_on)', lr ? `${lr.status()} ${lr.url().replace(/^.*\/api/, '')}` : 'no request with available_on');
      const freeOn = await seen(g, '[data-testid="ride-free-on"]', 10000);
      line(S, freeOn, 'the list says "Drivers free on <day>"', freeOn ? await g.page.locator('[data-testid="ride-free-on"]').innerText() : '');
      await seen(g, `[data-testid="category-results"] a[href*="${ride.listing.id}"]`, 10000);
      const link = g.page.locator(`a[href*="/listing/${ride.listing.id}"]`).first();
      const inList = (await link.count()) > 0;
      line(S, inList, 'our driver (no booking that day) is in the list');
      await checkOverflow(g, S, '/drivers with Find a ride');
      await g.snap('drivers-free-on');
      if (inList) {
        const href = await link.getAttribute('href');
        if (!/check_in=/.test(href || '')) ux(S, `the driver card links to ${href} without the day searched, so the booking form starts on tomorrow and the guest must pick ${rideDay} again`);
        fromSearch = href;
      }
    }
    let r = await bookViaUI(g, ride.listing, S, async (p) => {
      const startDate = await p.inputValue('[data-testid="booking-date"]');
      const startFrom = await p.inputValue('[data-testid="booking-from"]');
      const route = p.locator('select[data-testid="booking-route"]');
      const hasRoute = (await route.count()) > 0;
      if (hasRoute) await route.selectOption(tripRoute.route);
      await p.fill('[data-testid="booking-from"]', 'NJP Station');
      await p.fill('[data-testid="booking-to"]', 'Darjeeling');
      await p.fill('[data-testid="booking-date"]', rideDay);
      await p.fill('[data-testid="booking-time"]', '07:30');
      await p.locator('[data-testid="booking-guests"] button').nth(1).click();
      const rate = await p.locator('[data-testid="booking-rate"]').innerText().catch(() => '');
      return { hasRoute, startDate, startFrom, rate };
    }, { note: 'Two bags.', url: fromSearch && fromSearch.startsWith('/') ? fromSearch : `/listing/${ride.listing.id}` });
    if (r) {
      if (fromSearch && r.filled.startDate !== rideDay) ux(S, `after Find a ride for ${rideDay}, the driver's booking form opens on ${r.filled.startDate}; the day searched is not carried over`);
      if (fromSearch && !r.filled.startFrom) ux(S, 'after Find a ride NJP Station -> Darjeeling, the booking form\'s From/To are empty; the guest types them again');
      line(S, r.filled.hasRoute, 'the ride form offers the driver\'s routes');
      line(S, r.shownTotal === Number(tripRoute.price), `total is the route fare ₹${tripRoute.price}`, `shown ₹${r.shownTotal}; ${r.filled.rate}`);
      line(S, /NJP Station/.test(r.summary) && /Darjeeling/.test(r.summary) && /7:30/.test(r.summary), 'Send step shows from -> to and the pickup time', r.summary.replace(/\s+/g, ' '));
      line(S, r.sent, 'guest sees "Request sent"', r.msg || `HTTP ${r.status}`);
      await g.snap('ride-request-sent');
    }
    const b = r?.booking;
    if (b) {
      line(S, b.amount === r.shownTotal, 'server amount equals the total shown', `server ₹${b.amount}, shown ₹${r.shownTotal}`);
      line(S, b.pickup_place === 'NJP Station' && b.drop_place === 'Darjeeling' && b.pickup_time === '07:30' && b.guests === 2 && b.check_in === rideDay && b.route_name === tripRoute.route,
        'server has the route, places, time, day and passengers', `${b.route_name}; ${b.pickup_place}->${b.drop_place} ${b.pickup_time}, ${b.guests}, ${b.check_in}`);
      await hostCard(hd, b.id);
      const rl = await hd.page.locator(`[data-testid="booking-ride-${b.id}"]`).innerText().catch(() => '');
      line(S, /NJP Station/.test(rl) && /Darjeeling/.test(rl) && /7:30/.test(rl), 'host card shows the ride (booking-ride)', rl);
      const hcard = await hd.page.locator(`[data-testid="booking-${b.id}"]`).innerText().catch(() => '');
      line(S, hcard.includes(tripRoute.route), 'host card names the route', '');
      line(S, (await noticesFor(hdTok, b.id)).some((n) => n.kind === 'booking_request'), 'driver gets a "New booking request" notice');
      await hd.snap('ride-request');
      // Decline with a reason.
      await hd.page.click(`[data-testid="booking-cancel-${b.id}"]`);
      const sheet = await seen(hd, `[data-testid="cancel-sheet-${b.id}"]`, 8000);
      line(S, sheet, 'Decline asks for a reason');
      if (sheet) {
        const title = await hd.page.locator('#cx-title').innerText().catch(() => '');
        line(S, /declin/i.test(title), 'the sheet asks why you are declining', title);
        // Pressing go without a reason must say so.
        await hd.page.click(`[data-testid="booking-cancel-yes-${b.id}"]`);
        const err = await hd.page.locator('#cx-err').innerText().catch(() => '');
        line(S, /reason/i.test(err), 'Decline without a reason says "Please choose a reason"', err);
        await hd.page.click('[data-testid="cancel-reason-not_available"]');
        await hd.page.fill(`#cx-note-${b.id}`, 'Car in for service');
        await hd.snap('decline-sheet');
        await hd.page.click(`[data-testid="booking-cancel-yes-${b.id}"]`);
        await hd.page.locator(`[data-testid="cancel-sheet-${b.id}"]`).waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
      }
      const gb = await until(async () => { const x = await guestBooking(gTok, b.id); return x?.status === 'cancelled' ? x : null; }, 10000);
      line(S, !!gb && gb.declined === true && gb.cancel_reason === 'not_available', 'server: cancelled, declined, with the reason', gb ? `${gb.status} declined=${gb.declined} ${gb.cancel_reason} "${gb.cancel_note}"` : 'not cancelled');
      const hban = await hd.page.locator(`[data-testid="booking-cancelled-${b.id}"]`).innerText().catch(() => '');
      line(S, /declined/i.test(hban) && /not available/i.test(hban), 'host card says you declined, with the reason', hban.replace(/\s+/g, ' '));
      await hd.snap('ride-declined');
      await tripCard(g, b.id);
      const ban = await g.page.locator(`[data-testid="trip-cancelled-${b.id}"]`).innerText().catch(() => '');
      line(S, /Declined by the host/i.test(ban) && /not available/i.test(ban) && /Car in for service/.test(ban), 'guest card: "Declined by the host" with the reason and note', ban.replace(/\s+/g, ' '));
      line(S, (await g.page.locator(`[data-testid="cancel-booking-${b.id}"]`).count()) === 0, 'a declined trip has no Cancel button');
      await g.snap('ride-declined');
      const gn = (await noticesFor(gTok, b.id)).find((n) => n.kind === 'booking_declined');
      line(S, !!gn, 'guest gets a "Request declined" notice', (await noticesFor(gTok, b.id)).map((n) => n.kind).join(','));
      if (gn) {
        await go(g, '/notifications');
        if (await seen(g, `[data-testid="note-${gn.id}"]`, 15000)) {
          const txt = await g.page.locator(`[data-testid="note-${gn.id}"]`).innerText();
          line(S, /not available/i.test(txt), 'the notice on the page gives the host\'s reason', txt.replace(/\s+/g, ' '));
        } else line(S, false, 'guest\'s Notifications page lists the decline');
      }
    }
  } catch (e) { line(S, false, 'walk crashed', e.message.split('\n')[0]); await g.snap('crash'); }
  flushErrs(g, S); flushErrs(hd, S);

  /* ================= 4. driver: confirmed, guest asks to cancel; undo, keep, accept ================= */
  S = '4 driver cancel request';
  console.log(`\n=== ${S} ===`);
  try {
    const day2 = iso(30 + Math.floor(Math.random() * 300));
    const r = await bookViaUI(g, ride.listing, S, async (p) => {
      await p.locator('select[data-testid="booking-route"]').selectOption(dayRoute.route);
      await p.fill('[data-testid="booking-from"]', 'Darjeeling');
      await p.fill('[data-testid="booking-to"]', 'Tiger Hill');
      await p.fill('[data-testid="booking-date"]', day2);
      await p.fill('[data-testid="booking-time"]', '04:00');
      const days = (await p.locator('[data-testid="booking-days"]').count()) > 0;
      if (days) await p.locator('[data-testid="booking-days"] button').nth(1).click();
      return { days, n: days ? Number(await p.locator('[data-testid="booking-days"] .n').innerText()) : 0 };
    });
    if (!r) throw new Error('booking screen did not work');
    line(S, r.filled.days && r.filled.n === 2, 'a day-rate trip asks how many days (2)', String(r.filled.n));
    const exp = Number(dayRoute.price || ride.listing.price) * 2;
    line(S, r.shownTotal === exp, `total is day rate x 2 days = ₹${exp}`, `shown ₹${r.shownTotal}`);
    line(S, r.sent, 'guest sees "Request sent"', r.msg || `HTTP ${r.status}`);
    const b = r.booking;
    if (!b) throw new Error('no booking');
    line(S, b.amount === r.shownTotal && b.days === 2, 'server amount and days match', `₹${b.amount}, ${b.days} days`);
    await hostCard(hd, b.id);
    const rl = await hd.page.locator(`[data-testid="booking-ride-${b.id}"]`).innerText().catch(() => '');
    line(S, /2 days/.test(rl) && /Tiger Hill/.test(rl), 'host card shows days and places', rl);
    await hd.page.click(`[data-testid="booking-accept-${b.id}"]`);
    line(S, !!(await until(async () => (await guestBooking(gTok, b.id))?.status === 'accepted', 10000)), 'host accepts');
    const c = await guestConfirm(g, S, gTok, b.id, S.startsWith('2') ? hsTok : hdTok);
    if (!c || !c.ok) throw new Error('could not confirm');
    const gb = await guestBooking(gTok, b.id);
    await tripCard(g, b.id);
    const amt = digitsOf(await g.page.locator(`[data-testid="trip-amount-${b.id}"]`).innerText().catch(() => ''));
    line(S, amt === b.amount && gb.amount_due === b.amount, 'confirmed ride shows the fare quoted', `card ₹${amt}, api ₹${gb.amount_due}`);

    // Ask to cancel -> take it back.
    const btn = await g.page.locator(`[data-testid="cancel-booking-${b.id}"]`).innerText().catch(() => '');
    line(S, /Ask to cancel/i.test(btn), 'a confirmed trip offers "Ask to cancel"', btn);
    let sh = await guestCancelSheet(g, b.id, 'plans_changed', 'Flight moved');
    line(S, sh && /accept the cancellation/i.test(sh.info) && /Send cancellation request/i.test(sh.goLabel), 'the sheet says the host will be asked, button "Send cancellation request"', sh ? `${sh.goLabel} | ${sh.info}` : '');
    let req = await seen(g, `[data-testid="trip-cancel-request-${b.id}"]`, 10000);
    line(S, req, 'guest card: "Cancellation requested", waiting for the host');
    line(S, (await guestBooking(gTok, b.id))?.cancel_request?.reason === 'plans_changed', 'server has the cancel request with its reason');
    await g.snap('cancel-requested');
    await hostCard(hd, b.id);
    const hreq = await hd.page.locator(`[data-testid="booking-cancel-request-${b.id}"]`).innerText().catch(() => '');
    line(S, /asked to cancel/i.test(hreq) && /plans changed/i.test(hreq) && /Flight moved/.test(hreq), 'host sees "Guest asked to cancel" with the reason', hreq.replace(/\s+/g, ' '));
    line(S, (await noticesFor(hdTok, b.id)).some((n) => /cancel_request/.test(n.kind) || /asked to cancel/i.test(n.title)), 'driver gets a "Guest asked to cancel" notice', (await noticesFor(hdTok, b.id)).map((n) => n.kind).join(','));
    await hd.snap('cancel-request');
    await tripCard(g, b.id);
    await g.page.click(`[data-testid="trip-cancel-undo-${b.id}"]`);
    const undone = await until(async () => { const x = await guestBooking(gTok, b.id); return x && !x.cancel_request && x.status === 'confirmed'; }, 10000);
    line(S, !!undone, '"Keep my booking" takes the request back; still confirmed');
    await g.page.locator(`[data-testid="trip-cancel-request-${b.id}"]`).waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    line(S, (await g.page.locator(`[data-testid="cancel-booking-${b.id}"]`).count()) > 0, 'after taking it back, "Ask to cancel" is offered again');
    const hNotesUndo = (await noticesFor(hdTok, b.id)).map((n) => n.title);
    line(S, hNotesUndo.some((t) => /keeping/i.test(t)), 'driver hears the guest is keeping it', hNotesUndo.join(' / '));

    // Ask again -> host keeps it.
    sh = await guestCancelSheet(g, b.id, 'weather_road', '');
    req = await seen(g, `[data-testid="trip-cancel-request-${b.id}"]`, 10000);
    line(S, req, 'guest asks to cancel again');
    await hostCard(hd, b.id);
    const keepBtn = await seen(hd, `[data-testid="booking-cxkeep-${b.id}"]`, 10000);
    line(S, keepBtn, 'host has Keep booking / Accept cancellation');
    if (keepBtn) await hd.page.click(`[data-testid="booking-cxkeep-${b.id}"]`);
    const kept = await until(async () => { const x = await guestBooking(gTok, b.id); return x && !x.cancel_request && x.cancel_request_kept ? x : null; }, 10000);
    line(S, !!kept && kept.status === 'confirmed', 'host Keep: still confirmed, request closed, marked kept', kept ? `${kept.status} kept=${kept.cancel_request_kept}` : JSON.stringify((await guestBooking(gTok, b.id))?.cancel_request));
    const hk = await seen(hd, `[data-testid="booking-cancel-kept-${b.id}"]`, 8000);
    line(S, hk, 'host card says you kept the booking');
    await hd.snap('kept');
    await tripCard(g, b.id);
    const gk = await seen(g, `[data-testid="trip-cancel-kept-${b.id}"]`, 8000);
    line(S, gk, 'guest card: "The host asked to keep this booking"', gk ? await g.page.locator(`[data-testid="trip-cancel-kept-${b.id}"]`).innerText() : '');
    line(S, (await noticesFor(gTok, b.id)).some((n) => /keep/i.test(n.title)), 'guest gets "The host wants to keep your booking"', (await noticesFor(gTok, b.id)).map((n) => n.title).join(' / '));
    await g.snap('kept');
    // Tapping these notices should lead to the booking, as the booking_* ones do.
    const tapNote = async (t, tok, kind, want) => {
      const n = (await noticesFor(tok, b.id)).find((x) => x.kind === kind);
      if (!n) return line(S, false, `${t.who} has a ${kind} notice to tap`);
      await go(t, '/notifications');
      if (!(await seen(t, `[data-testid="note-${n.id}"]`, 15000))) return line(S, false, `${t.who}'s Notifications page lists the ${kind} notice`);
      await t.page.click(`[data-testid="note-${n.id}"]`);
      await t.page.waitForURL(want, { timeout: 5000 }).catch(() => {});
      return line(S, want.test(t.page.url()), `tapping the ${kind} notice ("${n.title}") opens the booking`, `still on ${t.page.url().replace(WEB, '')}`);
    };
    await tapNote(g, gTok, 'cancel_request_kept', /my-trips/);
    await tapNote(hd, hdTok, 'cancel_request', /provider\/dashboard/);
    await tripCard(g, b.id);

    // Ask a third time -> host accepts the cancellation.
    const again = (await g.page.locator(`[data-testid="cancel-booking-${b.id}"]`).count()) > 0;
    line(S, again, 'after a Keep, the guest can still ask to cancel');
    if (again) {
      await guestCancelSheet(g, b.id, 'found_other', 'Going with a friend');
      await seen(g, `[data-testid="trip-cancel-request-${b.id}"]`, 10000);
      await hostCard(hd, b.id);
      if (await seen(hd, `[data-testid="booking-cxaccept-${b.id}"]`, 10000)) await hd.page.click(`[data-testid="booking-cxaccept-${b.id}"]`);
      else line(S, false, 'host has Accept cancellation on the third request');
      const cx = await until(async () => { const x = await guestBooking(gTok, b.id); return x?.status === 'cancelled' ? x : null; }, 10000);
      line(S, !!cx && cx.cancelled_by === 'guest' && cx.cancel_reason === 'found_other', 'host Accept cancellation: cancelled, by the guest, with the reason', cx ? `${cx.status} by ${cx.cancelled_by} ${cx.cancel_reason}` : 'not cancelled');
      const hb = await hd.page.locator(`[data-testid="booking-cancelled-${b.id}"]`).innerText().catch(() => '');
      line(S, /guest/i.test(hb) && /another place|found/i.test(hb), 'host card: cancelled by the guest, with the reason', hb.replace(/\s+/g, ' '));
      await hd.snap('cx-accepted');
      await tripCard(g, b.id);
      const gban = await g.page.locator(`[data-testid="trip-cancelled-${b.id}"]`).innerText().catch(() => '');
      line(S, /Cancelled by you/i.test(gban) && /Going with a friend/.test(gban), 'guest card: "Cancelled by you" with the reason', gban.replace(/\s+/g, ' '));
      await g.snap('cx-accepted');
      const gn = (await noticesFor(gTok, b.id)).map((n) => n.title);
      line(S, gn.some((t) => /Cancellation accepted/i.test(t)), 'guest gets "Cancellation accepted"', gn.join(' / '));
      const hn = (await noticesFor(hdTok, b.id)).map((n) => n.title);
      line(S, hn.filter((t) => /cancel/i.test(t)).length >= 1, 'driver has the cancel in their notices', hn.join(' / '));
      // The ₹1 fee comes back when the host accepts the cancellation (the sheet promises it).
      const fee = await feeFor(b.id);
      line(S, fee?.status === 'refunded', 'the ₹1 fee is refunded after the host accepts the cancel', fee ? fee.status : 'no fee payment found');
    }
  } catch (e) { line(S, false, 'walk crashed', e.message.split('\n')[0]); await g.snap('crash'); }
  flushErrs(g, S); flushErrs(hd, S);

  /* ================= 5. guest withdraws a request the host has not answered ================= */
  S = '5 guest withdraws';
  console.log(`\n=== ${S} ===`);
  try {
    const day3 = iso(30 + Math.floor(Math.random() * 300));
    const r = await bookViaUI(g, ride.listing, S, async (p) => {
      await p.locator('select[data-testid="booking-route"]').selectOption(tripRoute.route);
      await p.fill('[data-testid="booking-date"]', day3);
      return {};
    });
    const b = r?.booking;
    line(S, !!r?.sent, 'request sent', r?.msg || '');
    if (!b) throw new Error('no booking');
    const from = await guestBooking(gTok, b.id);
    line(S, !!from?.pickup_place && !!from?.drop_place, 'picking a route alone fills From/To from it', `${from?.pickup_place} -> ${from?.drop_place}`);
    await tripCard(g, b.id);
    const lbl = await g.page.locator(`[data-testid="cancel-booking-${b.id}"]`).innerText().catch(() => '');
    line(S, lbl.length > 0, 'a waiting request has a Cancel button', lbl);
    const sh = await guestCancelSheet(g, b.id, 'host_not_responding', 'No answer');
    line(S, sh && /withdrawn/i.test(sh.info), 'the sheet says the request is simply withdrawn, nothing charged', sh?.info);
    const cx = await until(async () => { const x = await guestBooking(gTok, b.id); return x?.status === 'cancelled' ? x : null; }, 10000);
    line(S, !!cx && cx.cancelled_by === 'guest' && cx.cancel_reason === 'host_not_responding', 'server: cancelled by the guest with the reason', cx ? `${cx.cancelled_by} ${cx.cancel_reason}` : 'not cancelled');
    const ban = await seen(g, `[data-testid="trip-cancelled-${b.id}"]`, 8000) ? await g.page.locator(`[data-testid="trip-cancelled-${b.id}"]`).innerText() : '';
    line(S, /Cancelled by you/i.test(ban) && /not responding/i.test(ban), 'guest card: "Cancelled by you" with the reason', ban.replace(/\s+/g, ' '));
    line(S, (await g.page.locator(`[data-testid="trip-cancel-undo-${b.id}"]`).count()) === 0, 'no undo for a withdrawn request (prototype has none either)');
    await g.snap('withdrawn');
    await hostCard(hd, b.id);
    const hb = await hd.page.locator(`[data-testid="booking-cancelled-${b.id}"]`).innerText().catch(() => '');
    line(S, /Cancelled by the guest/i.test(hb), 'host card: "Cancelled by the guest"', hb.replace(/\s+/g, ' '));
    line(S, (await hd.page.locator(`[data-testid="booking-accept-${b.id}"]`).count()) === 0, 'host can no longer Accept it');
    await hd.snap('withdrawn');
    const hn = (await noticesFor(hdTok, b.id)).map((n) => n.kind);
    if (!hn.includes('booking_cancelled')) ux(S, `a guest withdrawing a request the host was notified about gives the host no notice (host notices for it: ${hn.join(',')}); the "New booking request" notice and WhatsApp stay as the last word (backend/src/routes/bookings.ts PATCH /:id/cancel notifies the host only when the booking was accepted or confirmed)`);
  } catch (e) { line(S, false, 'walk crashed', e.message.split('\n')[0]); await g.snap('crash'); }
  flushErrs(g, S); flushErrs(hd, S);

  /* ================= 6. complete + review ================= */
  S = '6 complete+review';
  console.log(`\n=== ${S} ===`);
  try {
    // A trip completes only when its last day is before today (lib/travellerDashboard isCompleted);
    // a request cannot be made for a past day, and there is no "mark done" route.
    const past = await j('POST', '/bookings', { listing_id: stay.listing.id, check_in: iso(-3), check_out: iso(-1), guests: 1 }, gTok);
    line(S, past.s === 400, 'a booking for past dates is refused', `${past.s} ${past.d?.code}`);
    if (stayBooking) {
      const rv = await j('POST', '/reviews', { listing_id: stay.listing.id, rating: 5, comment: 'Lovely stay' }, gTok);
      line(S, rv.s === 403, 'a review before the stay is over is refused (stay_required)', `${rv.s} ${rv.d?.code}`);
      await tripCard(g, stayBooking.id);
      line(S, (await g.page.locator(`[data-testid="after-trip-${stayBooking.id}"]`).count()) === 0, 'no Rate button on a trip still ahead');
    }
    console.log('     NOT TESTED: completing a trip needs its dates in the past (DB edit); the host card has no "Completed" button (the prototype bookings.js has one at stage 2)');
  } catch (e) { line(S, false, 'walk crashed', e.message.split('\n')[0]); }
  flushErrs(g, S);

  /* ================= 7. report a problem ================= */
  S = '7 report a problem';
  console.log(`\n=== ${S} ===`);
  try {
    const b = stayBooking;
    if (!b) throw new Error('no confirmed homestay booking');
    await tripCard(g, b.id);
    const open = await seen(g, `[data-testid="problem-open-${b.id}"]`, 8000);
    line(S, open, 'a confirmed trip has "Report a problem"');
    if (open) {
      await g.page.click(`[data-testid="problem-open-${b.id}"]`);
      await seen(g, `[data-testid="problem-form-${b.id}"]`, 5000);
      const send = g.page.locator(`[data-testid="problem-send-${b.id}"]`);
      line(S, await send.isDisabled(), 'Send stays off until something is written');
      await g.page.fill(`#problem-${b.id}`, 'The host asked for more money than the total shown.');
      await g.snap('problem-form');
      const resp = g.page.waitForResponse((r) => r.url().includes('/feedback/aangan') && r.request().method() === 'POST', { timeout: 10000 }).catch(() => null);
      await send.click();
      const rr = await resp;
      line(S, !!rr && rr.ok(), 'the problem is sent to the team', rr ? String(rr.status()) : 'no request');
      const sent = await seen(g, `[data-testid="problem-sent-${b.id}"]`, 8000);
      line(S, sent, 'the card says it was sent', sent ? await g.page.locator(`[data-testid="problem-sent-${b.id}"]`).innerText() : '');
      await g.snap('problem-sent');
      const fb = (await j('GET', '/feedback/aangan/all', null, admin)).d?.items || [];
      const mine = fb.find((f) => f.booking?.id === b.id);
      line(S, !!mine, 'the team sees it with the booking', mine ? (mine.message || '').slice(0, 60) : `${fb.length} items, none for this booking`);
    }
  } catch (e) { line(S, false, 'walk crashed', e.message.split('\n')[0]); await g.snap('crash'); }
  flushErrs(g, S);

  /* ================= 8. host cancels a confirmed booking ================= */
  S = '8 host cancels confirmed';
  console.log(`\n=== ${S} ===`);
  try {
    const b = stayBooking;
    if (!b) throw new Error('no confirmed homestay booking');
    await hostCard(hs, b.id);
    const btn = hs.page.locator(`[data-testid="booking-cancel-${b.id}"]`);
    const label = await btn.innerText().catch(() => '');
    line(S, (await btn.count()) > 0, 'host can cancel a confirmed booking', label);
    if (/Decline/i.test(label)) ux(S, 'on a confirmed booking the host\'s cancel button still says "Decline" while its sheet says "Why are you cancelling this booking?" and "Cancel booking" (BookingCard.tsx `decline` uses pd.decline for every stage; the prototype does the same)');
    await btn.click();
    if (await seen(hs, `[data-testid="cancel-sheet-${b.id}"]`, 8000)) {
      const title = await hs.page.locator('#cx-title').innerText().catch(() => '');
      line(S, /cancelling this booking/i.test(title), 'the sheet asks why you are cancelling this booking', title);
      await hs.page.click('[data-testid="cancel-reason-family_health"]');
      await hs.page.fill(`#cx-note-${b.id}`, 'Family emergency');
      await hs.snap('host-cancel-sheet');
      await hs.page.click(`[data-testid="booking-cancel-yes-${b.id}"]`);
      await hs.page.locator(`[data-testid="cancel-sheet-${b.id}"]`).waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    } else line(S, false, 'cancel opens the reason sheet');
    const gb = await until(async () => { const x = await guestBooking(gTok, b.id); return x?.status === 'cancelled' ? x : null; }, 10000);
    line(S, !!gb && gb.cancelled_by === 'host' && !gb.declined && gb.cancel_reason === 'family_health', 'server: cancelled by the host with the reason', gb ? `${gb.cancelled_by} declined=${gb.declined} ${gb.cancel_reason}` : 'not cancelled');
    const hban = await hs.page.locator(`[data-testid="booking-cancelled-${b.id}"]`).innerText().catch(() => '');
    line(S, /You cancelled/i.test(hban), 'host card: "You cancelled this booking"', hban.replace(/\s+/g, ' '));
    await hs.snap('host-cancelled');
    await tripCard(g, b.id);
    const ban = await g.page.locator(`[data-testid="trip-cancelled-${b.id}"]`).innerText().catch(() => '');
    line(S, /Cancelled by the host/i.test(ban) && /Family emergency/.test(ban), 'guest card: "Cancelled by the host" with the reason', ban.replace(/\s+/g, ' '));
    line(S, (await g.page.locator(`[data-testid="trip-contact-${b.id}"]`).count()) === 0, 'the host\'s contact is gone from a cancelled trip');
    await g.snap('host-cancelled');
    const gn = (await noticesFor(gTok, b.id)).find((n) => n.kind === 'booking_cancelled');
    line(S, !!gn && /Family/i.test(gn.body), 'guest gets "Booking cancelled" with the reason', gn ? gn.body : 'none');
    const fee = await feeFor(b.id);
    line(S, fee?.status === 'refunded', 'the guest\'s ₹1 fee is refunded', fee ? fee.status : 'no fee payment found');
  } catch (e) { line(S, false, 'walk crashed', e.message.split('\n')[0]); await hs.snap('crash'); }
  flushErrs(g, S); flushErrs(hs, S);

  await browser.close();
  if (notes.length) console.log(`\n${notes.length} UX NOTES:\n${notes.join('\n')}`);
  console.log(report.length ? `\n${report.length} PROBLEMS:\n${report.join('\n')}` : '\nALL BOOKING FLOWS WORK');
})();
