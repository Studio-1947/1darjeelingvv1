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

export type Engagement = { like_count: number; comment_count: number; liked_by_me: boolean };

export async function setLiked(id: string, liked: boolean): Promise<Engagement> {
  const { data } = liked ? await api.post(`/posts/${id}/like`) : await api.delete(`/posts/${id}/like`);
  return data;
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
