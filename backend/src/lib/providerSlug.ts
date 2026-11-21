import { and, eq, ne } from 'drizzle-orm';
import { db, schema } from '../db';

/**
 * A host's public page lives at aanganerp.in/<business_type>/<slug> (board: "all profiles should
 * look like individual websites", e.g. aanganerp.in/driver/businessname). The slug comes from the
 * business name; a second "Mist & Pine" gets "mist-pine-2". The website's miniSiteSlug() and the
 * migration that filled in existing hosts use the same rule.
 */
export function slugify(name: string): string {
  const s = (name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 _-]/g, '')
    .trim()
    .replace(/[ _-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'host';
}

/** Page types that have a public page; the same words as `business_type`. */
export const PAGE_TYPES = ['driver', 'homestay', 'cafe', 'shop', 'guide'] as const;

/** Gives a provider a unique slug from its name (kept if the name gives the same one). */
export async function assignSlug(providerId: string, businessName: string): Promise<string> {
  const base = slugify(businessName);
  for (let n = 1; n < 500; n++) {
    const candidate = n === 1 ? base : `${base.slice(0, 55)}-${n}`;
    const [taken] = await db.select({ id: schema.providers.id }).from(schema.providers)
      .where(and(eq(schema.providers.slug, candidate), ne(schema.providers.id, providerId))).limit(1);
    if (!taken) {
      await db.update(schema.providers).set({ slug: candidate }).where(eq(schema.providers.id, providerId));
      return candidate;
    }
  }
  const fallback = `${base.slice(0, 40)}-${providerId.slice(0, 8)}`;
  await db.update(schema.providers).set({ slug: fallback }).where(eq(schema.providers.id, providerId));
  return fallback;
}

/** The public address of a host page, as people read it. */
export const pagePath = (businessType: string, slug: string | null | undefined) =>
  slug ? `/${businessType}/${slug}` : null;
