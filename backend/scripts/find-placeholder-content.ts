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
import { checkNameLike, checkPostText, tidyText } from '../src/lib/contentRules';
import { REFERRAL_CODE_IN_TEXT } from '../src/lib/reviewRules';

dotenv.config({ path: path.join(__dirname, '../.env') });

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const db = new Client({ connectionString: url });
  await db.connect();
  const found: string[] = [];
  const note = (kind: string, id: string, what: string) => found.push(`${kind.padEnd(8)} ${id}  ${what}`);

  const listings = await db.query(
    `SELECT id, type, title, location, price, image, extras FROM listings ORDER BY created_at DESC`,
  );
  for (const l of listings.rows) {
    const label = `"${l.title}" (${l.type}, ${l.location})`;
    const name = checkNameLike(l.title, 'Name', 200);
    if ('error' in name) note('listing', l.id, `${label}: name - ${name.error}`);
    const place = checkNameLike(l.location, 'Location', 200);
    if ('error' in place) note('listing', l.id, `${label}: place - ${place.error}`);
    if (tidyText(l.title) !== l.title || tidyText(l.location) !== l.location) note('listing', l.id, `${label}: untidy spacing`);
    if (['homestay', 'driver', 'guide'].includes(l.type) && !(l.price > 0)) note('listing', l.id, `${label}: no price`);
    const photos = Array.isArray(l.extras?.images) ? l.extras.images.length : 0;
    if (!l.image && !photos && !['spot', 'event', 'biodiversity'].includes(l.type)) note('listing', l.id, `${label}: no photo`);
  }

  const posts = await db.query(`SELECT id, body FROM host_posts WHERE hidden_at IS NULL ORDER BY created_at DESC`)
    .catch(() => db.query(`SELECT id, body FROM host_posts ORDER BY created_at DESC`));
  for (const p of posts.rows) {
    const problem = checkPostText(String(p.body || '').trim());
    if (problem) note('post', p.id, `"${String(p.body).slice(0, 60)}": ${problem}`);
  }

  const reviews = await db.query(`SELECT id, listing_id, comment FROM reviews ORDER BY created_at DESC`);
  for (const r of reviews.rows) {
    if (REFERRAL_CODE_IN_TEXT.test(String(r.comment || ''))) note('review', r.id, `"${String(r.comment).slice(0, 60)}": holds a referral code`);
  }

  await db.end();
  console.log(found.length ? found.join('\n') : 'Nothing found.');
  console.log(`\n${found.length} item(s) to review. Nothing was changed.`);
})();
