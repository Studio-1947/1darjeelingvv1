import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, MapPin, Calendar, Users, Home as HomeIcon, Car, Sparkles } from 'lucide-react';

/**
 * MakeMyTrip-inspired booking widget with tabs.
 */
export default function BookingWidget() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [tab, setTab] = useState('stay');
  const [q, setQ] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(2);

  const tabs = [
    { key: 'stay', label: t('nav.homestays'), Icon: HomeIcon, target: '/homestays' },
    { key: 'driver', label: t('nav.drivers'), Icon: Car, target: '/drivers' },
    { key: 'exp', label: t('nav.spots'), Icon: Sparkles, target: '/spots' },
  ];

  const submit = (e) => {
    e.preventDefault();
    const active = tabs.find((x) => x.key === tab);
    if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`);
    else nav(active.target);
  };

  return (
    <div className="bg-white rounded-3xl border border-[var(--line)] shadow-[0_20px_50px_-30px_rgba(20,32,26,0.35)] overflow-hidden" data-testid="booking-widget">
      {/* Tabs */}
      <div className="grid grid-cols-3 border-b border-[var(--line)]">
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            data-testid={`booking-widget-tab-${key}`}
            onClick={() => setTab(key)}
            className={`py-3 md:py-4 flex items-center justify-center gap-1.5 md:gap-2 text-xs md:text-sm font-bold transition-colors
              ${tab === key ? 'text-flag border-b-2 border-flag -mb-px' : 'text-ink-soft hover:text-ink'}`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={submit} className="p-4 md:p-5 space-y-3 md:space-y-0 md:grid md:grid-cols-12 md:gap-3 md:items-end">
        <label className="block md:col-span-5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Destination</span>
          <div className="mt-1 flex items-center gap-2 border border-[var(--line)] rounded-2xl px-3 py-2.5 md:py-3">
            <MapPin size={16} className="text-ink-soft flex-shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Darjeeling, Ghum, Tiger Hill…"
              data-testid="booking-widget-destination"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm md:text-base"
            />
          </div>
        </label>

        {tab === 'stay' && (
          <>
            <label className="block md:col-span-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Check-in</span>
              <div className="mt-1 flex items-center gap-2 border border-[var(--line)] rounded-2xl px-3 py-2.5 md:py-3">
                <Calendar size={16} className="text-ink-soft flex-shrink-0" />
                <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)}
                  data-testid="booking-widget-checkin"
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm md:text-base" />
              </div>
            </label>
            <label className="block md:col-span-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Check-out</span>
              <div className="mt-1 flex items-center gap-2 border border-[var(--line)] rounded-2xl px-3 py-2.5 md:py-3">
                <Calendar size={16} className="text-ink-soft flex-shrink-0" />
                <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)}
                  data-testid="booking-widget-checkout"
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm md:text-base" />
              </div>
            </label>
          </>
        )}
        {tab === 'driver' && (
          <label className="block md:col-span-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Date</span>
            <div className="mt-1 flex items-center gap-2 border border-[var(--line)] rounded-2xl px-3 py-2.5 md:py-3">
              <Calendar size={16} className="text-ink-soft flex-shrink-0" />
              <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)}
                data-testid="booking-widget-date"
                className="flex-1 min-w-0 bg-transparent outline-none text-sm md:text-base" />
            </div>
          </label>
        )}
        {tab === 'exp' && (
          <label className="block md:col-span-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">When</span>
            <div className="mt-1 flex items-center gap-2 border border-[var(--line)] rounded-2xl px-3 py-2.5 md:py-3">
              <Calendar size={16} className="text-ink-soft flex-shrink-0" />
              <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)}
                className="flex-1 min-w-0 bg-transparent outline-none text-sm md:text-base" />
            </div>
          </label>
        )}

        <label className="block md:col-span-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Guests</span>
          <div className="mt-1 flex items-center gap-2 border border-[var(--line)] rounded-2xl px-3 py-2.5 md:py-3">
            <Users size={16} className="text-ink-soft flex-shrink-0" />
            <input type="number" min="1" value={guests} onChange={(e) => setGuests(e.target.value)}
              data-testid="booking-widget-guests"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm md:text-base" />
          </div>
        </label>

        <button type="submit" data-testid="booking-widget-search"
          className="w-full md:col-span-1 py-3 md:py-3.5 rounded-2xl bg-flag text-white font-extrabold btn-hover flex items-center justify-center gap-2">
          <Search size={16} /> <span className="md:hidden">Search</span>
        </button>
      </form>
    </div>
  );
}
