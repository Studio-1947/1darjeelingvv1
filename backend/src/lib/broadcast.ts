import { desc, eq, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { db, pool, schema } from '../db';
import { log } from '../config';
import { HOST_TYPES } from './demoData';
import { phoneKey } from './phone';
import { sendPushMessages, tokensFor } from './push';

/**
 * Messages the team sends from the admin panel's Notifications page.
 *
 * One send writes a row to each recipient's Activity list (kind 'announcement', so it is there
 * even with phone notifications off or on the website) and pushes it to every phone they have
 * signed in on. The phone pushes go out after the request returns; the broadcast row records how
 * many went, for the history list.
 */

export const TITLE_MAX = 65;
export const BODY_MAX = 240;

/** Screens a message can open. The app (src/lib/notificationLink.ts) and website map each one. */
export const LINKS = [
  'home', 'explore', 'feed', 'trips', 'saved', 'pass', 'refer', 'profile',
  'host_dashboard', 'host_bookings', 'host_plan',
] as const;

export const AUDIENCES = ['everyone', 'travellers', 'hosts', 'person'] as const;
export type Audience = (typeof AUDIENCES)[number];

export type BroadcastInput = {
  audience: Audience;
  businessType: string | null;
  phone: string | null;
  title: string;
  body: string;
  link: string | null;
};

type Parsed = { ok: true; value: BroadcastInput } | { ok: false; error: string };

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Who it goes to. Checked for both the count and the send. */
export function parseAudience(raw: Record<string, unknown>): { ok: true; value: Pick<BroadcastInput, 'audience' | 'businessType' | 'phone'> } | { ok: false; error: string } {
  const audience = str(raw.audience) as Audience;
  if (!AUDIENCES.includes(audience)) return { ok: false, error: 'Choose who should get it' };
  let businessType: string | null = str(raw.business_type) || null;
  if (audience !== 'hosts') businessType = null;
  if (businessType && !HOST_TYPES.includes(businessType)) return { ok: false, error: 'Unknown business type' };
  let phone: string | null = null;
  if (audience === 'person') {
    phone = str(raw.phone);
    if (!phoneKey(phone)) return { ok: false, error: 'Enter the phone number of the person' };
  }
  return { ok: true, value: { audience, businessType, phone } };
}

/** Title, message and link, as the admin form sends them. */
export function parseBroadcast(raw: Record<string, unknown>): Parsed {
  const who = parseAudience(raw);
  if (!who.ok) return who;
  const title = str(raw.title).replace(/\s+/g, ' ');
  const body = str(raw.body).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  if (!title) return { ok: false, error: 'Write a title' };
  if (title.length > TITLE_MAX) return { ok: false, error: `Keep the title to ${TITLE_MAX} characters` };
  if (!body) return { ok: false, error: 'Write the message' };
  if (body.length > BODY_MAX) return { ok: false, error: `Keep the message to ${BODY_MAX} characters` };
  const link = str(raw.link) || null;
  if (link && !(LINKS as readonly string[]).includes(link)) {
    let url: URL | null = null;
    try { url = new URL(link); } catch { url = null; }
    if (!url || url.protocol !== 'https:') return { ok: false, error: 'The link must be one of the screens or an https:// address' };
  }
  return { ok: true, value: { ...who.value, title, body, link } };
}

/** The user ids a message goes to. Admin accounts never get one. */
export async function resolveAudience(who: Pick<BroadcastInput, 'audience' | 'businessType' | 'phone'>): Promise<string[]> {
  if (who.audience === 'person') {
    const key = phoneKey(who.phone);
    if (!key) return [];
    // Numbers are stored as typed, so compare on the canonical form (lib/phone.ts).
    const tail = key.slice(-8);
    const { rows } = await pool.query<{ id: string; phone: string }>(
      `SELECT id, phone FROM users WHERE role <> 'admin' AND regexp_replace(phone, '\\D', '', 'g') LIKE $1`,
      [`%${tail}`]
    );
    return rows.filter((r) => phoneKey(r.phone) === key).map((r) => r.id);
  }

  const hostSql = `(
      EXISTS (SELECT 1 FROM providers p WHERE p.user_id = u.id AND ($1::text IS NULL OR p.business_type = $1))
      OR EXISTS (SELECT 1 FROM provider_members m JOIN providers p ON p.id = m.provider_id
                 WHERE m.user_id = u.id AND ($1::text IS NULL OR p.business_type = $1))
      OR ($1::text IS NULL AND u.role = 'provider')
    )`;
  const where =
    who.audience === 'everyone' ? 'TRUE'
      : who.audience === 'hosts' ? hostSql
        : `NOT ${hostSql}`; // travellers: everyone who does not run a business
  const { rows } = await pool.query<{ id: string }>(
    `SELECT u.id FROM users u WHERE u.role <> 'admin' AND ${where}`,
    who.audience === 'everyone' ? [] : [who.audience === 'hosts' ? who.businessType : null]
  );
  return rows.map((r) => r.id);
}

/** How many people, and how many of their phones can get a push. */
export async function countAudience(who: Pick<BroadcastInput, 'audience' | 'businessType' | 'phone'>) {
  const ids = await resolveAudience(who);
  const tokens = await tokensFor(ids);
  return { people: ids.length, devices: tokens.length, with_app: new Set(tokens.map((t) => t.userId)).size };
}

export type BroadcastRow = typeof schema.broadcasts.$inferSelect;

/**
 * Writes the Activity rows now and returns the broadcast; the phone pushes follow in the
 * background (`pushes` resolves when they are done, for tests and the dev log).
 */
export async function sendBroadcast(input: BroadcastInput, adminId: string): Promise<{ broadcast: BroadcastRow | null; pushes: Promise<void> }> {
  const ids = await resolveAudience(input);
  // Nobody to send to: nothing is recorded, and the admin is told so.
  if (!ids.length) return { broadcast: null, pushes: Promise.resolve() };
  const id = uuidv4();
  const now = new Date().toISOString();
  const [broadcast] = await db.insert(schema.broadcasts).values({
    id,
    title: input.title,
    body: input.body,
    link: input.link,
    audience: input.audience,
    businessType: input.businessType,
    phone: input.phone,
    recipients: ids.length,
    status: 'sending',
    sentBy: adminId,
    createdAt: now,
    finishedAt: null,
  }).returning();

  // One Activity row per person, so a tap can mark their own copy read.
  const noteIds = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = ids.slice(i, i + 500).map((userId) => {
      const noteId = uuidv4();
      noteIds.set(userId, noteId);
      return {
        id: noteId, userId, kind: 'announcement', title: input.title, body: input.body,
        refId: id, link: input.link, msg: null, readAt: null, createdAt: now,
      };
    });
    await db.insert(schema.notifications).values(rows);
  }
  log.warn(`[broadcast] admin=${adminId} sent "${input.title.slice(0, 40)}" to ${ids.length} ${input.audience}${input.businessType ? `/${input.businessType}` : ''}`);

  const pushes = (async () => {
    try {
      const tokens = await tokensFor(ids);
      const res = await sendPushMessages(
        tokens.map((t) => ({
          to: t.token,
          content: {
            title: input.title,
            body: input.body,
            data: { kind: 'announcement', refId: id, link: input.link, notificationId: noteIds.get(t.userId) },
          },
        })),
        `broadcast ${id}`
      );
      await db.update(schema.broadcasts)
        .set({ devices: res.devices, pushed: res.ok, pushFailed: res.failed, status: 'sent', finishedAt: new Date().toISOString() })
        .where(eq(schema.broadcasts.id, id));
    } catch (err) {
      log.error(`[broadcast] ${id} push step failed: ${(err as Error)?.message || err}`);
      await db.update(schema.broadcasts).set({ status: 'sent', finishedAt: new Date().toISOString() })
        .where(eq(schema.broadcasts.id, id)).catch(() => {});
    }
  })();

  return { broadcast, pushes };
}

