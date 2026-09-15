const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9333' });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.on('response', async (res) => {
    if (res.status() >= 400) {
      console.log('BAD RESPONSE', res.status(), res.url());
    }
  });
  await page.goto(`${BASE}/listing/795d2fdf-6c59-4bb4-86e4-02e2ed5e1f0b`, { waitUntil: 'networkidle0' });
  await sleep(1000);
}
main().catch(e => { console.error(e); process.exit(1); });
