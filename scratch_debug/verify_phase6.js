const puppeteer = require('puppeteer-core');

const BASE = 'http://localhost:3000';
const phone = '9' + Math.floor(100000000 + Math.random() * 899999999).toString();

function log(...a) { console.log(...a); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickVisibleByText(page, selector, textRe) {
  return page.evaluate((sel, reSrc) => {
    const re = new RegExp(reSrc, 'i');
    const isVisible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
    };
    const els = Array.from(document.querySelectorAll(sel)).filter(isVisible).filter((x) => re.test((x.textContent || '').trim()));
    const el = els[els.length - 1];
    if (el) { el.click(); return true; }
    return false;
  }, selector, textRe.source);
}

async function clickTestId(page, testId) {
  return page.evaluate((tid) => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const el = document.querySelector(`[data-testid="${tid}"]`);
    if (el && isVisible(el)) { el.click(); return true; }
    return false;
  }, testId);
}

async function typeVisible(page, selector, value) {
  const handle = await page.evaluateHandle((sel) => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return Array.from(document.querySelectorAll(sel)).find(isVisible) || null;
  }, selector);
  const el = handle.asElement();
  if (!el) { log(`typeVisible: no visible match for ${selector}`); return false; }
  await el.click({ clickCount: 3 });
  await el.type(value, { delay: 15 });
  return true;
}

async function visibleText(page) {
  return page.evaluate(() => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let out = '';
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (parent && isVisible(parent) && node.textContent.trim()) out += node.textContent.trim() + '\n';
    }
    return out;
  });
}

async function bottomNavLabels(page) {
  return page.evaluate(() => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const navs = Array.from(document.querySelectorAll('nav')).filter(isVisible);
    const bottomNav = navs.find((n) => n.getBoundingClientRect().bottom >= window.innerHeight - 5);
    if (!bottomNav) return 'NO BOTTOM NAV';
    return Array.from(bottomNav.querySelectorAll('a, button')).map((a) => a.textContent.trim()).filter(Boolean);
  });
}

