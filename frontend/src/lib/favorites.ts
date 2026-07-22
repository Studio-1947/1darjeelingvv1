import api from '@/lib/api';

/** A saved listing, shaped exactly like a GET /listings item so ListingCard renders it unchanged. */
export interface SavedListing {
  id: string;
  title: string;
  type: string;
  description: string;
  location: string;
  price: number;
  image: string;
  tags: string[];
  provider_id: string;
  provider_verified: boolean;
  [key: string]: any;
}

/** Just the listing ids the current user has saved — used to reflect save-button state everywhere. */
export async function fetchFavoriteIds(): Promise<string[]> {
  const { data } = await api.get('/favorites/ids');
  return data.ids || [];
}

/** The current user's saved listings, enriched for display on the Saved page. */
export async function fetchFavorites(): Promise<SavedListing[]> {
  const { data } = await api.get('/favorites');
  return data.items || [];
}

export async function addFavorite(listingId: string): Promise<void> {
  await api.post('/favorites', { listing_id: listingId });
}

export async function removeFavorite(listingId: string): Promise<void> {
  await api.delete(`/favorites/${listingId}`);
}
