const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.connect({ browserURL: 'http://localhost:9333' });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  await page.goto('http://localhost:3000/listing/63fb6799-34af-4be6-be59-6f375b8f50da', { waitUntil: 'networkidle0' });
  await sleep(2500);
  await page.screenshot({ path: 'shot_detail2.png' });

  await page.evaluate(() => window.scrollTo(0, 900));
  await sleep(400);
  await page.screenshot({ path: 'shot_detail3.png' });

  await browser.disconnect();
  console.log('done');
}
main().catch(e => { console.error(e); process.exit(1); });
