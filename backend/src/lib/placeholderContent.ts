/**
 * Live content that looks unfinished or like test text, for a person to review. READ-ONLY.
 * Same rules the server applies to new content (contentRules.ts). Used by
 * scripts/find-placeholder-content.ts and the admin panel's Clean-up tab.
 */
import type { Client, PoolClient } from 'pg';

import { checkNameLike, checkPostText, tidyText } from './contentRules';
import { REFERRAL_CODE_IN_TEXT } from './reviewRules';

type Db = Pick<Client | PoolClient, 'query'>;

export interface PlaceholderItem {
  kind: 'listing' | 'post' | 'review';
  id: string;
  /** What a person sees: the listing name, or the start of the post or review. */
  label: string;
  /** Listing type, for listings. */
  type?: string;
  problems: string[];
}

export async function findPlaceholderContent(db: Db): Promise<PlaceholderItem[]> {
  const items: PlaceholderItem[] = [];

  const listings = await db.query(
    `SELECT id, type, title, location, price, image, extras FROM listings ORDER BY created_at DESC`,
  );
  for (const l of listings.rows) {
    const problems: string[] = [];
    const name = checkNameLike(l.title, 'Name', 200);
    if ('error' in name) problems.push(`name: ${name.error}`);
    const place = checkNameLike(l.location, 'Location', 200);
    if ('error' in place) problems.push(`place "${l.location}": ${place.error}`);
    if (tidyText(l.title) !== l.title || tidyText(l.location) !== l.location) problems.push('untidy spacing');
    if (['homestay', 'driver', 'guide'].includes(l.type) && !(l.price > 0)) problems.push('no price');
    const photos = Array.isArray(l.extras?.images) ? l.extras.images.length : 0;
    if (!l.image && !photos && !['spot', 'event', 'biodiversity'].includes(l.type)) problems.push('no photo');
    if (problems.length) items.push({ kind: 'listing', id: l.id, label: l.title, type: l.type, problems });
  }

  const posts = await db
    .query(`SELECT id, body FROM host_posts WHERE hidden_at IS NULL ORDER BY created_at DESC`)
    .catch(() => db.query(`SELECT id, body FROM host_posts ORDER BY created_at DESC`));
  for (const p of posts.rows) {
    const problem = checkPostText(String(p.body || '').trim());
    if (problem) items.push({ kind: 'post', id: p.id, label: String(p.body).slice(0, 80), problems: [problem] });
  }

  const reviews = await db.query(`SELECT id, comment FROM reviews ORDER BY created_at DESC`);
  for (const r of reviews.rows) {
    if (REFERRAL_CODE_IN_TEXT.test(String(r.comment || ''))) {
      items.push({ kind: 'review', id: r.id, label: String(r.comment).slice(0, 80), problems: ['holds a referral code'] });
    }
  }
  return items;
}
