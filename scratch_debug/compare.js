const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9333' });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle0' });
  await sleep(2200);
  await page.screenshot({ path: 'webapp_mobile_home.png' });
  console.log('done');
  await browser.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
