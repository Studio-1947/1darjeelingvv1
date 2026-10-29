/**
 * Helpers for the home-page promotion cards (GET /api/promotions).
 */

// Promotion links are app paths (/category/homestay); the site's pages are named differently.
const WEB_CATEGORY_PATH: Record<string, string> = {
  homestay: '/homestays', driver: '/drivers', spot: '/spots', cafe: '/cafes',
  shop: '/shops', event: '/events', biodiversity: '/biodiversity',
};
export function webPathFor(link: string): string {
  const m = /^\/category\/([a-z]+)/.exec(link);
  if (m && WEB_CATEGORY_PATH[m[1]]) return WEB_CATEGORY_PATH[m[1]];
  return link.startsWith('/') ? link : '/';
}
