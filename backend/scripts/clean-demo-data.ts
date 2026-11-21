/**
 * Removes the sample businesses the old admin "Seed" button put on the site, and lists other host
 * listings that need a person to look at them. The rules are in src/lib/demoData.ts.
 *
 * SAFE BY DEFAULT: it only reports. Add --execute to delete the demo businesses that have no
 * bookings, in one transaction. Nothing else is ever changed. A second run finds nothing to remove.
 *
 * Usage (from backend/, with DATABASE_URL set; on the server, inside the backend container):
 *   npx tsx scripts/clean-demo-data.ts              # report only
 *   npx tsx scripts/clean-demo-data.ts --execute    # delete the demo businesses
 */
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

import { deleteDemoListings, findDemoData, type FoundListing } from '../src/lib/demoData';

dotenv.config({ path: path.join(__dirname, '../.env') });

function print(title: string, items: FoundListing[]) {
  console.log(`\n${title}: ${items.length}`);
  for (const l of items) {
    const extra = [
      l.bookings ? `${l.bookings} bookings` : '',
      l.reviews ? `${l.reviews} reviews` : '',
      l.saves ? `${l.saves} saves` : '',
      l.stock_photos ? `${l.stock_photos} stock photos` : '',
    ].filter(Boolean).join(', ');
    console.log(`  ${l.type.padEnd(8)} ${l.id}  "${l.title}"${extra ? `  (${extra})` : ''}`);
  }
}

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const execute = process.argv.includes('--execute');
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const report = await findDemoData(db);
    print('Demo businesses to remove', report.remove);
    print('Demo businesses with bookings (left alone; cancel or move the bookings first)', report.booked);
    print('Other host listings owned by the admin account (left alone; check in admin)', report.adminOwned);
    print('Host listings with stock or placeholder photos (left alone; ask the host for real photos)', report.stockPhotos);

    if (!execute) {
      console.log(`\nReport only. Run again with --execute to delete the ${report.remove.length} demo businesses.`);
      return;
    }
    const deleted = await deleteDemoListings(db, report.remove.map((l) => l.id));
    console.log(`\nDeleted ${deleted.length} demo businesses.`);
  } finally {
    await db.end();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
