/**
 * Each category's page title (in the prototype's words) and its address. Shared by the category
 * page's heading and the breadcrumb (components/PageBack), so both name a category the same way.
 */
export const CATEGORY_TITLE: Record<string, [string, string]> = {
  homestay: ['home.tile.stays', 'Homestay'],
  driver: ['home.tile.cars', 'Car & Driver'],
  spot: ['home.tile.spots', 'Offbeat Places'],
  cafe: ['home.cafes_title', 'Cafes & Restaurants'],
  shop: ['home.shops_title', 'Local Shops'],
  guide: ['home.tile.guides', 'Tour Guides'],
  event: ['home.tile.events', 'Festivals'],
  biodiversity: ['home.nature_title', 'Nature'],
};

export const CATEGORY_PATH: Record<string, string> = {
  homestay: '/homestays',
  driver: '/drivers',
  spot: '/spots',
  cafe: '/cafes',
  shop: '/shops',
  guide: '/guides',
  event: '/events',
  biodiversity: '/biodiversity',
};
