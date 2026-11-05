import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';

import { db, schema } from '../db';
import { authenticateToken, optionalUser, requireAdmin } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { isHostApprovalPending, isHostPlanLive } from '../lib/hostPlan';
import { routeParam } from '../lib/routeParam';
import { myProvider as hostProvider } from '../lib/hostAccess';

const router = Router();

// ============ HOST FEED ============
// Hosts write short posts about their place; everyone can read them. Only a host whose plan is
// live and who is verified may post, and the same rule decides whose posts are shown, so a host
// whose plan lapses or who is suspended drops out of the feed with their listings.

export const MAX_POST_LEN = 1000;
export const MAX_POST_PHOTOS = 4;
const MAX_PHOTO_URL_LEN = 2000;
/** Generous for a real host, a ceiling for a compromised account. */
const MAX_POSTS_PER_DAY = 10;
const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;

type Provider = typeof schema.providers.$inferSelect;
type Post = typeof schema.hostPosts.$inferSelect;

function hostCanPost(p: Provider): boolean {
  return isHostPlanLive(p) && !isHostApprovalPending(p);
}

/** Visible in the public feed: not hidden by an admin, and the host is live and approved. */
function publicPostCondition(now = new Date()) {
  return and(
    isNull(schema.hostPosts.hiddenAt),
    eq(schema.providers.status, 'active'),
    sql`${schema.providers.planExpiresAt} IS NOT NULL AND ${schema.providers.planExpiresAt} > ${now.toISOString()}`,
    sql`NOT (${schema.providers.approvalRequired} AND ${schema.providers.kycStatus} <> 'verified')`
  );
}

