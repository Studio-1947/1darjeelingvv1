const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LISTINGS = {
  homestay: '63fb6799-34af-4be6-be59-6f375b8f50da',
  driver: '7141982b-d9f6-4787-802b-4fd9f67924ab',
  spot: '0900c6d5-e496-4b64-90f8-2d16b24184d2',
  cafe: '795d2fdf-6c59-4bb4-86e4-02e2ed5e1f0b',
  event: '91d5399c-29a5-4cf8-91fd-033f896a2636',
  biodiversity: '925bbf77-568f-4053-b57c-0a70307ba92b',
};

async function visibleText(page) {
  return page.evaluate(() => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let out = ''; let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (parent && isVisible(parent) && node.textContent.trim()) out += node.textContent.trim() + '\n';
    }
    return out;
  });
}

async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9333' });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error' && !/favicon/i.test(msg.text())) errors.push(msg.text()); });

  for (const [type, id] of Object.entries(LISTINGS)) {
    errors.length = 0;
    await page.goto(`${BASE}/listing/${id}`, { waitUntil: 'networkidle0' });
    await sleep(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const vt = await visibleText(page);
    const hasHero = /₹|categories|./.test(vt); // sanity: page rendered something
    const hasReviews = /Reviews|What guests say/i.test(vt);
    const hasSticky = await page.evaluate(() => {
      const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return Array.from(document.querySelectorAll('.mobile-ui')).some(el => isVisible(el) && el.getBoundingClientRect().bottom >= window.innerHeight - 100 && el.getBoundingClientRect().top > window.innerHeight * 0.7);
    });
    console.log(`--- ${type} (${id}) ---`);
    console.log('  horizontal overflow px:', overflow, '| console/page errors:', errors.length, errors.slice(0,2));
    console.log('  has reviews section:', hasReviews);
    console.log('  first 200 chars:', vt.slice(0, 200).replace(/\n/g, ' | '));
  }

  // Homestay booking form interaction
  console.log('\n=== Homestay booking form interaction ===');
  await page.goto(`${BASE}/listing/${LISTINGS.homestay}`, { waitUntil: 'networkidle0' });
  await sleep(600);
  const checkinInput = await page.$('.mobile-ui input[type="date"]');
  console.log('Check-in date input found:', !!checkinInput);
  if (checkinInput) {
    const dateInputs = await page.$$('.mobile-ui input[type="date"]');
    console.log('Number of date inputs:', dateInputs.length);
    const in5 = new Date(Date.now() + 5*86400000).toISOString().slice(0,10);
    const out7 = new Date(Date.now() + 7*86400000).toISOString().slice(0,10);
    await page.evaluate((sel, val) => {
      const el = document.querySelector(sel);
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, '.mobile-ui input[type="date"]', in5);
    await sleep(200);
    const dateInputs2 = await page.$$('.mobile-ui input[type="date"]');
    if (dateInputs2[1]) {
      await page.evaluate((el, val) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, dateInputs2[1], out7);
    }
    await sleep(300);
    const vt = await visibleText(page);
    console.log('Price breakdown shows nights line?', /night/i.test(vt));
    console.log('Total line present?', /₹\d/.test(vt));
  }

  // Sticky bar tap for homestay -> should scroll/attempt booking
  console.log('\n=== Sticky CTA bar presence ===');
  const stickyVisible = await page.evaluate(() => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const fixed = Array.from(document.querySelectorAll('div')).filter(el => {
      const s = window.getComputedStyle(el);
      return s.position === 'fixed' && isVisible(el);
    });
    return fixed.map(el => el.textContent.slice(0, 60));
  });
  console.log('Fixed elements visible on homestay detail:', stickyVisible);

  // Desktop spot check
  console.log('\n=== Desktop spot check (1440px) ===');
  await page.setViewport({ width: 1440, height: 900 });
  for (const [type, id] of Object.entries(LISTINGS)) {
    await page.goto(`${BASE}/listing/${id}`, { waitUntil: 'networkidle0' });
    await sleep(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const mobileTreeVisible = await page.evaluate(() => {
      const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return Array.from(document.querySelectorAll('.mobile-ui')).some(isVisible);
    });
    console.log(type, '-> overflow:', overflow, '| mobile tree visible at 1440px (should be false):', mobileTreeVisible);
  }

  await browser.disconnect();
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
