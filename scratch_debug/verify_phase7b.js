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
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.evaluate(() => { try { localStorage.clear(); } catch(e){} }).catch(()=>{});

  // Signed-out: tap Reserve Now on homestay -> should redirect to /login
  await page.goto(`${BASE}/listing/63fb6799-34af-4be6-be59-6f375b8f50da`, { waitUntil: 'networkidle0' });
  await sleep(500);
  await clickVisibleByText(page, 'button', /reserve now/i);
  await sleep(1000);
  console.log('Signed-out Reserve Now -> URL:', page.url());

  // Write a review while signed out -> should show the login-gate modal
  await page.goto(`${BASE}/listing/63fb6799-34af-4be6-be59-6f375b8f50da`, { waitUntil: 'networkidle0' });
  await sleep(500);
  await clickVisibleByText(page, 'button', /write a review/i);
  await sleep(500);
  let vt = await visibleText(page);
  console.log('Login-gate modal appeared after "Write a review"?', /sign in/i.test(vt));

  // Cafe contact section + directions button
  await page.goto(`${BASE}/listing/795d2fdf-6c59-4bb4-86e4-02e2ed5e1f0b`, { waitUntil: 'networkidle0' });
  await sleep(500);
  vt = await visibleText(page);
  console.log('\nCafe page has Call/WhatsApp/Directions?', /call now|whatsapp/i.test(vt), /get directions/i.test(vt));

  // Driver page routes
  await page.goto(`${BASE}/listing/7141982b-d9f6-4787-802b-4fd9f67924ab`, { waitUntil: 'networkidle0' });
  await sleep(500);
  vt = await visibleText(page);
  console.log('\nDriver page shows routes?', /full-day darjeeling sightseeing/i.test(vt));
  console.log('Driver page shows "Talk to Driver"?', /talk to driver/i.test(vt));

  // Heart/save button (signed out) should open login gate too
  await page.goto(`${BASE}/listing/63fb6799-34af-4be6-be59-6f375b8f50da`, { waitUntil: 'networkidle0' });
  await sleep(500);
  const heartClicked = await page.evaluate(() => {
    const isVisible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const btns = Array.from(document.querySelectorAll('button')).filter(isVisible);
    // heart icon button is the one in the top-right pill cluster with an svg heart path; just click the 2nd top-right circular button
    const candidates = btns.filter(b => b.className.includes('rounded-full') && b.className.includes('bg-white/95'));
    if (candidates[0]) { candidates[0].click(); return true; }
    return false;
  });
  await sleep(400);
  vt = await visibleText(page);
  console.log('\nHeart tap (signed out) opened login gate?', heartClicked, '/', /sign in/i.test(vt));

  await browser.disconnect();
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