/** The history list, newest first, with how many have opened it. */
export async function listBroadcasts(limit = 50) {
  const rows = await db.select({
    b: schema.broadcasts,
    sentByName: schema.users.name,
    opened: sql<number>`(SELECT count(*)::int FROM notifications n WHERE n.ref_id = ${schema.broadcasts.id} AND n.kind = 'announcement' AND n.read_at IS NOT NULL)`,
  })
    .from(schema.broadcasts)
    .leftJoin(schema.users, eq(schema.users.id, schema.broadcasts.sentBy))
    .orderBy(desc(schema.broadcasts.createdAt))
    .limit(limit);
  return rows.map(({ b, sentByName, opened }) => shapeBroadcast(b, { sentByName, opened }));
}

export function shapeBroadcast(b: BroadcastRow, extra: { sentByName?: string | null; opened?: number } = {}) {
  return {
    id: b.id,
    title: b.title,
    body: b.body,
    link: b.link,
    audience: b.audience,
    business_type: b.businessType,
    phone: b.phone,
    recipients: b.recipients,
    devices: b.devices,
    pushed: b.pushed,
    push_failed: b.pushFailed,
    opened: extra.opened ?? 0,
    status: b.status,
    sent_by: extra.sentByName ?? (b.sentBy ? 'Admin' : null),
    created_at: b.createdAt,
    finished_at: b.finishedAt,
  };
}
