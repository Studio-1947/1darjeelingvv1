const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:3000';
const phone = '9' + Math.floor(100000000 + Math.random() * 899999999).toString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pick the LAST (most deeply nested) match, not the first - ancestor divs
// also "contain" the target text via textContent, so a naive first-match
// grabs #root instead of the actual button.
async function clickVisibleByText(page, selector, textRe) {
  return page.evaluate((sel, reSrc) => {
    const re = new RegExp(reSrc, 'i');
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const els = Array.from(document.querySelectorAll(sel)).filter(isVisible).filter(x => re.test((x.textContent||'').trim()));
    const el = els[els.length - 1];
    if (el) { el.click(); return el.outerHTML.slice(0,150); }
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

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await sleep(300);
  console.log('continue click ->', await clickVisibleByText(page, 'button', /^continue/i));
  await sleep(300);
  console.log('role click ->', await clickVisibleByText(page, 'button, div', /I offer services/i));
  await typeVisible(page, 'input[type="tel"]', phone);
  await sleep(200);
  console.log('send otp click ->', await clickVisibleByText(page, 'button', /send otp/i));
  await sleep(1500);
  console.log('hint click ->', await clickVisibleByText(page, 'button, div', /TAP TO FILL/i));
  await sleep(300);

  const otpValue = await page.evaluate(() => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const inputs = Array.from(document.querySelectorAll('input[maxlength="6"]')).filter(isVisible);
    return inputs.map(i => i.value);
  });
  console.log('OTP input values:', otpValue);

  await typeVisible(page, 'input[placeholder*="ame" i]', 'Test Provider');
  await sleep(200);

  const verifyState = await page.evaluate(() => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const btns = Array.from(document.querySelectorAll('button')).filter(isVisible).filter(x => /verify/i.test(x.textContent||''));
    const b = btns[btns.length-1];
    return b ? { disabled: b.disabled, text: b.textContent } : 'NOT FOUND';
  });
  console.log('verify button state ->', verifyState);

  console.log('verify click ->', await clickVisibleByText(page, 'button', /verify/i));
  await sleep(2000);
  console.log('URL after verify:', page.url());
}
main().catch(e => { console.error(e); process.exit(1); });
