/**
 * Imports the tourist spots from the Aangan 2.0 prototype (the aangan20testing Vercel site) into
 * the `listings` table as admin-curated spots.
 *
 * Sources, all read from the prototype folder (default: ../Aangan-2.0 next to backend/):
 *   data.js                 hand-written spots (cat 'spots')
 *   places.js               OSMPLACES: OpenStreetMap places (© OpenStreetMap contributors, ODbL)
 *   media/spots/spotimg.js  SPOTIMG: id -> Wikimedia photo
 *   media/{spots,places}/credits.json  author + licence of every photo
 *
 * Rules:
 *   - A spot with at least one photo is published; one without comes in as a draft (admin-only),
 *     to be published from the admin console once somebody adds a photo.
 *   - Photos are uploaded to our storage under a content-hash key, so a re-run reuses them.
 *   - Inserts go through createSpot (the admin console's own path): same validation, and a title
 *     that already exists is skipped, which makes the script safe to re-run.
 *   - The seven spots we already had (Tiger Hill, Batasia, ...) are not duplicated: they only get
 *     the prototype's map position, highlights and ordering where theirs are missing.
 *
 * Usage (from backend/):
 *   npx tsx scripts/import-aangan-spots.ts --dry-run      # report only, writes nothing
 *   npx tsx scripts/import-aangan-spots.ts                # import
 *   npx tsx scripts/import-aangan-spots.ts --dir <path to Aangan-2.0>
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { createHash } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../src/db';
import * as schema from '../src/schema';
import { uploadToMinIO } from '../src/lib/s3';
import { createSpot } from '../src/routes/adminSpots';
import { parseSpotExtras, SPOT_TYPE, MAX_GALLERY_IMAGES, MAX_HIGHLIGHTS } from '../src/lib/spots';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const dirArg = args.indexOf('--dir');
const DIR = path.resolve(dirArg >= 0 ? args[dirArg + 1] : path.join(__dirname, '../../Aangan-2.0'));

/** Prototype id -> title of the spot we already have for the same place. */
const EXISTING: Record<string, string> = {
  tiger: 'Tiger Hill Sunrise',
  zoo: 'Padmaja Naidu Himalayan Zoological Park',
  pagoda: 'Peace Pagoda',
  ghum: 'Ghum Monastery (Yiga Choeling)',
  batasia: 'Batasia Loop & War Memorial',
  happy: 'Happy Valley Tea Estate',
  'mirik-lake': 'Mirik Lake (Sumendu Lake)',
  simana: 'Simana Border Viewpoint',
};

interface ProtoPlace {
  id: string; cat: string; name: string; place: string; area?: string; geo?: [number, number];
  price?: number; desc: string; facts?: string[]; kindp?: string; img?: string;
  photos?: { img: string }[]; src?: string;
}
interface Credit { by: string; license: string; source: string }

function loadPrototype() {
  const ctx: Record<string, any> = { L: {}, T: () => '', DATA: [] };
  vm.createContext(ctx);
  for (const f of ['data.js', 'places.js', 'media/spots/spotimg.js']) {
    // Top-level `const` stays out of the context object; `var` lands on it.
    const code = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/^const /gm, 'var ');
    vm.runInContext(code, ctx, { filename: f });
  }
  const credits = new Map<string, Credit>();
  const spotCredits = JSON.parse(fs.readFileSync(path.join(DIR, 'media/spots/credits.json'), 'utf8'));
  for (const c of spotCredits) credits.set(c.file, { by: c.by, license: c.license, source: c.source });
  const placeCredits = JSON.parse(fs.readFileSync(path.join(DIR, 'media/places/credits.json'), 'utf8'));
  for (const list of Object.values(placeCredits) as any[]) {
    for (const c of list) credits.set(c.src, { by: c.by, license: c.license, source: c.page });
  }
  const curated = (ctx.DATA as ProtoPlace[]).filter((x) => x.cat === 'spots' && !String(x.id).startsWith('osm'));
  return { curated, osm: ctx.OSMPLACES as ProtoPlace[], spotImg: ctx.SPOTIMG as Record<string, string>, credits };
}

