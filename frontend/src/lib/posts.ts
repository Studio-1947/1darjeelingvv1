import api from '@/lib/api';

/** Mirrors MAX_POST_LEN / MAX_POST_PHOTOS in backend/src/routes/posts.ts. */
export const MAX_POST_LEN = 1000;
export const MAX_POST_PHOTOS = 4;

export interface HostPost {
  id: string;
  body: string;
  photos: string[];
  created_at: string;
  updated_at: string | null;
  author_user_id: string;
  host: {
    provider_id: string;
    name: string;
    type: string;
    location: string;
    image: string | null;
    verified: boolean;
  };
  listing: { id: string; title: string; type: string; image: string } | null;
  like_count?: number;
  comment_count?: number;
  liked_by_me?: boolean;
  reactions?: Partial<Record<ReactionKind, number>>;
  my_reaction?: ReactionKind | null;
  /** Only on the host's own posts. */
  hidden?: boolean;
  hidden_reason?: string | null;
}

export async function fetchFeed(opts: { before?: string | null; limit?: number; providerId?: string } = {}) {
  const { data } = await api.get('/posts', {
    params: {
      before: opts.before || undefined,
      limit: opts.limit,
      provider_id: opts.providerId || undefined,
    },
  });
  return { posts: (data.posts || []) as HostPost[], nextBefore: (data.next_before || null) as string | null };
}

export type CanPostReason = 'not_a_host' | 'not_verified' | 'plan_not_live' | null;

export async function fetchMyPosts(): Promise<{ canPost: boolean; reason: CanPostReason; posts: HostPost[] }> {
  const { data } = await api.get('/posts/me');
  return { canPost: !!data.can_post, reason: data.reason ?? null, posts: data.posts || [] };
}

export async function createPost(input: { body: string; photos: string[]; listing_id?: string | null }): Promise<HostPost> {
  const { data } = await api.post('/posts', input);
  return data.post;
}

export async function updatePost(id: string, input: { body?: string; photos?: string[]; listing_id?: string | null }): Promise<HostPost> {
  const { data } = await api.patch(`/posts/${id}`, input);
  return data.post;
}

export async function deletePost(id: string): Promise<void> {
  await api.delete(`/posts/${id}`);
}

export interface PostComment {
  id: string;
  body: string;
  created_at: string;
  user: { id: string; name: string; avatar: string | null };
  can_delete: boolean;
}

/** The reactions a reader can leave on a post, in the order the picker shows them. */
export const REACTIONS = [
  { kind: 'heart', emoji: '❤️' },
  { kind: 'wow', emoji: '😮' },
  { kind: 'clap', emoji: '👏' },
  { kind: 'yum', emoji: '😋' },
] as const;
export type ReactionKind = (typeof REACTIONS)[number]['kind'];

export type Engagement = {
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  reactions?: Partial<Record<ReactionKind, number>>;
  my_reaction?: ReactionKind | null;
};

/** The engagement after the viewer picks a reaction (null takes theirs back), shown before the server answers. */
export function applyReaction(e: Engagement, kind: ReactionKind | null): Engagement {
  const reactions = { ...(e.reactions || {}) };
  const prev = e.my_reaction ?? (e.liked_by_me ? 'heart' : null);
  if (prev) reactions[prev] = Math.max(0, (reactions[prev] || 0) - 1);
  if (kind) reactions[kind] = (reactions[kind] || 0) + 1;
  const like_count = Math.max(0, e.like_count - (prev ? 1 : 0) + (kind ? 1 : 0));
  return { ...e, reactions, my_reaction: kind, liked_by_me: !!kind, like_count };
}

/** The most used reactions on a post, most first, for the little summary next to the count. */
export function topReactions(e: Engagement, max = 3): string[] {
  return REACTIONS
    .map((r) => ({ emoji: r.emoji as string, n: e.reactions?.[r.kind] || 0 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((r) => r.emoji);
}

export async function setReaction(id: string, kind: ReactionKind | null): Promise<Engagement> {
  const { data } = kind ? await api.post(`/posts/${id}/like`, { kind }) : await api.delete(`/posts/${id}/like`);
  return data;
}

/** Older callers: a like is a heart. */
export async function setLiked(id: string, liked: boolean): Promise<Engagement> {
  return setReaction(id, liked ? 'heart' : null);
}

export async function fetchComments(id: string): Promise<PostComment[]> {
  const { data } = await api.get(`/posts/${id}/comments`);
  return data.comments || [];
}

export async function addComment(id: string, body: string): Promise<PostComment> {
  const { data } = await api.post(`/posts/${id}/comments`, { body });
  return data.comment;
}

export async function deleteComment(postId: string, commentId: string): Promise<void> {
  await api.delete(`/posts/${postId}/comments/${commentId}`);
}

/** The link that opens one post in the feed. */
export const postUrl = (id: string) => `${window.location.origin}/feed?post=${encodeURIComponent(id)}`;
