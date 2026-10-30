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
