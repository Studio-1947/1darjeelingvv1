const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  await page.goto(`${BASE}/provider/dashboard`, { waitUntil: 'networkidle0' });
  await sleep(500);

  const clicked = await page.evaluate(() => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const btns = Array.from(document.querySelectorAll('button')).filter(isVisible).filter(b => /verification/i.test(b.textContent||''));
    const b = btns[btns.length - 1];
    if (b) { b.click(); return true; }
    return false;
  });
  console.log('KYC teaser clicked:', clicked);
  await sleep(700);
  const vt = await visibleText(page);
  console.log(vt.split('\n').slice(0, 30));

  await browser.disconnect();
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