function parsePhotos(value: unknown): { photos: string[] } | { error: string } {
  if (value === undefined || value === null) return { photos: [] };
  if (!Array.isArray(value)) return { error: 'photos must be an array' };
  if (value.length > MAX_POST_PHOTOS) return { error: `A post can have at most ${MAX_POST_PHOTOS} photos` };
  const photos: string[] = [];
  for (const url of value) {
    if (typeof url !== 'string' || !url.trim()) return { error: 'each photo must be a URL' };
    if (url.length > MAX_PHOTO_URL_LEN) return { error: 'photo URL is too long' };
    if (!/^https?:\/\//i.test(url)) return { error: 'each photo must be an http(s) URL' };
    photos.push(url.trim());
  }
  return { photos };
}

function parseBody(value: unknown): { body: string } | { error: string } {
  if (typeof value !== 'string' || !value.trim()) return { error: 'Write something to post' };
  const body = value.trim();
  if (body.length > MAX_POST_LEN) return { error: `A post can be at most ${MAX_POST_LEN} characters` };
  return { body };
}

// Owner or co-owner: either can post for the business.
const myProvider = (userId: string): Promise<Provider | null> => hostProvider(userId);

/** A listing the post may point at: one of the host's own. */
async function ownListing(listingId: unknown, provider: Provider): Promise<{ id: string | null } | { error: string }> {
  if (listingId === undefined || listingId === null || listingId === '') return { id: null };
  if (typeof listingId !== 'string') return { error: 'listing_id must be a string' };
  const [l] = await db
    .select({ id: schema.listings.id })
    .from(schema.listings)
    .where(and(eq(schema.listings.id, listingId), inArray(schema.listings.providerId, [provider.id, provider.userId])))
    .limit(1);
  return l ? { id: l.id } : { error: 'You can only link a post to one of your own listings' };
}

type Row = {
  post: Post;
  provider: Pick<Provider, 'id' | 'businessName' | 'businessType' | 'location' | 'images' | 'kycStatus'>;
  listing: { id: string; title: string; type: string; image: string } | null;
};

function postOut(r: Row, opts: { includeModeration?: boolean } = {}) {
  return {
    id: r.post.id,
    body: r.post.body,
    photos: r.post.photos || [],
    created_at: r.post.createdAt,
    updated_at: r.post.updatedAt,
    author_user_id: r.post.userId,
    host: {
      provider_id: r.provider.id,
      name: r.provider.businessName,
      type: r.provider.businessType,
      location: r.provider.location,
      image: r.provider.images?.[0] ?? null,
      verified: r.provider.kycStatus === 'verified',
    },
    listing: r.listing?.id ? r.listing : null,
    ...(opts.includeModeration ? { hidden: Boolean(r.post.hiddenAt), hidden_reason: r.post.hiddenReason } : {}),
  };
}

// ============ LIKES AND COMMENTS ============

export const MAX_COMMENT_LEN = 500;
const COMMENTS_PAGE = 100;

/** The reactions a reader can leave on a host post (board: feed reactions). One per person. */
export const POST_REACTIONS = ['heart', 'wow', 'clap', 'yum'] as const;
type ReactionKind = (typeof POST_REACTIONS)[number];

/**
 * `like_count` and `liked_by_me` count every reaction, so an app that only knows the heart keeps
 * showing the same totals. `reactions` and `my_reaction` are the breakdown newer clients show.
 */
type Engagement = {
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  reactions: Record<ReactionKind, number>;
  my_reaction: ReactionKind | null;
};

const noReactions = (): Record<ReactionKind, number> => ({ heart: 0, wow: 0, clap: 0, yum: 0 });

/** Reaction and comment counts for a page of posts, and how the viewer reacted. */
async function engagementFor(postIds: string[], viewerId: string | null): Promise<Map<string, Engagement>> {
  const out = new Map<string, Engagement>(postIds.map((id) => [id, {
    like_count: 0, comment_count: 0, liked_by_me: false, reactions: noReactions(), my_reaction: null,
  }]));
  if (!postIds.length) return out;
  const [counts, comments, mine] = await Promise.all([
    db.select({ postId: schema.postReactions.postId, kind: schema.postReactions.kind, n: sql<number>`count(*)::int` })
      .from(schema.postReactions).where(inArray(schema.postReactions.postId, postIds))
      .groupBy(schema.postReactions.postId, schema.postReactions.kind),
    db.select({ postId: schema.postComments.postId, n: sql<number>`count(*)::int` })
      .from(schema.postComments).where(inArray(schema.postComments.postId, postIds)).groupBy(schema.postComments.postId),
    viewerId
      ? db.select({ postId: schema.postReactions.postId, kind: schema.postReactions.kind }).from(schema.postReactions)
        .where(and(inArray(schema.postReactions.postId, postIds), eq(schema.postReactions.userId, viewerId)))
      : Promise.resolve([] as { postId: string; kind: string }[]),
  ]);
  counts.forEach((c) => {
    const e = out.get(c.postId)!;
    const kind = (POST_REACTIONS as readonly string[]).includes(c.kind) ? (c.kind as ReactionKind) : 'heart';
    e.reactions[kind] += Number(c.n);
    e.like_count += Number(c.n);
  });
  comments.forEach((c) => { out.get(c.postId)!.comment_count = Number(c.n); });
  mine.forEach((m) => {
    const e = out.get(m.postId)!;
    e.liked_by_me = true;
    e.my_reaction = (POST_REACTIONS as readonly string[]).includes(m.kind) ? (m.kind as ReactionKind) : 'heart';
  });
  return out;
}

/** postOut for a list, with likes and comments filled in. */
async function postsOut(rows: Row[], viewerId: string | null, opts: { includeModeration?: boolean } = {}) {
  const eng = await engagementFor(rows.map((r) => r.post.id), viewerId);
  return rows.map((r) => ({ ...postOut(r, opts), ...eng.get(r.post.id)! }));
}

/** A post anyone may see, or null. */
async function publicPost(id: string): Promise<Row | null> {
  const [row] = (await selectRows()
    .where(and(eq(schema.hostPosts.id, id), publicPostCondition()))
    .limit(1)) as Row[];
  return row ?? null;
}

function selectRows() {
  return db
    .select({
      post: schema.hostPosts,
      provider: {
        id: schema.providers.id,
        businessName: schema.providers.businessName,
        businessType: schema.providers.businessType,
        location: schema.providers.location,
        images: schema.providers.images,
        kycStatus: schema.providers.kycStatus,
      },
      listing: {
        id: schema.listings.id,
        title: schema.listings.title,
        type: schema.listings.type,
        image: schema.listings.image,
      },
    })
    .from(schema.hostPosts)
    .innerJoin(schema.providers, eq(schema.providers.id, schema.hostPosts.providerId))
    .leftJoin(schema.listings, eq(schema.listings.id, schema.hostPosts.listingId));
}

/**
 * @openapi
 * /posts:
 *   get:
 *     summary: The host feed, newest first
 *     description: Public. Signed-in readers do not see posts by people they blocked.
 *     tags: [Feed]
 *     parameters:
 *       - { in: query, name: before, schema: { type: string }, description: "next_before from the previous page" }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 50 } }
 *       - { in: query, name: provider_id, schema: { type: string }, description: "Only this host's posts" }
 *   post:
 *     summary: Write a post (live, verified hosts only)
 *     tags: [Feed]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body: { type: string, maxLength: 1000 }
 *               photos: { type: array, items: { type: string }, maxItems: 4, description: "URLs from POST /listings/upload" }
 *               listing_id: { type: string, description: "One of the host's own listings" }
 */
router.get('/', async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? PAGE_DEFAULT), 10) || PAGE_DEFAULT, 1), PAGE_MAX);
  const before = typeof req.query.before === 'string' && req.query.before ? req.query.before : null;
  const providerId = typeof req.query.provider_id === 'string' && req.query.provider_id ? req.query.provider_id : null;

  const conditions = [publicPostCondition()];
  if (before) conditions.push(lt(schema.hostPosts.createdAt, before));
  if (providerId) conditions.push(eq(schema.hostPosts.providerId, providerId));

  const viewer = await optionalUser(req);
  if (viewer) {
    const blocked = await db
      .select({ id: schema.userBlocks.blockedId })
      .from(schema.userBlocks)
      .where(eq(schema.userBlocks.blockerId, viewer.id));
    if (blocked.length) {
      conditions.push(sql`${schema.hostPosts.userId} NOT IN (${sql.join(blocked.map((b) => sql`${b.id}`), sql`, `)})`);
    }
  }

  const rows = (await selectRows()
    .where(and(...conditions))
    .orderBy(desc(schema.hostPosts.createdAt))
    .limit(limit + 1)) as Row[];

  const page = rows.slice(0, limit);
  res.json({
    posts: await postsOut(page, viewer?.id ?? null),
    next_before: rows.length > limit ? page[page.length - 1].post.createdAt : null,
  });
});

