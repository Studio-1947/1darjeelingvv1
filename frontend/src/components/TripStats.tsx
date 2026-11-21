import React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from '@/components/ag/Icon';

export type TripFilter = 'all' | 'upcoming' | 'waiting' | 'completed' | 'cancelled';

const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0));

/** Same rule as the server (lib/travellerDashboard.ts isCompleted): a confirmed booking is completed
 *  once its last day (check-out, else check-in) has gone by, or when it has no date. */
const isCompleted = (b: any, now = startOfToday()) => {
  if (b.status !== 'confirmed') return false;
  const end = b.check_out || b.check_in;
  return !end || new Date(end) < now;
};

/** The same buckets on the account page and in My Trips. Everything not cancelled and not finished
 *  is still ahead, so upcoming + completed + cancelled add up to all. */
export function tripBuckets(bookings: any[]) {
  const now = startOfToday();
  const completed = bookings.filter((b) => isCompleted(b, now));
  const cancelled = bookings.filter((b) => b.status === 'cancelled');
  const upcoming = bookings.filter((b) => b.status !== 'cancelled' && !isCompleted(b, now));
  return { all: bookings, upcoming, completed, cancelled };
}

/** The four My trip tiles (prototype .tdash): booked and ahead, waiting for the host or for you,
 *  finished, and cancelled or declined. */
export function tileBuckets(bookings: any[]): Record<TripFilter, any[]> {
  const b = tripBuckets(bookings);
  return {
    all: bookings,
    upcoming: b.upcoming.filter((x) => x.status === 'confirmed'),
    waiting: b.upcoming.filter((x) => x.status !== 'confirmed'),
    completed: b.completed,
    cancelled: b.cancelled,
  };
}

const TILES: { key: Exclude<TripFilter, 'all'>; icon: IconName; label: [string, string] }[] = [
  { key: 'upcoming', icon: 't_trip', label: ['trips.upcoming', 'Upcoming'] },
  { key: 'waiting', icon: 'bell', label: ['ui.trips.waiting', 'Waiting'] },
  { key: 'completed', icon: 'check', label: ['trips.completed', 'Completed'] },
  { key: 'cancelled', icon: 'close', label: ['booking.status.cancelled', 'Cancelled'] },
];

export const tileLabel = (key: TripFilter): [string, string] =>
  TILES.find((x) => x.key === key)?.label || ['ui.trips.all', 'Everything'];

/** Four tiles with counts (prototype My trip); tapping one shows only those trips, again shows all. */
export default function TripStats({ bookings, filter, onFilter }: {
  bookings: any[];
  filter: TripFilter;
  onFilter: (f: TripFilter) => void;
}) {
  const { t } = useTranslation();
  const buckets = tileBuckets(bookings);
  return (
    <div className="ag-account-tdash" role="group" aria-label={t('ui.trips.filter', 'Show trips')} data-testid="trip-stats">
      {TILES.map(({ key, icon, label }) => (
        <button key={key} type="button" className="ag-account-tdtile" aria-pressed={filter === key}
          onClick={() => onFilter(filter === key ? 'all' : key)} data-testid={`trip-stat-${key}`}>
          <Icon name={icon} />
          <span className="go" aria-hidden="true"><Icon name="arrowne" /></span>
          <b>{String(buckets[key].length).padStart(2, '0')}</b>
          <span>{t(label[0], label[1])}</span>
        </button>
      ))}
    </div>
  );
}
