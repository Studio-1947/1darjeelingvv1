import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from '@phosphor-icons/react';

export type TripFilter = 'all' | 'upcoming' | 'completed' | 'cancelled';

const startOfToday = () => new Date(new Date().setHours(0, 0, 0, 0));

/** The same buckets on the account page and in My Trips. */
export function tripBuckets(bookings: any[]) {
  const now = startOfToday();
  const upcoming = bookings.filter((b) => b.status !== 'cancelled' && (b.check_in ? new Date(b.check_in) >= now : true));
  const completed = bookings.filter((b) => b.status === 'confirmed' && b.check_in && new Date(b.check_in) < now);
  const cancelled = bookings.filter((b) => b.status === 'cancelled');
  return { all: bookings, upcoming, completed, cancelled };
}

// Flat colours, no gradients: total = light teal, upcoming = middle teal, completed = light green.
const CARDS: { key: Exclude<TripFilter, 'cancelled'>; label: string; cls: string }[] = [
  { key: 'all', label: 'trips.total_bookings', cls: 'bg-[#DDF0F1] text-[#0E4A4F]' },
  { key: 'upcoming', label: 'trips.upcoming', cls: 'bg-[#8FCFD3] text-[#083A3E]' },
  { key: 'completed', label: 'trips.completed', cls: 'bg-[#DDF3E1] text-[#1E5A2E]' },
];

/** Three count cards; tapping one filters the list below to it. */
export default function TripStats({ bookings, filter, onFilter }: {
  bookings: any[];
  filter: TripFilter;
  onFilter: (f: TripFilter) => void;
}) {
  const { t } = useTranslation();
  const buckets = tripBuckets(bookings);
  return (
    <div className="grid grid-cols-3 gap-2.5 md:gap-4" data-testid="trip-stats">
      {CARDS.map(({ key, label, cls }) => {
        const active = filter === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onFilter(key)}
            aria-pressed={active}
            data-testid={`trip-stat-${key}`}
            className={`text-left rounded-2xl p-3 md:p-4 transition-shadow ${cls} ${active ? 'ring-2 ring-[#1F6656] shadow-md' : 'hover:shadow-sm'}`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] md:text-xs font-bold leading-tight">{t(label)}</span>
              <ArrowRight size={14} weight="bold" className="flex-shrink-0" />
            </div>
            <div className="mt-1.5 font-display font-extrabold text-2xl md:text-3xl leading-none">{buckets[key].length}</div>
          </button>
        );
      })}
    </div>
  );
}
