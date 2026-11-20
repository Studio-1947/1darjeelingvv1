import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { desc, eq, sql } from 'drizzle-orm';

import { db, schema } from '../db';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { routeParam } from '../lib/routeParam';
import { tidyText } from '../lib/contentRules';
import {
  AUDIENCES, MAX_REWARD_DAYS, campaignKey, campaignState, checkCustomCode, codeTaken, countRows,
  randomCampaignCode, signupRows, toAdminCampaign, type Audience,
} from '../lib/referralCampaigns';

/**
 * Admin → Referrals: referral codes the aangan team makes ("amitAangan26" for Amit, one per poster
 * or partner) and the full report of who signed up with each, travellers and hosts, hosts by
 * business type and how many went live. Sign-up records the codes (routes/auth.ts, lib/referralCampaigns.ts).
 */
const router = Router();
const admin = [authenticateToken, requireAdmin];

/** Reads the optional limits and reward from a create or edit body. Unset keys are left out. */
function readSettings(body: any): { value: Partial<typeof schema.referralCampaigns.$inferInsert> } | { error: string } {
  const out: Partial<typeof schema.referralCampaigns.$inferInsert> = {};
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? tidyText(body.name) : '';
    if (name.length < 2 || name.length > 80) return { error: 'Write who or what the code is for, 2 to 80 characters' };
    out.name = name;
  }
  if (body.audience !== undefined) {
    if (!AUDIENCES.includes(body.audience)) return { error: 'Choose who the code is for' };
    out.audience = body.audience as Audience;
  }
  if (body.reward_days !== undefined) {
    const n = Number(body.reward_days);
    if (!Number.isInteger(n) || n < 0 || n > MAX_REWARD_DAYS) return { error: `Reward days must be a whole number from 0 to ${MAX_REWARD_DAYS}` };
    out.rewardDays = n;
  }
  if (body.max_uses !== undefined) {
    if (body.max_uses === null || body.max_uses === '') out.maxUses = null;
    else {
      const n = Number(body.max_uses);
      if (!Number.isInteger(n) || n < 1) return { error: 'The use limit must be a whole number, 1 or more' };
      out.maxUses = n;
    }
  }
  if (body.ends_at !== undefined) {
    if (body.ends_at === null || body.ends_at === '') out.endsAt = null;
    else {
      const t = Date.parse(body.ends_at);
      if (Number.isNaN(t)) return { error: 'The end date is not a date' };
      out.endsAt = new Date(t).toISOString();
    }
  }
  if (body.active !== undefined) out.active = body.active === true;
  return { value: out };
}

/**
 * GET /api/admin/referrals — every code with its counts, the totals, and the friend-referral
 * summary (members' own codes, lib/referrals.ts).
 */
router.get('/admin/referrals', ...admin, async (_req: Request, res: Response) => {
  const campaigns = await db.select().from(schema.referralCampaigns).orderBy(desc(schema.referralCampaigns.createdAt));
  const rows = await signupRows();
  const byCampaign = new Map<string, typeof rows>();
  for (const r of rows) byCampaign.set(r.campaignId, [...(byCampaign.get(r.campaignId) || []), r]);

  const items = campaigns.map((c) => {
    const counts = countRows(byCampaign.get(c.id) || []);
    return { ...toAdminCampaign(c, counts), state: campaignState(c, counts.uses) };
  });

  // Friend referrals: how many accounts members brought with their own codes, and who brought most.
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.referrals);
  const top = await db.select({
    id: schema.users.id, name: schema.users.name, phone: schema.users.phone, code: schema.users.referralCode,
    count: sql<number>`count(*)::int`,
  })
    .from(schema.referrals)
    .innerJoin(schema.users, eq(schema.users.id, schema.referrals.referrerId))
    .groupBy(schema.users.id, schema.users.name, schema.users.phone, schema.users.referralCode)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  res.json({
    items,
    totals: { codes: campaigns.length, active: items.filter((i) => i.state === 'active').length, ...countRows(rows) },
    friends: { total, top },
  });
});