/**
 * @openapi
 * /posts/me:
 *   get:
 *     summary: The signed-in host's own posts, including hidden ones, and whether they can post
 *     tags: [Feed]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  const provider = await myProvider(req.user!.id);
  if (!provider) return res.json({ can_post: false, reason: 'not_a_host', posts: [] });
  const rows = (await selectRows()
    .where(eq(schema.hostPosts.providerId, provider.id))
    .orderBy(desc(schema.hostPosts.createdAt))
    .limit(100)) as Row[];
  const reason = hostCanPost(provider) ? null : isHostApprovalPending(provider) ? 'not_verified' : 'plan_not_live';
  res.json({ can_post: reason === null, reason, posts: await postsOut(rows, req.user!.id, { includeModeration: true }) });
});

/**
 * @openapi
 * /posts/admin/list:
 *   get:
 *     summary: Every post, hidden ones included, newest first (admin)
 *     tags: [Feed]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: hidden, schema: { type: string, enum: ['1'] }, description: "Only hidden posts" }
 */
router.get('/admin/list', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const onlyHidden = req.query.hidden === '1';
  const rows = (await selectRows()
    .where(onlyHidden ? sql`${schema.hostPosts.hiddenAt} IS NOT NULL` : undefined)
    .orderBy(desc(schema.hostPosts.createdAt))
    .limit(200)) as Row[];
  res.json({ posts: await postsOut(rows, null, { includeModeration: true }) });
});

