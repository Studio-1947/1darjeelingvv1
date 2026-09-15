const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9333' });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));

  await page.goto('http://localhost:8081/', { waitUntil: 'networkidle0', timeout: 60000 });
  await sleep(3000);
  await page.screenshot({ path: 'shot_rn_home.png' });
  console.log('done, url:', page.url());

  await browser.disconnect();
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