// NFKC turns "Ⅲ" into "III", so numbered peaks (Kora Kang Ⅰ…Ⅳ) stay distinct.
const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/&/g, ' and ').replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// OpenStreetMap sometimes carries an area name in Tibetan or Chinese script; keep Latin ones only.
const latin = (s?: string) => !!s && /^[\u0000-ɏ\s'’().,&-]+$/.test(s);
const km = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 99);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

const uploaded = new Map<string, string>();
async function upload(rel: string): Promise<string | null> {
  if (uploaded.has(rel)) return uploaded.get(rel)!;
  const file = path.join(DIR, rel);
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  const ext = path.extname(rel).toLowerCase();
  const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  // Content-addressed: the same bytes always land on the same key, and a key never changes.
  const key = `spots/${createHash('sha256').update(buf).digest('hex').slice(0, 32)}${ext === '.jpeg' ? '.jpg' : ext}`;
  const url = DRY ? `https://dry-run.invalid/${key}` : await uploadToMinIO(buf, key, type);
  uploaded.set(rel, url);
  return url;
}

/** Splits the prototype's fact chips into highlights and an altitude ("7,462 m high"). */
function factsOf(x: ProtoPlace) {
  let altitude: string | undefined;
  const highlights: string[] = [];
  for (const f of x.facts || []) {
    const m = /^([\d,]+ m) high$/i.exec(f.trim());
    if (m) altitude = m[1];
    else if (f.trim()) highlights.push(clip(f.trim(), 200));
  }
  return { altitude, highlights: highlights.slice(0, MAX_HIGHLIGHTS) };
}