/**
 * @openapi
 * /posts/admin/comments:
 *   get:
 *     summary: The newest comments on host posts, with the post they are on (admin)
 *     tags: [Feed]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/admin/comments', authenticateToken, requireAdmin, async (_req: Request, res: Response) => {
  const rows = await db
    .select({ c: schema.postComments, name: schema.users.name, phone: schema.users.phone, postBody: schema.hostPosts.body, business: schema.providers.businessName })
    .from(schema.postComments)
    .innerJoin(schema.users, eq(schema.users.id, schema.postComments.userId))
    .innerJoin(schema.hostPosts, eq(schema.hostPosts.id, schema.postComments.postId))
    .innerJoin(schema.providers, eq(schema.providers.id, schema.hostPosts.providerId))
    .orderBy(desc(schema.postComments.createdAt))
    .limit(200);
  res.json({
    comments: rows.map(({ c, name, phone, postBody, business }) => ({
      id: c.id,
      post_id: c.postId,
      body: c.body,
      created_at: c.createdAt,
      user: { id: c.userId, name, phone },
      post: { business, excerpt: postBody.slice(0, 120) },
    })),
  });
});

router.post('/', authenticateToken, rateLimiter(20, 60 * 60 * 1000, 'post_create'), async (req: Request, res: Response) => {
  const provider = await myProvider(req.user!.id);
  if (!provider) return res.status(403).json({ detail: 'Only hosts can post to the feed', code: 'not_a_host' });
  if (!hostCanPost(provider)) {
    return res.status(403).json({
      detail: isHostApprovalPending(provider)
        ? 'You can post once our team has verified your documents'
        : 'Your host plan is not active. Renew it to post',
      code: isHostApprovalPending(provider) ? 'not_verified' : 'plan_not_live',
    });
  }

  const body = parseBody(req.body?.body);
  if ('error' in body) return res.status(400).json({ detail: body.error });
  const photos = parsePhotos(req.body?.photos);
  if ('error' in photos) return res.status(400).json({ detail: photos.error });
  const listing = await ownListing(req.body?.listing_id, provider);
  if ('error' in listing) return res.status(400).json({ detail: listing.error });

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.hostPosts)
    .where(and(eq(schema.hostPosts.providerId, provider.id), gte(schema.hostPosts.createdAt, dayAgo)));
  if (count >= MAX_POSTS_PER_DAY) {
    return res.status(429).json({ detail: `You can post up to ${MAX_POSTS_PER_DAY} times a day` });
  }

  const id = uuidv4();
  await db.insert(schema.hostPosts).values({
    id,
    providerId: provider.id,
    userId: req.user!.id,
    body: body.body,
    photos: photos.photos,
    listingId: listing.id,
    createdAt: new Date().toISOString(),
  });
  const [row] = (await selectRows().where(eq(schema.hostPosts.id, id)).limit(1)) as Row[];
  res.status(201).json({ post: postOut(row, { includeModeration: true }) });
});

/**
 * @openapi
 * /posts/{id}:
 *   get:
 *     summary: One post, if it is public
 *     tags: [Feed]
 *   patch:
 *     summary: Edit your own post
 *     tags: [Feed]
 *     security: [{ bearerAuth: [] }]
 *   delete:
 *     summary: Delete your own post (or any post, as an admin)
 *     tags: [Feed]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id', async (req: Request, res: Response) => {
  const row = await publicPost(routeParam(req, 'id'));
  if (!row) return res.status(404).json({ detail: 'Post not found' });
  const viewer = await optionalUser(req);
  const [post] = await postsOut([row], viewer?.id ?? null);
  res.json({ post });
});

/**
 * @openapi
 * /posts/{id}/like:
 *   post:
 *     summary: React to a post (one reaction per person; body { kind } is heart, wow, clap or yum, default heart; reacting again changes it)
 *     tags: [Feed]
 *     security: [{ bearerAuth: [] }]
 *   delete:
 *     summary: Take your like back
 *     tags: [Feed]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/like', authenticateToken, rateLimiter(120, 60 * 60 * 1000, 'post_like'), async (req: Request, res: Response) => {
  const row = await publicPost(routeParam(req, 'id'));
  if (!row) return res.status(404).json({ detail: 'Post not found' });
  const kind = req.body?.kind ?? 'heart';
  if (!(POST_REACTIONS as readonly string[]).includes(kind)) {
    return res.status(400).json({ detail: `Reaction must be one of: ${POST_REACTIONS.join(', ')}` });
  }
  await db.insert(schema.postReactions)
    .values({ postId: row.post.id, userId: req.user!.id, kind, createdAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: [schema.postReactions.postId, schema.postReactions.userId], set: { kind } });
  res.json((await engagementFor([row.post.id], req.user!.id)).get(row.post.id));
});

router.delete('/:id/like', authenticateToken, async (req: Request, res: Response) => {
  const id = routeParam(req, 'id');
  await db.delete(schema.postReactions)
    .where(and(eq(schema.postReactions.postId, id), eq(schema.postReactions.userId, req.user!.id)));
  res.json((await engagementFor([id], req.user!.id)).get(id));
});

/**
 * @openapi
 * /posts/{id}/comments:
 *   get:
 *     summary: A post's comments, oldest first
 *     description: Public. Signed-in readers do not see comments by people they blocked.
 *     tags: [Feed]
 *   post:
 *     summary: Comment on a post
 *     tags: [Feed]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body: { type: string, maxLength: 500 }
 */
