import { and, eq, inArray, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { phoneKey } from './phone';

/**
 * Which business a signed-in person runs, and whether they are its main owner or a co-owner.
 *
 * Every "my business" lookup goes through here, so a co-owner (schema.providerMembers) sees and
 * manages the same business as the owner. Owners come first: someone who owns a business of their
 * own is never switched to one they co-own.
 */

export type Provider = typeof schema.providers.$inferSelect;
export type HostAccess = { provider: Provider; access: 'owner' | 'co_owner' };

/** A business may have this many co-owners besides its main owner. */
export const MAX_CO_OWNERS = 5;

const preferActive = (rows: Provider[]) => rows.find((p) => p.status === 'active') || rows[0] || null;

export async function hostAccessFor(userId: string): Promise<HostAccess | null> {
  const own = preferActive(await db.select().from(schema.providers).where(eq(schema.providers.userId, userId)));
  if (own) return { provider: own, access: 'owner' };

  const memberships = await db.select({ providerId: schema.providerMembers.providerId })
    .from(schema.providerMembers).where(eq(schema.providerMembers.userId, userId));
  if (!memberships.length) return null;
  const shared = preferActive(await db.select().from(schema.providers)
    .where(inArray(schema.providers.id, memberships.map((m) => m.providerId))));
  return shared ? { provider: shared, access: 'co_owner' } : null;
}

/** The business this person runs, as owner or co-owner. */
export async function myProvider(userId: string): Promise<Provider | null> {
  return (await hostAccessFor(userId))?.provider ?? null;
}

/** The business this person runs, only while it is active. */
export async function myActiveProvider(userId: string): Promise<Provider | null> {
  const p = await myProvider(userId);
  return p && p.status === 'active' ? p : null;
}

/**
 * The ids a listing of this person's business may carry in `listings.provider_id`: the provider
 * row's id, or (on admin-authored and older listings) the main owner's user id. The caller's own
 * id is included too, as it always was.
 */
export async function ownListingIds(userId: string): Promise<string[]> {
  const p = await myProvider(userId);
  return [...new Set([userId, ...(p ? [p.id, p.userId] : [])])];
}

/** Everyone who runs this business: the main owner, then co-owners who have signed in. */
export async function hostUserIds(providerId: string): Promise<string[]> {
  const [p] = await db.select({ userId: schema.providers.userId }).from(schema.providers)
    .where(eq(schema.providers.id, providerId)).limit(1);
  if (!p) return [];
  const members = await db.select({ userId: schema.providerMembers.userId }).from(schema.providerMembers)
    .where(eq(schema.providerMembers.providerId, providerId));
  return [...new Set([p.userId, ...members.map((m) => m.userId).filter((x): x is string => !!x)])];
}

/**
 * Called after someone signs in: links any co-owner invites for their number to their account and
 * makes sure the account can open the business side. Never throws; a failure here must not cost
 * anyone their sign-in.
 */
export async function claimCoOwnerInvites(user: { id: string; phone: string; role: string }): Promise<boolean> {
  try {
    const key = phoneKey(user.phone);
    if (!key) return false;
    const linked = await db.update(schema.providerMembers).set({ userId: user.id })
      .where(and(eq(schema.providerMembers.phoneKey, key), isNull(schema.providerMembers.userId)))
      .returning({ id: schema.providerMembers.id });
    const any = linked.length > 0 || (await db.select({ id: schema.providerMembers.id }).from(schema.providerMembers)
      .where(eq(schema.providerMembers.userId, user.id)).limit(1)).length > 0;
    if (any && user.role === 'tourist') {
      await db.update(schema.users).set({ role: 'provider' }).where(eq(schema.users.id, user.id));
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** After a co-owner is removed: back to a traveller account unless they still run a business. */
export async function dropHostRoleIfUnused(userId: string): Promise<void> {
  const [u] = await db.select({ role: schema.users.role }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!u || u.role !== 'provider') return;
  if (await hostAccessFor(userId)) return;
  await db.update(schema.users).set({ role: 'tourist' }).where(eq(schema.users.id, userId));
}

export type CoOwnerOut = { id: string; name: string | null; phone: string; joined: boolean; role: 'owner' | 'co_owner'; you: boolean; created_at: string };

/** Owners of a business for the owners screen: main owner first. Phones are shown in full only to the business. */
export async function ownersOf(provider: Provider, viewerId?: string): Promise<CoOwnerOut[]> {
  const [main] = await db.select().from(schema.users).where(eq(schema.users.id, provider.userId)).limit(1);
  const members = await db.select().from(schema.providerMembers)
    .where(eq(schema.providerMembers.providerId, provider.id));
  const memberUsers = members.length
    ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users)
      .where(inArray(schema.users.id, members.map((m) => m.userId).filter((x): x is string => !!x)))
    : [];
  const nameOf = new Map(memberUsers.map((u) => [u.id, u.name]));
  return [
    ...(main ? [{ id: main.id, name: main.name, phone: main.phone, joined: true, role: 'owner' as const, you: main.id === viewerId, created_at: provider.createdAt }] : []),
    ...members
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((m) => ({
        id: m.id,
        name: (m.userId && nameOf.get(m.userId)) || m.name,
        phone: m.phoneKey,
        joined: !!m.userId,
        role: 'co_owner' as const,
        you: !!m.userId && m.userId === viewerId,
        created_at: m.createdAt,
      })),
  ];
}

export const newMemberId = (): string => uuidv4();
