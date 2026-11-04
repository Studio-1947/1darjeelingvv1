import { inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { isCompleted, todayInIndia } from './travellerDashboard';
import { routeDistanceKm } from '../routes/routeEstimator';

/**
 * The host dashboard from the board (one sticky per host type):
 *   driver   - bookings, ongoing, km covered, passengers covered, locations covered, amount
 *   homestay - bookings, ongoing, guests served, amount
 *   guide    - covered trips, covered guests, upcoming guests, ongoing guests, amount earned
 *   all      - membership card, feedback, Aangan Points, ratings and reviews
 * Worked out from bookings and reviews; nothing is stored.
 */

/** Points a host earns (display only for now, like the traveller's). */
export const HOST_POINTS = {
  completedBooking: 50,
  review: 10,
  fiveStarReview: 20,
  verified: 100,
  profileComplete: 50,
} as const;

type B = { status: string; checkIn: string | null; checkOut: string | null; guests: number; listingType: string; routeName: string | null; listingId: string };

/** A confirmed booking happening today (India dates): checked in, not yet checked out. */
export function isOngoing(b: Pick<B, 'status' | 'checkIn' | 'checkOut'>, today = todayInIndia()): boolean {
  if (b.status !== 'confirmed' || !b.checkIn) return false;
  const start = b.checkIn.slice(0, 10);
  const end = (b.checkOut ?? b.checkIn).slice(0, 10);
  return start <= today && end >= today;
}

/** A booking that is on, but has not started yet. */
export function isUpcoming(b: Pick<B, 'status' | 'checkIn'>, today = todayInIndia()): boolean {
  if (b.status !== 'confirmed' && b.status !== 'accepted') return false;
  if (!b.checkIn) return b.status === 'accepted';
  return b.checkIn.slice(0, 10) > today;
}

/** "NJP Railway Station -> Darjeeling Town" style names, split into their two ends. */
export function routeEnds(name: string | null | undefined): [string, string] | null {
  if (!name) return null;
  // "->", arrows and dashes with spaces round them, or " to ". A hyphen inside a place name stays.
  const parts = name.split(/\s*(?:->|→|–|—)\s*|\s+-\s+|\s+to\s+/i).map((x) => x.trim()).filter(Boolean);
  return parts.length >= 2 ? [parts[0], parts[parts.length - 1]] : null;
}

export async function hostStats(listingIds: string[], opts: { verified: boolean; profileComplete: boolean }) {
  const empty = {
    bookings: 0, completed: 0, ongoing: 0, upcoming: 0, pending: 0,
    guests_served: 0, ongoing_guests: 0, upcoming_guests: 0,
    km_covered: 0, locations_covered: [] as string[], unknown_route_trips: 0,
    average_rating: 0, review_count: 0, recent_reviews: [] as any[],
  };
  const bookings: B[] = listingIds.length
    ? await db.select({
      status: schema.bookings.status, checkIn: schema.bookings.checkIn, checkOut: schema.bookings.checkOut,
      guests: schema.bookings.guests, listingType: schema.bookings.listingType, routeName: schema.bookings.routeName,
      listingId: schema.bookings.listingId,
    }).from(schema.bookings).where(inArray(schema.bookings.listingId, listingIds))
    : [];
  const reviewRows = listingIds.length
    ? await db.select().from(schema.reviews).where(inArray(schema.reviews.listingId, listingIds))
    : [];
  const titles = listingIds.length
    ? new Map((await db.select({ id: schema.listings.id, title: schema.listings.title }).from(schema.listings)
      .where(inArray(schema.listings.id, listingIds))).map((l) => [l.id, l.title]))
    : new Map<string, string>();
  const allReviews = reviewRows.map((r) => ({ rating: r.rating, comment: r.comment, author: r.authorName, created_at: r.createdAt, listing_id: r.listingId }));

  const done = bookings.filter((b) => isCompleted(b));
  const ongoing = bookings.filter((b) => isOngoing(b));
  const upcoming = bookings.filter((b) => isUpcoming(b));
  const sumGuests = (list: B[]) => list.reduce((a, b) => a + (b.guests || 0), 0);

  // Km and places only count trips that said which route they took.
  let km = 0;
  let unknown = 0;
  const places = new Set<string>();
  for (const b of done.filter((x) => x.listingType === 'driver')) {
    const ends = routeEnds(b.routeName);
    if (!ends) { unknown += 1; continue; }
    ends.forEach((e) => places.add(e));
    const d = routeDistanceKm(ends[0], ends[1]);
    if (d) km += d; else unknown += 1;
  }

  const average = allReviews.length ? Math.round((allReviews.reduce((a, r) => a + r.rating, 0) / allReviews.length) * 10) / 10 : 0;
  const fiveStars = allReviews.filter((r) => r.rating === 5).length;
  const breakdown = {
    bookings: done.length * HOST_POINTS.completedBooking,
    reviews: allReviews.length * HOST_POINTS.review + fiveStars * (HOST_POINTS.fiveStarReview - HOST_POINTS.review),
    verified: opts.verified ? HOST_POINTS.verified : 0,
    profile: opts.profileComplete ? HOST_POINTS.profileComplete : 0,
  };

  return {
    ...empty,
    bookings: bookings.filter((b) => b.status !== 'cancelled').length,
    completed: done.length,
    ongoing: ongoing.length,
    upcoming: upcoming.length,
    pending: bookings.filter((b) => b.status === 'pending_payment').length,
    guests_served: sumGuests(done),
    ongoing_guests: sumGuests(ongoing),
    upcoming_guests: sumGuests(upcoming),
    km_covered: Math.round(km),
    locations_covered: [...places].sort(),
    unknown_route_trips: unknown,
    average_rating: average,
    review_count: allReviews.length,
    recent_reviews: allReviews
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 5)
      .map((r) => ({ ...r, listing_title: titles.get(r.listing_id) ?? '' })),
    points: Object.values(breakdown).reduce((a, b) => a + b, 0),
    points_breakdown: breakdown,
  };
}
