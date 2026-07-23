import { Mountain, Home as HomeIcon, Car, Store, Coffee, PartyPopper, Leaf } from 'lucide-react';

/**
 * The seven top-level categories. They live in the header nav (and are the
 * app's primary browse affordance), so the list is shared rather than
 * redeclared per page. `key` indexes into `categories.*` in the locale files.
 */
export const CATEGORIES = [
  { key: 'spot', to: '/spots', Icon: Mountain },
  { key: 'homestay', to: '/homestays', Icon: HomeIcon },
  { key: 'driver', to: '/drivers', Icon: Car },
  { key: 'shop', to: '/shops', Icon: Store },
  { key: 'cafe', to: '/cafes', Icon: Coffee },
  { key: 'event', to: '/events', Icon: PartyPopper },
  { key: 'biodiversity', to: '/biodiversity', Icon: Leaf },
];
