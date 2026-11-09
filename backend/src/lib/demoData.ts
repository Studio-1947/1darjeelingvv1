/**
 * Finds and removes the sample businesses that the old admin "Seed" button put on the live site
 * (DEMO_BUSINESSES in seed_data.ts: 4 homestays, 3 drivers, 3 shops, 3 cafes). They looked like
 * real, bookable places, some under real shop names, but no host ever signed up for them.
 *
 * What is deleted: only a listing owned by 'admin-seed-provider' whose title and type match a demo
 * business, and that has no bookings. Anything else that looks off is reported for a person:
 *   - a demo business that has bookings (deleting it would delete those bookings too)
 *   - other host listings owned by the admin account (may be real places the team added)
 *   - host listings whose photo is a stock or placeholder image
 * Curated spots, events and nature entries are never touched.
 */
import type { Client, PoolClient } from 'pg';

import { DEMO_BUSINESSES } from '../seed_data';

type Db = Pick<Client | PoolClient, 'query'>;

export const DEMO_PROVIDER_ID = 'admin-seed-provider';
export const HOST_TYPES = ['homestay', 'driver', 'guide', 'cafe', 'shop'];

/** Image hosts that mean a stock photo or a placeholder, never a host's own upload. */
const STOCK_PHOTO_HOSTS = [
  'images.pexels.com',
  'images.unsplash.com',
  'res.cloudinary.com',
  'miro.medium.com',
  'loremflickr.com',
  'picsum.photos',
  'via.placeholder.com',
  'placehold.co',
];

export function isStockPhoto(url: unknown): boolean {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return STOCK_PHOTO_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

export interface FoundListing {
  id: string;
  title: string;
  type: string;
  provider_id: string;
  bookings: number;
  reviews: number;
  saves: number;
  stock_photos: number;
}

export interface DemoReport {
  /** Demo businesses with no bookings: removed by --execute. */
  remove: FoundListing[];
  /** Demo businesses that have bookings: left alone, for a person to decide. */
  booked: FoundListing[];
  /** Other host listings owned by the admin account: left alone. */
  adminOwned: FoundListing[];
  /** Host listings by real hosts that use stock or placeholder photos: left alone. */
  stockPhotos: FoundListing[];
}

const demoKey = (title: string, type: string) => `${type}\u0000${title.trim().toLowerCase()}`;
const DEMO_KEYS = new Set(DEMO_BUSINESSES.map((d) => demoKey(d.title, d.type)));

export function isDemoBusiness(l: { title: string; type: string; provider_id: string }): boolean {
  return l.provider_id === DEMO_PROVIDER_ID && DEMO_KEYS.has(demoKey(l.title, l.type));
}

export async function findDemoData(db: Db): Promise<DemoReport> {
  const { rows } = await db.query(
    `SELECT l.id, l.title, l.type, l.provider_id, l.image, l.extras,
            (SELECT count(*)::int FROM bookings b WHERE b.listing_id = l.id) AS bookings,
            (SELECT count(*)::int FROM reviews r WHERE r.listing_id = l.id) AS reviews,
            (SELECT count(*)::int FROM favorites f WHERE f.listing_id = l.id) AS saves
       FROM listings l
      WHERE l.type = ANY($1)
      ORDER BY l.type, l.title`,
    [HOST_TYPES],
  );
  const report: DemoReport = { remove: [], booked: [], adminOwned: [], stockPhotos: [] };
  for (const r of rows) {
    const photos = [r.image, ...(Array.isArray(r.extras?.images) ? r.extras.images : [])];
    const item: FoundListing = {
      id: r.id, title: r.title, type: r.type, provider_id: r.provider_id,
      bookings: r.bookings, reviews: r.reviews, saves: r.saves,
      stock_photos: photos.filter(isStockPhoto).length,
    };
    if (isDemoBusiness(r)) (item.bookings > 0 ? report.booked : report.remove).push(item);
    else if (r.provider_id === DEMO_PROVIDER_ID) report.adminOwned.push(item);
    else if (item.stock_photos > 0) report.stockPhotos.push(item);
  }
  return report;
}

/**
 * Deletes the given demo businesses in one transaction. Each one is checked again inside the
 * delete, so a listing that gained a booking since the report, or is not a demo business, stays.
 * Their saves and reviews go with them (foreign keys cascade). Returns the ids deleted.
 */
export async function deleteDemoListings(db: Db, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  await db.query('BEGIN');
  try {
    const { rows } = await db.query(
      `SELECT id, title, type, provider_id FROM listings l
        WHERE l.id = ANY($1) AND l.provider_id = $2
          AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.listing_id = l.id)
        FOR UPDATE`,
      [ids, DEMO_PROVIDER_ID],
    );
    const sure = rows.filter(isDemoBusiness).map((r) => r.id as string);
    if (sure.length) await db.query('DELETE FROM listings WHERE id = ANY($1)', [sure]);
    await db.query('COMMIT');
    return sure;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}
