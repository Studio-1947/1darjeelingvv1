import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, MapPin, Navigation, Calendar, Users, Home as HomeIcon, Car, Sparkles } from 'lucide-react';

/**
 * MakeMyTrip-inspired booking widget with tabs.
 */
export default function BookingWidget() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [tab, setTab] = useState('stay');
  const [q, setQ] = useState('');
  // Drivers sell a journey, not a place, so that tab asks for both ends of the
  // route instead of a single destination.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState(2);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGuestsPicker, setShowGuestsPicker] = useState(false);
  const dateRef = useRef(null);
  const guestsRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dateRef.current && !dateRef.current.contains(event.target)) {
        setShowDatePicker(false);
      }
      if (guestsRef.current && !guestsRef.current.contains(event.target)) {
        setShowGuestsPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatDates = () => {
    if (!checkIn && !checkOut) return t('widget.any_dates');

    // Month names follow the chosen language, not a hardcoded en-US locale.
    const locale = i18n.language || 'en';
    const formatDateStr = (dateStr) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    };

    if (checkIn && !checkOut) return t('widget.from_date', { date: formatDateStr(checkIn) });
    if (!checkIn && checkOut) return t('widget.until_date', { date: formatDateStr(checkOut) });

    const d1 = new Date(checkIn);
    const d2 = new Date(checkOut);
    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
      if (d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()) {
        const monthStr = d1.toLocaleDateString(locale, { month: 'short' });
        return `${d1.getDate()} - ${d2.getDate()} ${monthStr}`;
      }
    }

    return `${formatDateStr(checkIn)} - ${formatDateStr(checkOut)}`;
  };

  const tabs = [
    { key: 'stay', label: t('nav.homestays'), Icon: HomeIcon, target: '/homestays' },
    { key: 'driver', label: t('nav.drivers'), Icon: Car, target: '/drivers' },
  ];

  const submit = (e) => {
    e.preventDefault();
    const active = tabs.find((x) => x.key === tab);

    if (tab === 'driver') {
      const a = from.trim();
      const b = to.trim();
      if (!a && !b) return nav(active.target);
      // Both ends are kept in the URL so the intent survives the navigation,
      // but only one can actually filter today: the listings API matches a
      // single `q` against title/description/location and never looks at
      // extras.routes, so a true origin+destination route search needs backend
      // support. Destination is the more useful of the two to match on.
      const params = new URLSearchParams();
      if (a) params.set('from', a);
      if (b) params.set('to', b);
      params.set('q', b || a);
      return nav(`${active.target}?${params}`);
    }

    if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`);
    else nav(active.target);
  };

  return (
    <div data-testid="booking-widget">
      {/* Tabs sit above the panel as raised folder tabs rather than inside it.
          They share the panel's white and butt straight up against its top
          edge, so the active one reads as continuous with the form below.
          Full-width halves on phones, content-width from md so they don't
          stretch across the whole widget on desktop. */}
      <div className="flex items-end gap-1 md:gap-1.5" role="tablist">
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            data-testid={`booking-widget-tab-${key}`}
            onClick={() => setTab(key)}
            className={`relative flex-1 md:flex-none md:px-14 rounded-t-2xl px-3 py-2.5 md:py-3.5 min-w-0
              flex items-center justify-center gap-1.5 md:gap-2 text-xs md:text-sm font-bold
              transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flag
              ${tab === key
                ? 'bg-white text-flag'
                : 'bg-white/80 text-ink-soft hover:bg-white hover:text-ink'}`}
          >
            <Icon size={16} className="flex-shrink-0" /> <span className="truncate">{label}</span>
            {/* Absolutely positioned rather than a border, so marking a tab
                active can't make it 2px taller than its sibling. */}
            {tab === key && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-flag" />}
          </button>
        ))}
      </div>

      {/* Form - top-left stays square so the first tab merges into the panel */}
      <form
        onSubmit={submit}
        className="bg-white rounded-3xl rounded-tl-none rounded-tr-none md:rounded-tr-3xl
                   shadow-[0_20px_50px_-30px_rgba(20,32,26,0.35)]
                   p-4 md:p-5 space-y-3 md:space-y-0 md:grid md:grid-cols-12 md:gap-3 md:items-end"
      >
        {tab !== 'driver' && (
          <label className="block md:col-span-5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{t('widget.destination')}</span>
            <div className="mt-1 flex items-center gap-2 border border-[var(--line)] rounded-2xl px-3 py-2.5 md:py-3">
              <MapPin size={16} className="text-ink-soft flex-shrink-0" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('widget.destination_placeholder')}
                data-testid="booking-widget-destination"
                className="flex-1 min-w-0 bg-transparent outline-none text-sm md:text-base"
              />
            </div>
          </label>
        )}

        {tab === 'driver' && (
          <>
            <label className="block md:col-span-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{t('widget.from')}</span>
              <div className="mt-1 flex items-center gap-2 border border-[var(--line)] rounded-2xl px-3 py-2.5 md:py-3">
                <MapPin size={16} className="text-ink-soft flex-shrink-0" />
                <input
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  placeholder={t('widget.from_placeholder')}
                  data-testid="booking-widget-from"
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm md:text-base"
                />
              </div>
            </label>

            <label className="block md:col-span-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{t('widget.to')}</span>
              <div className="mt-1 flex items-center gap-2 border border-[var(--line)] rounded-2xl px-3 py-2.5 md:py-3">
                <Navigation size={16} className="text-ink-soft flex-shrink-0" />
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder={t('widget.to_placeholder')}
                  data-testid="booking-widget-to"
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm md:text-base"
                />
              </div>
            </label>
          </>
        )}

        {tab === 'stay' && (
          <div ref={dateRef} className="block md:col-span-4 relative">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{t('widget.when')}</span>
            <div 
              className="mt-1 flex items-center gap-2 border border-[var(--line)] rounded-2xl px-3 py-2.5 md:py-3 bg-white"
            >
              <Calendar size={16} className="text-ink-soft flex-shrink-0" />
              <div className="flex-1 min-w-0 text-sm md:text-base text-ink select-none">
                {formatDates()}
              </div>
            </div>
            {showDatePicker && (
              <div className="absolute left-0 right-0 bottom-full mb-2 p-4 bg-white border border-[var(--line)] rounded-2xl shadow-xl z-50 flex flex-col gap-3">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">{t('booking.checkin')}</span>
                    <input 
                      type="date" 
                      value={checkIn} 
                      onChange={(e) => setCheckIn(e.target.value)}
                      className="w-full mt-1 border border-[var(--line)] rounded-xl px-2 py-1.5 text-xs outline-none bg-transparent"
                      data-testid="booking-widget-checkin"
                    />
                  </div>
                  <div className="flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">{t('booking.checkout')}</span>
                    <input 
                      type="date" 
                      value={checkOut} 
                      onChange={(e) => setCheckOut(e.target.value)}
                      className="w-full mt-1 border border-[var(--line)] rounded-xl px-2 py-1.5 text-xs outline-none bg-transparent"
                      data-testid="booking-widget-checkout"
                    />
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setShowDatePicker(false)}
                  className="w-full py-1.5 bg-flag text-white font-bold text-xs rounded-xl hover:opacity-90 transition-opacity"
                >
                  {t('widget.done')}
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'driver' && (
          /* 3 + 3 (from/to) + 3 + 2 (guests) + 1 (button) = the 12-col row */
          <label className="block md:col-span-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{t('widget.date')}</span>
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
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{t('widget.when')}</span>
            <div className="mt-1 flex items-center gap-2 border border-[var(--line)] rounded-2xl px-3 py-2.5 md:py-3">
              <Calendar size={16} className="text-ink-soft flex-shrink-0" />
              <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)}
                className="flex-1 min-w-0 bg-transparent outline-none text-sm md:text-base" />
            </div>
          </label>
        )}

        <div ref={guestsRef} className="block md:col-span-2 relative">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{t('widget.guests')}</span>
          <div 
            onClick={() => setShowGuestsPicker(!showGuestsPicker)}
            className="mt-1 flex items-center gap-2 border border-[var(--line)] rounded-2xl px-3 py-2.5 md:py-3 cursor-pointer bg-white"
          >
            <Users size={16} className="text-ink-soft flex-shrink-0" />
            <div className="flex-1 min-w-0 text-sm md:text-base text-ink select-none">
              {t('widget.guest_count', { count: guests })}
            </div>
          </div>
          {showGuestsPicker && (
            <div className="absolute right-0 bottom-full mb-2 p-4 bg-white border border-[var(--line)] rounded-2xl shadow-xl z-50 w-44 flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">{t('widget.number_of_guests')}</span>
              <input 
                type="number" 
                min="1" 
                value={guests} 
                onChange={(e) => setGuests(parseInt(e.target.value) || 1)}
                data-testid="booking-widget-guests"
                className="w-full border border-[var(--line)] rounded-xl px-2 py-1.5 text-xs outline-none bg-transparent"
              />
            </div>
          )}
        </div>

        <button type="submit" data-testid="booking-widget-search"
          className="w-full md:col-span-1 py-3 md:py-3.5 rounded-2xl bg-flag text-white font-extrabold btn-hover flex items-center justify-center gap-2">
          <Search size={16} /> <span className="md:hidden">{t('widget.search')}</span>
        </button>
      </form>
    </div>
  );
}
