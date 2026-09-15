const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function clickVisibleByText(page, selector, textRe) {
  return page.evaluate((sel, reSrc) => {
    const re = new RegExp(reSrc, 'i');
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const els = Array.from(document.querySelectorAll(sel)).filter(isVisible).filter(x => re.test((x.textContent||'').trim()));
    const el = els[els.length - 1];
    if (el) { el.click(); return true; }
    return false;
  }, selector, textRe.source);
}
async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9333' });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('8081'));
  if (!page) { console.log('no 8081 page found, urls:', pages.map(p=>p.url())); return; }
  await clickVisibleByText(page, 'div, button, [role="button"]', /^continue/i);
  await sleep(1500);
  console.log('url after continue:', page.url());
  await page.screenshot({ path: 'shot_rn_next.png' });
  await browser.disconnect();
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
