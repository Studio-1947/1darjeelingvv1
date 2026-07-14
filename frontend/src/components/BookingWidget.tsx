import React, { useState, useRef, useEffect } from 'react';
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
    if (!checkIn && !checkOut) return 'Any dates';
    
    const formatDateStr = (dateStr) => {
      if (!dateStr) return '';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    };

    if (checkIn && !checkOut) return `From ${formatDateStr(checkIn)}`;
    if (!checkIn && checkOut) return `Until ${formatDateStr(checkOut)}`;
    
    const d1 = new Date(checkIn);
    const d2 = new Date(checkOut);
    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
      if (d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()) {
        const monthStr = d1.toLocaleDateString('en-US', { month: 'short' });
        return `${d1.getDate()} - ${d2.getDate()} ${monthStr}`;
      }
    }
    
    return `${formatDateStr(checkIn)} - ${formatDateStr(checkOut)}`;
  };

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
    <div className="bg-white rounded-3xl border border-[var(--line)] shadow-[0_20px_50px_-30px_rgba(20,32,26,0.35)]" data-testid="booking-widget">
      {/* Tabs */}
      <div className="grid grid-cols-3 border-b border-[var(--line)]">
        {tabs.map(({ key, label, Icon }, index) => (
          <button
            key={key}
            data-testid={`booking-widget-tab-${key}`}
            onClick={() => setTab(key)}
            className={`py-3 md:py-4 flex items-center justify-center gap-1.5 md:gap-2 text-xs md:text-sm font-bold transition-colors
              ${index === 0 ? 'rounded-tl-3xl' : ''}
              ${index === 2 ? 'rounded-tr-3xl' : ''}
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
          <div ref={dateRef} className="block md:col-span-4 relative">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">When</span>
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
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Check-in</span>
                    <input 
                      type="date" 
                      value={checkIn} 
                      onChange={(e) => setCheckIn(e.target.value)}
                      className="w-full mt-1 border border-[var(--line)] rounded-xl px-2 py-1.5 text-xs outline-none bg-transparent"
                      data-testid="booking-widget-checkin"
                    />
                  </div>
                  <div className="flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Check-out</span>
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
                  Done
                </button>
              </div>
            )}
          </div>
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

        <div ref={guestsRef} className="block md:col-span-2 relative">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">Guests</span>
          <div 
            onClick={() => setShowGuestsPicker(!showGuestsPicker)}
            className="mt-1 flex items-center gap-2 border border-[var(--line)] rounded-2xl px-3 py-2.5 md:py-3 cursor-pointer bg-white"
          >
            <Users size={16} className="text-ink-soft flex-shrink-0" />
            <div className="flex-1 min-w-0 text-sm md:text-base text-ink select-none">
              {guests} Guest{guests > 1 ? 's' : ''}
            </div>
          </div>
          {showGuestsPicker && (
            <div className="absolute right-0 bottom-full mb-2 p-4 bg-white border border-[var(--line)] rounded-2xl shadow-xl z-50 w-44 flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">Number of Guests</span>
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
          <Search size={16} /> <span className="md:hidden">Search</span>
        </button>
      </form>
    </div>
  );
}