async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9333' });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.on('pageerror', (err) => log('PAGE ERROR:', err.message));

  // Fresh session - clear any leftover token from earlier test runs sharing this Chrome profile.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });

  log('=== Step 1: signup as provider via mobile /login, phone', phone, '===');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await sleep(300);
  await clickVisibleByText(page, 'button', /^continue/i);
  await sleep(300);
  await clickVisibleByText(page, 'button, div', /I offer services/i);
  await typeVisible(page, 'input[type="tel"]', phone);
  await sleep(200);
  await clickVisibleByText(page, 'button', /send otp/i);
  await sleep(1500);
  const gotHint = await clickVisibleByText(page, 'button, div', /TAP TO FILL/i);
  log('Mock OTP hint clicked:', gotHint);
  await sleep(300);
  await typeVisible(page, 'input[placeholder*="ame" i]', 'Test Provider');
  await sleep(200);
  await clickVisibleByText(page, 'button', /verify/i);
  await sleep(2000);
  log('URL after verify (expect /provider/onboard for a fresh provider signup):', page.url());

  // ---- Step 2: onboard as homestay provider ----
  log('\n=== Step 2: provider onboarding (mobile, homestay) ===');
  if (!page.url().includes('/provider/onboard')) {
    await page.goto(`${BASE}/provider/onboard`, { waitUntil: 'networkidle0' });
    await sleep(400);
  }
  let vt = await visibleText(page);
  log('Onboard step 1 heading present ("What do you run?"):', /what do you run/i.test(vt));

  await clickVisibleByText(page, 'button, div', /^homestay$/i);
  await sleep(200);
  await clickVisibleByText(page, 'button', /continue/i);
  await sleep(400);

  vt = await visibleText(page);
  log('Basics step heading present ("The basics"):', /the basics/i.test(vt));

  const filledCount = await page.evaluate(() => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const setNative = (el, val) => {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const fields = Array.from(document.querySelectorAll('input, textarea')).filter(isVisible);
    const vals = ['Test Mountain Homestay', 'Darjeeling', '9800000000', 'A cozy test homestay for verification.'];
    fields.forEach((f, i) => { if (vals[i]) setNative(f, vals[i]); });
    return fields.length;
  });
  log('Basics step visible field count (expect 4):', filledCount);
  await sleep(200);
  await clickVisibleByText(page, 'button', /continue/i);
  await sleep(500);

  vt = await visibleText(page);
  log('Details step heading present ("Set up your listing"):', /set up your listing/i.test(vt));

  await page.evaluate(() => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const inputs = Array.from(document.querySelectorAll('input')).filter(isVisible);
    const hostNameInput = inputs.find((i) => i.type === 'text' || i.type === '');
    if (hostNameInput) { setter.call(hostNameInput, 'Test Host'); hostNameInput.dispatchEvent(new Event('input', { bubbles: true })); }
    const priceInput = inputs.find((i) => i.type === 'number');
    if (priceInput) { setter.call(priceInput, '2500'); priceInput.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await sleep(200);

  const submitClicked = await clickVisibleByText(page, 'button', /register.*pay|submit/i);
  log('Submit (₹99 register) clicked:', submitClicked);
  await sleep(1500);

  vt = await visibleText(page);
  const hasValidationError = /are required/i.test(vt);
  log('Validation error present (should be false):', hasValidationError);
  if (hasValidationError) log('Full visible text at failure:\n', vt);

  const modalOpen = await page.evaluate(() => !!document.querySelector('[data-testid="mock-payment-modal"]'));
  log('Mock payment modal open:', modalOpen);

  if (modalOpen) {
    const paid = await clickTestId(page, 'mock-payment-pay');
    log('Real mock-payment-pay button clicked:', paid);
    await sleep(2500);
  }

  vt = await visibleText(page);
  log('URL after payment:', page.url());
  log('Post-payment visible text (first 400 chars):\n', vt.slice(0, 400));

  // ---- Confirm backend state directly ----
  const providerState = await page.evaluate(async () => {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/providers/me', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => null);
    return { status: res.status, provider: data?.provider ? { status: data.provider.status, business_name: data.provider.business_name } : data };
  });
  log('GET /api/providers/me ->', JSON.stringify(providerState));

  // ---- Step 3: bottom nav + dashboard ----
  log('\n=== Step 3: bottom nav + /provider/dashboard ===');
  await page.goto(`${BASE}/provider/dashboard`, { waitUntil: 'networkidle0' });
  await sleep(500);
  log('URL:', page.url());
  log('Bottom nav labels (expect Dashboard/Bookings/Chats/Account):', await bottomNavLabels(page));
  vt = await visibleText(page);
  log('Dashboard visible text (first 500 chars):\n', vt.slice(0, 500));
  log('Fabricated stat keywords present (should be false):', /occupancy|today.?s earnings|seats? filled|scan chart/i.test(vt));

  // ---- Step 4: /provider/account ----
  log('\n=== Step 4: /provider/account ===');
  await page.goto(`${BASE}/provider/account`, { waitUntil: 'networkidle0' });
  await sleep(500);
  log('URL:', page.url());
  vt = await visibleText(page);
  log('Account page visible text:\n', vt.slice(0, 600));

  // ---- Step 5: /provider/chats ----
  log('\n=== Step 5: /provider/chats ===');
  await page.goto(`${BASE}/provider/chats`, { waitUntil: 'networkidle0' });
  await sleep(500);
  log('URL:', page.url());
  vt = await visibleText(page);
  log('Chats page visible text:\n', vt.slice(0, 400));

  // ---- Step 6: /my-listings mobile ----
  log('\n=== Step 6: /my-listings (mobile) ===');
  await page.goto(`${BASE}/my-listings`, { waitUntil: 'networkidle0' });
  await sleep(500);
  log('URL:', page.url());
  vt = await visibleText(page);
  log('My Listings page visible text:\n', vt.slice(0, 500));

  await browser.disconnect();
  log('\n=== DONE. Test phone used:', phone, '===');
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