async function main() {
  const { curated, osm, spotImg, credits } = loadPrototype();
  console.log(`[spots] prototype: ${curated.length} hand-written, ${osm.length} OpenStreetMap places (${DIR})`);

  // OpenStreetMap places that repeat a hand-written spot, or each other close by, are dropped.
  const curatedNames = new Set(curated.map((x) => norm(x.name)));
  const kept: ProtoPlace[] = [];
  let dupes = 0;
  for (const o of osm) {
    if (curatedNames.has(norm(o.name))) { dupes++; continue; }
    const twin = kept.find((k) => norm(k.name) === norm(o.name));
    if (twin && twin.geo && o.geo && km(twin.geo, o.geo) < 3) { dupes++; continue; }
    kept.push(o);
  }
  // Same name, far apart (two different villages called the same): tell them apart by area.
  const nameCount = new Map<string, number>();
  for (const o of kept) nameCount.set(norm(o.name), (nameCount.get(norm(o.name)) || 0) + 1);

  const all = [...curated, ...kept];
  const stats = { inserted: 0, published: 0, drafts: 0, skipped: 0, updated: 0, failed: 0 };
  let order = 0;
  const seenTitles = new Set<string>();
  // Every spot already in this database (published or draft), by loose name: a prototype place
  // matching one of them is left alone, whatever its exact spelling there.
  const have = new Set((await db.select({ title: schema.listings.title }).from(schema.listings)
    .where(eq(schema.listings.type, SPOT_TYPE))).map((r) => norm(r.title)));

  for (const x of all) {
    order++;
    const isOsm = String(x.id).startsWith('osm');
    const area = latin(x.area) && x.area !== x.place ? x.area : '';
    const location = [area, x.place].filter(Boolean).join(', ');
    const { altitude, highlights } = factsOf(x);

    if (EXISTING[x.id]) {
      const [row] = await db.select().from(schema.listings)
        .where(and(eq(schema.listings.type, SPOT_TYPE), eq(schema.listings.title, EXISTING[x.id]))).limit(1);
      if (row) {
        const ex = { ...(row.extras || {}) } as Record<string, any>;
        if (!Array.isArray(ex.highlights) || !ex.highlights.length) ex.highlights = highlights;
        if (!Number.isInteger(ex.sort_order) || ex.sort_order === 0) ex.sort_order = order * 10;
        if (!ex.altitude && altitude) ex.altitude = altitude;
        const patch = {
          latitude: row.latitude ?? x.geo?.[0] ?? null,
          longitude: row.longitude ?? x.geo?.[1] ?? null,
          extras: parseSpotExtras(ex, row.extras || {}),
        };
        if (!DRY) await db.update(schema.listings).set(patch).where(eq(schema.listings.id, row.id));
        stats.updated++;
        continue;
      }
    }

    if (have.has(norm(x.name))) { stats.skipped++; continue; }

    const files = [spotImg[x.id], x.img, ...(x.photos || []).map((p) => p.img)]
      .filter((f): f is string => !!f)
      .filter((f, i, a) => a.indexOf(f) === i)
      .slice(0, MAX_GALLERY_IMAGES);
    const images: string[] = [];
    for (const f of files) {
      const url = await upload(f);
      if (url) images.push(url);
    }
    const credit = files.length ? credits.get(files[0]) : undefined;

    let title = x.name.trim();
    if (isOsm && (nameCount.get(norm(x.name)) || 0) > 1 && location) title = `${title}, ${location.split(',')[0]}`;
    // Still taken by an earlier place in this run (same name, same area): add the region too.
    if (seenTitles.has(title.toLowerCase()) && !title.endsWith(x.place)) title = `${title}, ${x.place}`;
    if (seenTitles.has(title.toLowerCase())) console.warn(`[spots] two places would both be titled "${title}" (${x.id}); keeping the first`);
    seenTitles.add(title.toLowerCase());

    const tags = [x.kindp, x.cat === 'nature' ? 'nature' : '', x.place.toLowerCase()].filter(Boolean) as string[];
    const extras: Record<string, any> = {
      images,
      highlights,
      published: images.length > 0,
      featured: false,
      sort_order: (images.length ? 0 : 5000) + order * 10,
    };
    if (altitude) extras.altitude = altitude;
    if (credit) {
      extras.photo_credit = clip(`${credit.by} · ${credit.license} · Wikimedia Commons`, 200);
      if (/^https?:\/\//.test(credit.source)) extras.photo_source = credit.source;
    }

    const body = {
      title,
      description: x.desc,
      location,
      latitude: x.geo?.[0],
      longitude: x.geo?.[1],
      price: x.price || 0,
      image: images[0] || '',
      tags: Array.from(new Set(tags)),
      extras,
    };

    if (DRY) {
      const [dup] = await db.select({ id: schema.listings.id }).from(schema.listings)
        .where(and(eq(schema.listings.type, SPOT_TYPE), eq(schema.listings.title, title))).limit(1);
      if (dup) { stats.skipped++; continue; }
      try { parseSpotExtras(extras); } catch (e: any) { stats.failed++; console.warn(`[spots] ${title}: ${e.message}`); continue; }
    } else {
      const out = await createSpot(body);
      if ('detail' in out) {
        if (out.status === 409) stats.skipped++;
        else { stats.failed++; console.warn(`[spots] ${title}: ${out.detail}`); }
        continue;
      }
    }
    stats.inserted++;
    if (images.length) stats.published++; else stats.drafts++;
  }

  console.log(`[spots] ${DRY ? 'DRY RUN, nothing written. Would insert' : 'Inserted'} ${stats.inserted} `
    + `(${stats.published} published, ${stats.drafts} drafts); `
    + `${stats.updated} existing spots enriched; ${stats.skipped} already there; `
    + `${dupes} OpenStreetMap duplicates dropped; ${stats.failed} failed; ${uploaded.size} photos.`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('[spots] import failed:', err);
    await pool.end();
    process.exit(1);
  });