/** GET /api/admin/referrals/:id — one code and everyone who signed up with it, newest first. */
router.get('/admin/referrals/:id', ...admin, async (req: Request, res: Response) => {
  const [c] = await db.select().from(schema.referralCampaigns).where(eq(schema.referralCampaigns.id, routeParam(req, 'id'))).limit(1);
  if (!c) return res.status(404).json({ detail: 'No such code' });
  const rows = (await signupRows(c.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const counts = countRows(rows);
  res.json({
    item: { ...toAdminCampaign(c, counts), state: campaignState(c, counts.uses) },
    signups: rows.map((r) => ({
      user: { id: r.userId, name: r.name, phone: r.phone },
      joined_as: r.joinedAs,
      type: r.businessType ? 'host' : 'traveller',
      business_name: r.businessName,
      business_type: r.businessType,
      live: r.live,
      created_at: r.createdAt,
    })),
  });
});

/**
 * POST /api/admin/referrals { code?, name, audience?, reward_days?, ends_at?, max_uses? }
 * An empty code gets one made up (AANGAN-XXXXX). A code is matched without case or dashes, and
 * may not repeat another code or a member's own.
 */
router.post('/admin/referrals', ...admin, async (req: Request, res: Response) => {
  const body = req.body ?? {};
  if (body.name === undefined) return res.status(400).json({ detail: 'Write who or what the code is for, 2 to 80 characters' });
  const settings = readSettings(body);
  if ('error' in settings) return res.status(400).json({ detail: settings.error });

  let code: string;
  let key: string;
  if (typeof body.code === 'string' && body.code.trim()) {
    const checked = checkCustomCode(body.code);
    if ('error' in checked) return res.status(400).json({ detail: checked.error });
    ({ code, key } = checked);
    if (await codeTaken(key)) return res.status(409).json({ detail: `${code} is already in use. Choose another code.` });
  } else {
    do { code = randomCampaignCode(); key = campaignKey(code); } while (await codeTaken(key));
  }

  const row = {
    id: uuidv4(), code, codeKey: key, name: settings.value.name!, audience: settings.value.audience ?? 'any',
    rewardDays: settings.value.rewardDays ?? 0, endsAt: settings.value.endsAt ?? null, maxUses: settings.value.maxUses ?? null,
    active: true, createdBy: req.user!.id, createdAt: new Date().toISOString(),
  };
  try {
    await db.insert(schema.referralCampaigns).values(row);
  } catch {
    // Two admins making the same code at once: the unique code_key decides.
    return res.status(409).json({ detail: `${code} is already in use. Choose another code.` });
  }
  const counts = countRows([]);
  res.status(201).json({ item: { ...toAdminCampaign(row, counts), state: campaignState(row, 0) } });
});

/** PATCH /api/admin/referrals/:id { active?, name?, audience?, reward_days?, ends_at?, max_uses? } — the code itself never changes. */
router.patch('/admin/referrals/:id', ...admin, async (req: Request, res: Response) => {
  const id = routeParam(req, 'id');
  const [c] = await db.select().from(schema.referralCampaigns).where(eq(schema.referralCampaigns.id, id)).limit(1);
  if (!c) return res.status(404).json({ detail: 'No such code' });
  if ((req.body ?? {}).code !== undefined) return res.status(400).json({ detail: 'A code cannot be renamed: people already have it. Make a new one.' });
  const settings = readSettings(req.body ?? {});
  if ('error' in settings) return res.status(400).json({ detail: settings.error });
  if (Object.keys(settings.value).length) {
    await db.update(schema.referralCampaigns).set(settings.value).where(eq(schema.referralCampaigns.id, id));
  }
  const [fresh] = await db.select().from(schema.referralCampaigns).where(eq(schema.referralCampaigns.id, id)).limit(1);
  const counts = countRows(await signupRows(id));
  res.json({ item: { ...toAdminCampaign(fresh, counts), state: campaignState(fresh, counts.uses) } });
});

export default router;
