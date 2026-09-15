const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9333' });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  // Reuses the still-logged-in provider session from the previous run (same Chrome profile).
  await page.goto(`${BASE}/provider/dashboard`, { waitUntil: 'networkidle0' });
  await sleep(500);
  let vt = await visibleText(page);
  console.log('=== Dashboard KYC teaser line (should be a sane 0-100% now, not 2000%) ===');
  const kycLine = vt.split('\n').find(l => /% *$/.test(l) || /complete/i.test(l));
  console.log(vt.split('\n').filter(l => /%|complete/i.test(l)));

  await page.goto(`${BASE}/provider/account`, { waitUntil: 'networkidle0' });
  await sleep(500);
  vt = await visibleText(page);
  console.log('=== Account verification row (should be sane %) ===');
  console.log(vt.split('\n').filter(l => /%/.test(l)));

  // ---- Desktop pixel-identical spot check ----
  console.log('\n=== Desktop spot check (1440px) ===');
  await page.setViewport({ width: 1440, height: 900 });
  for (const path of ['/provider/dashboard', '/provider/onboard', '/my-listings']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle0' });
    await sleep(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const hasMobileNav = await page.evaluate(() => {
      const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const navs = Array.from(document.querySelectorAll('nav')).filter(isVisible);
      return navs.some(n => n.getBoundingClientRect().bottom >= window.innerHeight - 5);
    });
    console.log(path, '-> horizontal overflow px:', overflow, '| mobile bottom-nav visible (should be false):', hasMobileNav);
  }

  await browser.disconnect();
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
