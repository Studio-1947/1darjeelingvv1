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

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await sleep(300);
  await clickVisibleByText(page, 'button', /^continue/i);
  await sleep(300);
  await clickVisibleByText(page, 'button, div', /I offer services/i);
  await typeVisible(page, 'input[type="tel"]', phone);
  await sleep(200);
  await clickVisibleByText(page, 'button', /send otp/i);
  await sleep(1500);

  const hintText = await page.evaluate(() => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const els = Array.from(document.querySelectorAll('button, div')).filter(isVisible);
    const hint = els.find(x => /TAP TO FILL/i.test(x.textContent||''));
    return hint ? hint.outerHTML.slice(0,300) : 'NOT FOUND';
  });
  console.log('Hint element HTML:', hintText);

  await clickVisibleByText(page, 'button, div', /TAP TO FILL/i);
  await sleep(300);

  const otpValue = await page.evaluate(() => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const inputs = Array.from(document.querySelectorAll('input[maxlength="6"]')).filter(isVisible);
    return inputs.map(i => i.value);
  });
  console.log('OTP input values after hint click:', otpValue);

  const verifyBtnState = await page.evaluate(() => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const btns = Array.from(document.querySelectorAll('button')).filter(isVisible);
    const b = btns.find(x => /verify/i.test(x.textContent||''));
    return b ? { text: b.textContent, disabled: b.disabled } : 'NOT FOUND';
  });
  console.log('Verify button state:', verifyBtnState);
}
main().catch(e => { console.error(e); process.exit(1); });
