import api from '@/lib/api';

export interface Review {
  id: string;
  listing_id: string;
  user_id: string;
  rating: number;
  comment: string;
  author_name: string;
  photos?: string[];
  created_at: string;
  updated_at: string | null;
}

export interface ReviewSummary {
  count: number;
  average: number;
}

/** Whether the signed-in reader may review (null when signed out). `stay_required`: a homestay,
 *  driver or guide they have no completed booking with. */
export interface CanReview {
  allowed: boolean;
  code?: 'stay_required' | 'support_required';
}

export async function fetchReviews(listingId: string): Promise<{ summary: ReviewSummary; reviews: Review[]; canReview: CanReview | null }> {
  const { data } = await api.get(`/reviews/listing/${listingId}`);
  return { summary: data.summary || { count: 0, average: 0 }, reviews: data.reviews || [], canReview: data.can_review ?? null };
}

export async function postReview(listingId: string, rating: number, comment: string, photos: string[] = []): Promise<Review> {
  const { data } = await api.post('/reviews', { listing_id: listingId, rating, comment, photos });
  return data.review;
}

export async function deleteReview(reviewId: string): Promise<void> {
  await api.delete(`/reviews/${reviewId}`);
}

export type ReportReason = 'spam' | 'fake' | 'offensive' | 'unsafe' | 'other';

/** Flags a listing or a review for the aangan team. Reporting the same thing twice is harmless. */
export async function reportContent(input: {
  target_type: 'listing' | 'review' | 'post';
  target_id: string;
  reason: ReportReason;
  details?: string;
}): Promise<void> {
  await api.post('/reports', input);
}

/** Hides this person's reviews from the signed-in user. */
export async function blockUser(userId: string): Promise<void> {
  await api.post('/users/me/blocks', { user_id: userId });
}

export interface BlockedPerson {
  id: string;
  name: string;
  blocked_at: string;
}

/** The people the signed-in user has blocked, newest first. */
export async function listBlocked(): Promise<BlockedPerson[]> {
  const { data } = await api.get('/users/me/blocks');
  return data.users || [];
}

/** Shows this person's reviews to the signed-in user again. */
export async function unblockUser(userId: string): Promise<void> {
  await api.delete(`/users/me/blocks/${encodeURIComponent(userId)}`);
}