router.get('/:id/comments', async (req: Request, res: Response) => {
  const row = await publicPost(routeParam(req, 'id'));
  if (!row) return res.status(404).json({ detail: 'Post not found' });
  const viewer = await optionalUser(req);
  const conditions = [eq(schema.postComments.postId, row.post.id)];
  if (viewer) {
    const blocked = await db.select({ id: schema.userBlocks.blockedId }).from(schema.userBlocks)
      .where(eq(schema.userBlocks.blockerId, viewer.id));
    if (blocked.length) conditions.push(sql`${schema.postComments.userId} NOT IN (${sql.join(blocked.map((b) => sql`${b.id}`), sql`, `)})`);
  }
  const comments = await db
    .select({ c: schema.postComments, name: schema.users.name, avatar: schema.users.avatar })
    .from(schema.postComments)
    .innerJoin(schema.users, eq(schema.users.id, schema.postComments.userId))
    .where(and(...conditions))
    .orderBy(schema.postComments.createdAt)
    .limit(COMMENTS_PAGE);
  res.json({
    comments: comments.map(({ c, name, avatar }) => ({
      id: c.id,
      body: c.body,
      created_at: c.createdAt,
      user: { id: c.userId, name, avatar },
      can_delete: !!viewer && (viewer.id === c.userId || viewer.id === row.post.userId || viewer.role === 'admin'),
    })),
  });
});

router.post('/:id/comments', authenticateToken, rateLimiter(30, 60 * 60 * 1000, 'post_comment'), async (req: Request, res: Response) => {
  const row = await publicPost(routeParam(req, 'id'));
  if (!row) return res.status(404).json({ detail: 'Post not found' });
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
  if (!body) return res.status(400).json({ detail: 'Write a comment first' });
  if (body.length > MAX_COMMENT_LEN) return res.status(400).json({ detail: `A comment can be at most ${MAX_COMMENT_LEN} characters` });
  const [c] = await db.insert(schema.postComments)
    .values({ id: uuidv4(), postId: row.post.id, userId: req.user!.id, body, createdAt: new Date().toISOString() })
    .returning();
  res.status(201).json({
    comment: {
      id: c.id,
      body: c.body,
      created_at: c.createdAt,
      user: { id: req.user!.id, name: req.user!.name, avatar: req.user!.avatar ?? null },
      can_delete: true,
    },
  });
});

