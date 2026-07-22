import api from '@/lib/api';

export interface Review {
  id: string;
  listing_id: string;
  user_id: string;
  rating: number;
  comment: string;
  author_name: string;
  created_at: string;
  updated_at: string | null;
}

export interface ReviewSummary {
  count: number;
  average: number;
}

export async function fetchReviews(listingId: string): Promise<{ summary: ReviewSummary; reviews: Review[] }> {
  const { data } = await api.get(`/reviews/listing/${listingId}`);
  return { summary: data.summary || { count: 0, average: 0 }, reviews: data.reviews || [] };
}

export async function postReview(listingId: string, rating: number, comment: string): Promise<Review> {
  const { data } = await api.post('/reviews', { listing_id: listingId, rating, comment });
  return data.review;
}

export async function deleteReview(reviewId: string): Promise<void> {
  await api.delete(`/reviews/${reviewId}`);
}
