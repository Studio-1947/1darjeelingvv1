const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickTestIdOrText(page, selector, textRe) {
  return page.evaluate((sel, reSrc) => {
    const re = new RegExp(reSrc, 'i');
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const els = Array.from(document.querySelectorAll(sel)).filter(isVisible).filter(x => re.test((x.textContent||'').trim()));
    const el = els[els.length - 1];
    if (el) { el.click(); return true; }
    return false;
  }, selector, textRe.source);
}
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
async function bottomNavLabels(page) {
  return page.evaluate(() => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const navs = Array.from(document.querySelectorAll('nav')).filter(isVisible);
    const bottomNav = navs.find(n => n.getBoundingClientRect().bottom >= window.innerHeight - 5);
    if (!bottomNav) return 'NO BOTTOM NAV';
    return Array.from(bottomNav.querySelectorAll('a, button')).map(a => a.textContent.trim()).filter(Boolean);
  });
}

async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9333' });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  // KYC sheet on the provider dashboard (still logged in as the test provider)
  await page.goto(`${BASE}/provider/dashboard`, { waitUntil: 'networkidle0' });
  await sleep(500);
  const opened = await clickTestIdOrText(page, 'button, div', /^verification$/i);
  console.log('KYC teaser tapped:', opened);
  await sleep(600);
  let vt = await visibleText(page);
  console.log('KYC sheet content (should show a real checklist, not a hardcoded one):');
  console.log(vt.split('\n').slice(0, 25));

  // Now sign out and confirm a fresh tourist still gets the 5-tab nav
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await sleep(500);
  console.log('\nTourist (signed-out) bottom nav (expect Home/Stays/Rides/Nature/Culture):', await bottomNavLabels(page));

  await browser.disconnect();
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