/** The comment's writer, the post's author or an admin can delete it. */
router.delete('/:id/comments/:commentId', authenticateToken, async (req: Request, res: Response) => {
  const [c] = await db.select({ comment: schema.postComments, postAuthor: schema.hostPosts.userId })
    .from(schema.postComments)
    .innerJoin(schema.hostPosts, eq(schema.hostPosts.id, schema.postComments.postId))
    .where(and(eq(schema.postComments.id, routeParam(req, 'commentId')), eq(schema.postComments.postId, routeParam(req, 'id'))))
    .limit(1);
  const me = req.user!;
  if (!c || !(c.comment.userId === me.id || c.postAuthor === me.id || me.role === 'admin')) {
    return res.status(404).json({ detail: 'Comment not found' });
  }
  await db.delete(schema.postComments).where(eq(schema.postComments.id, c.comment.id));
  res.json({ ok: true });
});

router.patch('/:id', authenticateToken, async (req: Request, res: Response) => {
  const [post] = await db.select().from(schema.hostPosts).where(eq(schema.hostPosts.id, routeParam(req, 'id'))).limit(1);
  if (!post || post.userId !== req.user!.id) return res.status(404).json({ detail: 'Post not found' });
  const provider = await myProvider(req.user!.id);
  if (!provider) return res.status(404).json({ detail: 'Post not found' });

  const set: Partial<typeof schema.hostPosts.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (req.body?.body !== undefined) {
    const body = parseBody(req.body.body);
    if ('error' in body) return res.status(400).json({ detail: body.error });
    set.body = body.body;
  }
  if (req.body?.photos !== undefined) {
    const photos = parsePhotos(req.body.photos);
    if ('error' in photos) return res.status(400).json({ detail: photos.error });
    set.photos = photos.photos;
  }
  if (req.body?.listing_id !== undefined) {
    const listing = await ownListing(req.body.listing_id, provider);
    if ('error' in listing) return res.status(400).json({ detail: listing.error });
    set.listingId = listing.id;
  }

  await db.update(schema.hostPosts).set(set).where(eq(schema.hostPosts.id, post.id));
  const [row] = (await selectRows().where(eq(schema.hostPosts.id, post.id)).limit(1)) as Row[];
  res.json({ post: postOut(row, { includeModeration: true }) });
});

router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  const [post] = await db.select().from(schema.hostPosts).where(eq(schema.hostPosts.id, routeParam(req, 'id'))).limit(1);
  if (!post || (post.userId !== req.user!.id && req.user!.role !== 'admin')) {
    return res.status(404).json({ detail: 'Post not found' });
  }
  await db.delete(schema.hostPosts).where(eq(schema.hostPosts.id, post.id));
  res.json({ ok: true });
});

/**
 * @openapi
 * /posts/{id}/hide:
 *   post:
 *     summary: Hide a post from the feed (admin), e.g. after a report. The host still sees it, marked hidden.
 *     tags: [Feed]
 *     security: [{ bearerAuth: [] }]
 * /posts/{id}/unhide:
 *   post:
 *     summary: Put a hidden post back (admin)
 *     tags: [Feed]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/hide', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : null;
  const [row] = await db
    .update(schema.hostPosts)
    .set({ hiddenAt: new Date().toISOString(), hiddenReason: reason || null })
    .where(eq(schema.hostPosts.id, routeParam(req, 'id')))
    .returning({ id: schema.hostPosts.id });
  if (!row) return res.status(404).json({ detail: 'Post not found' });
  res.json({ ok: true });
});

router.post('/:id/unhide', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const [row] = await db
    .update(schema.hostPosts)
    .set({ hiddenAt: null, hiddenReason: null })
    .where(eq(schema.hostPosts.id, routeParam(req, 'id')))
    .returning({ id: schema.hostPosts.id });
  if (!row) return res.status(404).json({ detail: 'Post not found' });
  res.json({ ok: true });
});

export default router;
