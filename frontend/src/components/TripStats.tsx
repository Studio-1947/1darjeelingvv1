import React from 'react';
import { useTranslation } from 'react-i18next';
import { Chip, Chips } from '@/components/ag';

export type TripFilter = 'all' | 'upcoming' | 'completed' | 'cancelled';

const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0));

/** The same buckets on the account page and in My Trips. */
export function tripBuckets(bookings: any[]) {
  const now = startOfToday();
  // Same rule as the server (lib/travellerDashboard.ts isCompleted): a confirmed booking is
  // completed once its last day (check-out, else check-in) has gone by, or when it has no date.
  // Everything else that is not cancelled is still ahead, so the three cards add up to the total.
  const isCompleted = (b: any) => {
    if (b.status !== 'confirmed') return false;
    const end = b.check_out || b.check_in;
    return !end || new Date(end) < now;
  };
  const completed = bookings.filter(isCompleted);
  const cancelled = bookings.filter((b) => b.status === 'cancelled');
  const upcoming = bookings.filter((b) => b.status !== 'cancelled' && !isCompleted(b));
  return { all: bookings, upcoming, completed, cancelled };
}

const FILTERS: { key: TripFilter; label: [string, string] }[] = [
  { key: 'all', label: ['ui.trips.all', 'Everything'] },
  { key: 'upcoming', label: ['trips.upcoming', 'Upcoming'] },
  { key: 'completed', label: ['trips.completed', 'Completed'] },
  { key: 'cancelled', label: ['booking.status.cancelled', 'Cancelled'] },
];

/** One row of filter chips with counts (prototype My trip tiles); the selected one is red. */
export default function TripStats({ bookings, filter, onFilter }: {
  bookings: any[];
  filter: TripFilter;
  onFilter: (f: TripFilter) => void;
}) {
  const { t } = useTranslation();
  const buckets = tripBuckets(bookings);
  return (
    <Chips scroll role="group" aria-label={t('ui.trips.filter', 'Show trips')} data-testid="trip-stats">
      {FILTERS.map(({ key, label }) => (
        <Chip key={key} on={filter === key} onClick={() => onFilter(key)} data-testid={`trip-stat-${key}`}>
          {t(label[0], label[1])} <span className="n tabular-nums">{buckets[key].length}</span>
        </Chip>
      ))}
    </Chips>
  );
}
