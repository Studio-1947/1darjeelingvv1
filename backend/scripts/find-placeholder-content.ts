/**
 * Lists live content that looks unfinished or like test text, for a person to review.
 * READ-ONLY: it never changes or deletes anything. Hide or fix what it finds from the admin panel.
 *
 * Checks, with the same rules the server now applies to new content (src/lib/contentRules.ts):
 *   - listing names and places that are too short or keyboard-mash ("D", "asdasd")
 *   - listings with untidy spacing ("Dali , Darjeeling")
 *   - homestays, drivers and guides with no price, and listings with no photo
 *   - feed posts that are keyboard-mash ("zxczxfsdfsdf")
 *   - reviews that are only a referral code ("Very good ANG26-4AWLNE")
 *
 * Usage (against any database, e.g. prod with a read-only user):
 *   DATABASE_URL=postgres://... npx tsx scripts/find-placeholder-content.ts
 */
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { findPlaceholderContent } from '../src/lib/placeholderContent';

dotenv.config({ path: path.join(__dirname, '../.env') });

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const db = new Client({ connectionString: url });
  await db.connect();
  const items = await findPlaceholderContent(db);
  await db.end();
  for (const i of items) {
    const what = i.kind === 'listing' ? `"${i.label}" (${i.type})` : `"${i.label}"`;
    console.log(`${i.kind.padEnd(8)} ${i.id}  ${what}: ${i.problems.join('; ')}`);
  }
  if (!items.length) console.log('Nothing found.');
  console.log(`\n${items.length} item(s) to review. Nothing was changed.`);
})();
