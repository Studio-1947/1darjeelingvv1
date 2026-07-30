import { mapPinFor } from '@/lib/listingContent';

/**
 * Where "Get Directions" goes: Google Maps directions with this listing as the
 * destination, routed from wherever the visitor happens to be. On a phone the
 * `dir/?api=1` form hands off to the Maps app, which is what the button
 * promises - turn-by-turn to this listing, not a page about it.
 *
 * The pin is used whenever there is one, because a coordinate *is* the listing
 * while a name search is only a guess at it. Titles here are editorial rather
 * than Google place names - "Prayer Flag Cottage", "Tenzing - Local Taxi
 * Driver" - so searching them landed on an unrelated business or on nothing,
 * even for listings whose position the provider had pinned and whose map was
 * already showing it on the same screen.
 *
 * Text is the fallback only for a listing nobody has placed yet: `mapPinFor`
 * withholds the town-centre default precisely so this stays a real fallback,
 * since routing someone to Darjeeling chowk under a Kalimpong homestay's name
 * is a confidently wrong answer, where title + location at least carries what
 * is actually known.
 */
export function directionsUrl(item: any): string {
  const pin = mapPinFor(item);
  const destination = pin
    ? `${pin[0]},${pin[1]}`
    : [item?.title, item?.location].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/** Open this listing in Google Maps in a new tab. No-op without a listing. */
export function openDirections(item: any): void {
  if (!item) return;
  window.open(directionsUrl(item), '_blank');
}
