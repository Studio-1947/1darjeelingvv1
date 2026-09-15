const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:3000';
const phone = '9' + Math.floor(100000000 + Math.random() * 899999999).toString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickVisibleByText(page, selector, textRe) {
  return page.evaluate((sel, reSrc) => {
    const re = new RegExp(reSrc, 'i');
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const els = Array.from(document.querySelectorAll(sel)).filter(isVisible);
    const el = els.find((x) => re.test((x.textContent || '').trim()));
    if (el) { el.click(); return true; }
    return false;
  }, selector, textRe.source);
}
async function typeVisible(page, selector, value) {
  const handle = await page.evaluateHandle((sel) => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return Array.from(document.querySelectorAll(sel)).find(isVisible) || null;
  }, selector);
  const el = handle.asElement();
  if (!el) return false;
  await el.click({ clickCount: 3 });
  await el.type(value, { delay: 15 });
  return true;
}

async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9333' });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.on('response', async (res) => {
    if (res.url().includes('/otp/')) {
      console.log('RESPONSE', res.url(), res.status());
      try { console.log(await res.text()); } catch (e) {}
    }
  });
  page.on('requestfailed', (req) => console.log('REQ FAILED', req.url(), req.failure()));

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await sleep(300);
  await clickVisibleByText(page, 'button', /^continue/i);
  await sleep(300);
  await clickVisibleByText(page, 'button, div', /I offer services/i);
  await typeVisible(page, 'input[type="tel"]', phone);
  await sleep(200);
  await clickVisibleByText(page, 'button', /send otp/i);
  await sleep(1500);
  await clickVisibleByText(page, 'button, div', /TAP TO FILL/i);
  await sleep(300);
  await typeVisible(page, 'input[placeholder*="ame" i]', 'Test Provider');
  await sleep(200);
  await clickVisibleByText(page, 'button', /verify/i);
  await sleep(2000);
  console.log('URL:', page.url());
}
main().catch(e => { console.error(e); process.exit(1); });
