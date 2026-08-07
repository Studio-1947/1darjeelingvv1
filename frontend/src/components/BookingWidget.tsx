import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, MapPin, Navigation, Calendar, Users, Home as HomeIcon, Car, Loader2, Minus, Plus, X } from 'lucide-react';
import api from '@/lib/api';
import { todayStr, addDays, isBadRange, formatDay, formatRange } from '@/lib/dates';
import { writeTrip } from '@/lib/tripParams';

const PLACES: { name: string; alt?: string[] }[] = [
  // Darjeeling and around
  { name: 'Darjeeling' },
  { name: 'Ghum', alt: ['Ghoom'] },
  { name: 'Tiger Hill' },
  { name: 'Mirik' },
  { name: 'Lamahatta' },
  { name: 'Takdah', alt: ['Tukdah'] },
  { name: 'Lepchajagat' },

  // Kurseong subdivision
  { name: 'Kurseong' },
  { name: "Eagle's Craig", alt: ['Eagles Crag', 'Eagle Crag', 'Durbin Dara', 'Viewpoint'] },
  { name: 'Dow Hill', alt: ['Deer Park', 'Victoria Boys School', 'Haunted Forest', 'Eco Park'] },
  { name: 'Makaibari Tea Estate', alt: ['Makaibari', 'Organic Tea Garden', 'Factory Tour', 'Tea Tasting'] },
  { name: 'Ambootia Tea Garden', alt: ['Ambootia', 'Shiva Temple', 'Ambootia Shiva Temple'] },
  { name: 'Netaji Museum', alt: ['Giddapahar', 'Subhas Chandra Bose', 'Subhash Chandra Bose', 'Netaji House'] },
  { name: 'Chimney Heritage Park', alt: ['Chimney', 'Colonial Chimney', 'Chimney Park'] },
  { name: 'Salamander Lake', alt: ['Bhanjyang', 'Namthing', 'Namthing Pokhari', 'Himalayan Black Salamander'] },
  { name: 'Sonada' },
  { name: 'Sittong', alt: ['Sitong', 'Orange Orchards', 'Orange Village'] },
  { name: 'Mungpoo', alt: ['Tagore', 'Rabindranath Tagore', 'Mongpu', 'Tagore House'] },

  // Kalimpong subdivision
  { name: 'Kalimpong' },
  { name: 'Deolo Hill', alt: ['Delo', 'Delo Hill', 'Teesta Valley', 'Paragliding', 'Kangchenjunga'] },
  { name: 'Durpin Hill', alt: ['Durbin', 'Durbin Hill', 'Durpin Dara', 'Zang Dhok Palri Phodang'] },
  { name: 'Zang Dhok Palri Phodang', alt: ['Durpin Monastery', 'Durbin Monastery', 'Tibetan Monastery', 'Nyingma'] },
  { name: 'Morgan House', alt: ['Colonial Mansion', 'WBTDC Heritage', 'Haunted House', 'Heritage Stay'] },
  { name: "Dr. Graham's Homes", alt: ['Graham Homes', 'Grahams Homes', 'Gothic Chapel', 'Dr Grahams Homes'] },
  { name: 'Pine View Nursery', alt: ['Cactus Nursery', 'Flower Nurseries', 'Orchid Houses', 'Succulents', 'Cactus'] },
  { name: 'Thongsa Gompa', alt: ['Bhutanese Monastery', 'Thongsa Monastery', 'Oldest Monastery'] },
  { name: 'Hanuman Tok', alt: ['Jelepla Viewpoint', 'Jelep La'] },
  { name: 'Jelepla Viewpoint', alt: ['Jelep La', 'Hanuman Tok'] },
  { name: 'Pedong', alt: ['Silk Route', 'Silk Route Gateway'] },
  { name: 'Teesta Bazaar', alt: ['Teesta', 'Teesta River', 'Teesta Rafting', 'Teesta Confluence'] },
];

const POPULAR = ['Darjeeling', 'Kalimpong', 'Kurseong', 'Mirik', 'Tiger Hill', 'Ghum'];

function placeMatchesTerm(place: { name: string; alt?: string[] }, needle: string): boolean {
  if (place.name.toLowerCase().includes(needle)) return true;
  return (place.alt || []).some((a) => a.toLowerCase().includes(needle));
}

const MAX_GUESTS = 99;
const typedGuests = (raw: string) => raw.replace(/\D/g, '').slice(0, String(MAX_GUESTS).length);

export default function BookingWidget() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [tab, setTab] = useState('stay');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState('2');
  const guestCount = parseInt(guests, 10) || 1;
  const [guestsTouched, setGuestsTouched] = useState(false);

  const changeGuests = (value: string) => {
    setGuestsTouched(true);
    setGuests(value);
  };

  const [panelOpen, setPanelOpen] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [matches, setMatches] = useState<any[]>([]);
  const [matching, setMatching] = useState(false);
  const [activeField, setActiveField] = useState<'q' | 'from' | 'to'>('q');

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggest(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatDates = () => {
    if (!checkIn && !checkOut) return t('widget.any_dates');
    const locale = i18n.language || 'en';
    if (checkIn && !checkOut) return t('widget.from_date', { date: formatDay(checkIn, locale) });
    if (!checkIn && checkOut) return t('widget.until_date', { date: formatDay(checkOut, locale) });
    return formatRange(checkIn, checkOut, locale);
  };

  const tabs = [
    { key: 'stay', label: t('nav.stays', 'Stays'), Icon: HomeIcon, target: '/homestays', type: 'homestay' },
    { key: 'driver', label: t('nav.drivers'), Icon: Car, target: '/drivers', type: 'driver' },
  ];
  const activeTab = tabs.find((x) => x.key === tab) ?? tabs[0];

  const currentField = tab === 'stay' ? 'q' : activeField === 'from' ? 'from' : 'to';
  const term = currentField === 'from' ? from : currentField === 'to' ? to : q;
  const setTerm = currentField === 'from' ? setFrom : currentField === 'to' ? setTo : setQ;

  const needle = term.trim().toLowerCase();
  const placeMatches = needle
    ? PLACES.filter((p) => placeMatchesTerm(p, needle)).map((p) => p.name)
    : POPULAR;

  useEffect(() => {
    if (!showSuggest) return;
    const searchNeedle = term.trim();
    if (searchNeedle.length < 2) {
      setMatches([]);
      setMatching(false);
      return;
    }

    setMatching(true);
    const timer = setTimeout(() => {
      api
        .get('/listings', {
          params: { q: searchNeedle, limit: 5, type: activeTab.type },
        })
        .then((r) => setMatches(r.data.items || []))
        .catch(() => setMatches([]))
        .finally(() => setMatching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [showSuggest, term, activeTab.type]);

  const today = todayStr();

  const pickCheckIn = (value: string) => {
    setCheckIn(value);
    if (isBadRange(value, checkOut)) setCheckOut('');
  };

  const pickPlace = (name: string) => {
    setTerm(name);
    setShowSuggest(false);
  };

  const togglePanel = () => {
    setPanelOpen((prev) => !prev);
    setShowSuggest(false);
  };

  const summaryPlace =
    tab === 'driver' ? [from.trim(), to.trim()].filter(Boolean).join(' → ') : q.trim();
  const summaryDates = checkIn || checkOut ? formatDates() : '';
  const summary =
    summaryPlace || summaryDates
      ? [
          summaryPlace,
          summaryDates,
          guestCount > 1 ? t('widget.guest_count', { count: guestCount }) : '',
        ]
          .filter(Boolean)
          .join('  ·  ')
      : '';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setPanelOpen(false);
    setShowSuggest(false);

    const active = activeTab;
    const trip = { checkIn, checkOut, guests: guestsTouched ? guestCount : 1 };
    const params = writeTrip(new URLSearchParams({ type: active.type }), trip);
    const bare = writeTrip(new URLSearchParams(), trip).toString();

    if (tab === 'driver') {
      const a = from.trim();
      const b = to.trim();
      if (!a && !b) return nav(bare ? `${active.target}?${bare}` : active.target);
      if (a) params.set('from', a);
      if (b) params.set('to', b);
      return nav(`/search?${params}`);
    }

    const where = q.trim();
    if (!where) return nav(bare ? `${active.target}?${bare}` : active.target);
    params.set('q', where);
    return nav(`/search?${params}`);
  };

  const pillLabel = 'text-[10px] font-bold uppercase tracking-wider text-white/60';
  const pillField =
    'mt-1 flex items-center gap-2 border border-white/20 rounded-xl px-3 py-2.5 bg-black/30 focus-within:border-white/50 transition-colors';

  return (
    <form onSubmit={submit} data-testid="booking-widget" className="relative w-full">
      <div ref={containerRef} className="relative w-full max-w-4xl mx-auto">
        {/* ========================================================================= */}
        {/* DESKTOP & TABLET WIDGET (md+)                                             */}
        {/* ========================================================================= */}
        <div className="hidden md:block">
          {/* Category Tabs */}
          <div className="flex items-center gap-2 mb-2">
            <div
              role="tablist"
              aria-label={t('widget.change_category')}
              className="inline-flex gap-1 p-1 rounded-full bg-black/50 backdrop-blur-md border border-white/15"
            >
              {tabs.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => {
                    setTab(key);
                    setShowSuggest(false);
                  }}
                  data-testid={`booking-widget-tab-${key}-menu`}
                  className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                    tab === key
                      ? 'bg-white text-pine shadow-md scale-105'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon size={14} className="flex-shrink-0" /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Main Horizontal Glass Bar */}
          <div className="relative z-20 flex items-stretch bg-black/60 backdrop-blur-xl border border-white/20 rounded-2xl shadow-[0_16px_40px_-12px_rgba(0,0,0,0.8)] p-2 transition-all hover:border-white/30 border-light">
            {/* Destination / Route Field */}
            {tab === 'driver' ? (
              <div className="flex-1 grid grid-cols-2 gap-2 px-3 py-1.5 border-r border-white/15">
                <div className="relative flex flex-col justify-center">
                  <span className={pillLabel}>{t('widget.from')}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <MapPin size={15} className="text-white/60 flex-shrink-0" />
                    <input
                      value={from}
                      onChange={(e) => {
                        setFrom(e.target.value);
                        setActiveField('from');
                        setShowSuggest(true);
                      }}
                      onFocus={() => {
                        setActiveField('from');
                        setShowSuggest(true);
                      }}
                      placeholder={t('widget.from_placeholder')}
                      data-testid="booking-widget-pill-from"
                      className="w-full bg-transparent outline-none text-sm font-semibold text-white placeholder:text-white/40"
                    />
                  </div>
                </div>

                <div className="relative flex flex-col justify-center border-l border-white/10 pl-3">
                  <span className={pillLabel}>{t('widget.to')}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Navigation size={15} className="text-white/60 flex-shrink-0" />
                    <input
                      value={to}
                      onChange={(e) => {
                        setTo(e.target.value);
                        setActiveField('to');
                        setShowSuggest(true);
                      }}
                      onFocus={() => {
                        setActiveField('to');
                        setShowSuggest(true);
                      }}
                      placeholder={t('widget.to_placeholder')}
                      role="combobox"
                      aria-expanded={showSuggest}
                      aria-controls="booking-widget-pill-suggest"
                      data-testid="booking-widget-pill-to"
                      className="w-full bg-transparent outline-none text-sm font-semibold text-white placeholder:text-white/40"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-[1.4] px-4 py-1.5 flex flex-col justify-center border-r border-white/15">
                <span className={pillLabel}>{t('widget.destination')}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <MapPin size={16} className="text-white/70 flex-shrink-0" />
                  <input
                    ref={searchInputRef}
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      setActiveField('q');
                      setShowSuggest(true);
                    }}
                    onFocus={() => {
                      setActiveField('q');
                      setShowSuggest(true);
                    }}
                    placeholder={t('widget.destination_placeholder')}
                    role="combobox"
                    aria-expanded={showSuggest}
                    aria-controls="booking-widget-pill-suggest"
                    data-testid="booking-widget-pill-where"
                    className="w-full bg-transparent outline-none text-sm font-semibold text-white placeholder:text-white/40 truncate"
                  />
                  {q && (
                    <button
                      type="button"
                      onClick={() => setQ('')}
                      className="text-white/40 hover:text-white p-0.5"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Dates Field */}
            {tab === 'driver' ? (
              <div className="flex-1 px-4 py-1.5 flex flex-col justify-center border-r border-white/15">
                <span className={pillLabel}>{t('widget.date')}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <Calendar size={15} className="text-white/60 flex-shrink-0" />
                  <input
                    type="date"
                    value={checkIn}
                    min={today}
                    onChange={(e) => pickCheckIn(e.target.value)}
                    data-testid="booking-widget-date"
                    className="w-full bg-transparent outline-none text-sm font-semibold text-white [color-scheme:dark]"
                  />
                </div>
              </div>
            ) : (
              <div className="flex-[1.2] grid grid-cols-2 gap-1 px-3 py-1.5 border-r border-white/15">
                <div className="flex flex-col justify-center">
                  <span className={pillLabel}>{t('booking.checkin')}</span>
                  <input
                    type="date"
                    value={checkIn}
                    min={today}
                    onChange={(e) => pickCheckIn(e.target.value)}
                    data-testid="booking-widget-checkin"
                    className="w-full bg-transparent outline-none text-xs font-semibold text-white [color-scheme:dark] mt-0.5"
                  />
                </div>
                <div className="flex flex-col justify-center border-l border-white/10 pl-2">
                  <span className={pillLabel}>{t('booking.checkout')}</span>
                  <input
                    type="date"
                    value={checkOut}
                    min={checkIn ? addDays(checkIn, 1) : today}
                    onChange={(e) => setCheckOut(e.target.value)}
                    data-testid="booking-widget-checkout"
                    className="w-full bg-transparent outline-none text-xs font-semibold text-white [color-scheme:dark] mt-0.5"
                  />
                </div>
              </div>
            )}

            {/* Guests Segment */}
            <div className="flex-1 px-3 py-1.5 flex flex-col justify-center pr-2">
              <span className={pillLabel}>{t('widget.number_of_guests')}</span>
              <div className="flex items-center justify-between gap-1 mt-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Users size={15} className="text-white/60 flex-shrink-0" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={String(MAX_GUESTS).length}
                    aria-label={t('widget.number_of_guests')}
                    value={guests}
                    onChange={(e) => changeGuests(typedGuests(e.target.value))}
                    onBlur={() => setGuests(String(guestCount))}
                    data-testid="booking-widget-guests"
                    className="w-8 bg-transparent outline-none text-sm font-semibold text-center text-white"
                  />
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => changeGuests(String(Math.max(1, guestCount - 1)))}
                    disabled={guestCount <= 1}
                    aria-label={t('widget.guests_less')}
                    data-testid="booking-widget-guests-minus"
                    className="w-6 h-6 rounded-full border border-white/25 flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30"
                  >
                    <Minus size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => changeGuests(String(Math.min(MAX_GUESTS, guestCount + 1)))}
                    disabled={guestCount >= MAX_GUESTS}
                    aria-label={t('widget.guests_more')}
                    data-testid="booking-widget-guests-plus"
                    className="w-6 h-6 rounded-full border border-white/25 flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>
            </div>

            {/* Desktop Search Button */}
            <div className="flex items-center pl-1 pr-1">
              <button
                type="submit"
                data-testid="booking-widget-search-compact"
                aria-label={t('widget.search')}
                className="h-full px-6 rounded-xl bg-flag text-white font-extrabold hover:bg-flag/90 flex items-center justify-center gap-2 shadow-lg btn-hover transition-all"
              >
                <Search size={18} />
                <span>{t('widget.search')}</span>
              </button>
            </div>
          </div>

          {/* Desktop Floating Suggestions Dropdown */}
          {showSuggest && (
            <div
              id="booking-widget-pill-suggest"
              data-testid="booking-widget-pill-suggest"
              className="absolute top-full left-0 mt-3 w-full max-w-lg bg-black/85 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200"
            >
              {placeMatches.length > 0 && (
                <div className="px-1 pb-2 text-[10px] font-bold uppercase tracking-widest text-white/60">
                  {t('widget.popular')}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {placeMatches.slice(0, 10).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickPlace(p)}
                    data-testid={`booking-widget-pill-place-${p}`}
                    className="px-3 py-1.5 rounded-full border border-white/20 bg-white/10 text-xs font-bold text-white hover:bg-white/25 transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>

              {(matching || matches.length > 0) && (
                <div className="flex items-center gap-1.5 px-1 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-white/60 border-t border-white/10">
                  {t('widget.matching')}
                  {matching && <Loader2 size={11} className="animate-spin text-white/60" />}
                </div>
              )}
              {matches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setShowSuggest(false);
                    nav(`/listing/${m.id}`);
                  }}
                  data-testid={`booking-widget-pill-listing-${m.id}`}
                  className="w-full flex items-start gap-2.5 px-3 py-2 rounded-xl text-left text-white hover:bg-white/15 transition-colors"
                >
                  <Search size={14} className="flex-shrink-0 mt-1 text-white/60" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold truncate">{m.title}</span>
                    <span className="block text-xs text-white/60 truncate">{m.location}</span>
                  </span>
                </button>
              ))}

              {!matching && !placeMatches.length && !matches.length && (
                <div className="px-1 py-2 text-sm text-white/70">{t('widget.no_matches')}</div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* MOBILE RESTING BAR & MODAL SHEET (< md)                                   */}
        {/* ========================================================================= */}
        <div className="block md:hidden">
          {/* Compact Resting Pill */}
          <div
            data-testid="booking-widget-pill"
            className="relative z-10 flex items-center gap-2 pl-4 pr-1.5 py-2 rounded-full border-light bg-black/70 backdrop-blur-lg border border-white/20 shadow-[0_12px_36px_-10px_rgba(0,0,0,0.8)]"
          >
            <button
              type="button"
              onClick={togglePanel}
              aria-expanded={panelOpen}
              aria-controls="booking-widget-panel-mobile"
              data-testid="booking-widget-pill-open"
              className="flex items-center gap-3 min-w-0 flex-1 text-left focus-visible:outline-none"
            >
              <MapPin size={18} className="flex-shrink-0 text-white/80" />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  {t('widget.search')}
                </span>
                <span className="truncate text-sm font-bold text-white">
                  {summary || t('widget.search_short')}
                </span>
              </div>
            </button>

            <button
              type="submit"
              data-testid="booking-widget-search-compact"
              aria-label={t('widget.search')}
              className="flex-shrink-0 w-11 h-11 rounded-full bg-flag text-white flex items-center justify-center shadow-md active:scale-95 transition-transform"
            >
              <Search size={18} />
            </button>
          </div>

          {/* Mobile Bottom Sheet Modal */}
          {panelOpen && (
            <div className="fixed inset-0 z-50 flex flex-col justify-end">
              {/* Backdrop */}
              <div
                className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={() => setPanelOpen(false)}
              />

              {/* Sheet Card */}
              <div
                id="booking-widget-panel-mobile"
                data-testid="booking-widget-pill-panel"
                aria-hidden={!panelOpen}
                className="relative z-10 w-full bg-[#14201A] border-t border-white/20 rounded-t-[28px] max-h-[85vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300 overflow-hidden"
              >
                {/* Header with drag indicator & close */}
                <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-white/10 flex-shrink-0">
                  <div
                    role="tablist"
                    aria-label={t('widget.change_category')}
                    className="flex gap-1 p-1 rounded-full bg-white/10"
                  >
                    {tabs.map(({ key, label, Icon }) => (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={tab === key}
                        onClick={() => setTab(key)}
                        data-testid={`booking-widget-tab-${key}-menu`}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                          tab === key ? 'bg-white text-pine shadow-sm' : 'text-white/70'
                        }`}
                      >
                        <Icon size={14} /> {label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => setPanelOpen(false)}
                    aria-label="Close search options"
                    className="w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-90"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Scrollable Form Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* Destination / Route */}
                  {tab === 'driver' ? (
                    <div className="space-y-3">
                      <label className="block">
                        <span className={pillLabel}>{t('widget.from')}</span>
                        <div className={pillField}>
                          <MapPin size={16} className="text-white/60 flex-shrink-0" />
                          <input
                            value={from}
                            onChange={(e) => {
                              setFrom(e.target.value);
                              setActiveField('from');
                              setShowSuggest(true);
                            }}
                            onFocus={() => {
                              setActiveField('from');
                              setShowSuggest(true);
                            }}
                            placeholder={t('widget.from_placeholder')}
                            data-testid="booking-widget-pill-from"
                            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-white placeholder:text-white/40"
                          />
                        </div>
                      </label>

                      <label className="block">
                        <span className={pillLabel}>{t('widget.to')}</span>
                        <div className={pillField}>
                          <Navigation size={16} className="text-white/60 flex-shrink-0" />
                          <input
                            value={to}
                            onChange={(e) => {
                              setTo(e.target.value);
                              setActiveField('to');
                              setShowSuggest(true);
                            }}
                            onFocus={() => {
                              setActiveField('to');
                              setShowSuggest(true);
                            }}
                            placeholder={t('widget.to_placeholder')}
                            role="combobox"
                            aria-expanded={showSuggest}
                            aria-controls="booking-widget-pill-suggest"
                            data-testid="booking-widget-pill-to"
                            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-white placeholder:text-white/40"
                          />
                        </div>
                      </label>
                    </div>
                  ) : (
                    <label className="block">
                      <span className={pillLabel}>{t('widget.destination')}</span>
                      <div className={pillField}>
                        <MapPin size={16} className="text-white/60 flex-shrink-0" />
                        <input
                          value={q}
                          onChange={(e) => {
                            setQ(e.target.value);
                            setActiveField('q');
                            setShowSuggest(true);
                          }}
                          onFocus={() => {
                            setActiveField('q');
                            setShowSuggest(true);
                          }}
                          placeholder={t('widget.destination_placeholder')}
                          role="combobox"
                          aria-expanded={showSuggest}
                          aria-controls="booking-widget-pill-suggest"
                          data-testid="booking-widget-pill-where"
                          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-white placeholder:text-white/40"
                        />
                        {q && (
                          <button type="button" onClick={() => setQ('')} className="text-white/40 p-1">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </label>
                  )}

                  {/* Suggestions List */}
                  {showSuggest && (
                    <div
                      id="booking-widget-pill-suggest"
                      data-testid="booking-widget-pill-suggest"
                      className="p-3 bg-white/5 border border-white/10 rounded-2xl space-y-2"
                    >
                      {placeMatches.length > 0 && (
                        <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                          {t('widget.popular')}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {placeMatches.slice(0, 10).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickPlace(p)}
                            data-testid={`booking-widget-pill-place-${p}`}
                            className="px-3 py-1.5 rounded-full border border-white/20 bg-white/10 text-xs font-bold text-white active:bg-white/30"
                          >
                            {p}
                          </button>
                        ))}
                      </div>

                      {(matching || matches.length > 0) && (
                        <div className="flex items-center gap-1.5 pt-2 text-[10px] font-bold uppercase tracking-widest text-white/60 border-t border-white/10">
                          {t('widget.matching')}
                          {matching && <Loader2 size={11} className="animate-spin" />}
                        </div>
                      )}
                      {matches.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setPanelOpen(false);
                            nav(`/listing/${m.id}`);
                          }}
                          data-testid={`booking-widget-pill-listing-${m.id}`}
                          className="w-full flex items-start gap-2.5 px-2 py-2 rounded-xl text-left text-white active:bg-white/10"
                        >
                          <Search size={14} className="flex-shrink-0 mt-1 text-white/60" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-bold truncate">{m.title}</span>
                            <span className="block text-xs text-white/60 truncate">{m.location}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Dates */}
                  {tab === 'driver' ? (
                    <label className="block">
                      <span className={pillLabel}>{t('widget.date')}</span>
                      <div className={pillField}>
                        <Calendar size={16} className="text-white/60 flex-shrink-0" />
                        <input
                          type="date"
                          value={checkIn}
                          min={today}
                          onChange={(e) => pickCheckIn(e.target.value)}
                          data-testid="booking-widget-date"
                          className="flex-1 min-w-0 bg-transparent outline-none text-sm text-white [color-scheme:dark]"
                        />
                      </div>
                    </label>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block min-w-0">
                        <span className={pillLabel}>{t('booking.checkin')}</span>
                        <div className={pillField}>
                          <input
                            type="date"
                            value={checkIn}
                            min={today}
                            onChange={(e) => pickCheckIn(e.target.value)}
                            data-testid="booking-widget-checkin"
                            className="w-full bg-transparent outline-none text-xs text-white [color-scheme:dark]"
                          />
                        </div>
                      </label>

                      <label className="block min-w-0">
                        <span className={pillLabel}>{t('booking.checkout')}</span>
                        <div className={pillField}>
                          <input
                            type="date"
                            value={checkOut}
                            min={checkIn ? addDays(checkIn, 1) : today}
                            onChange={(e) => setCheckOut(e.target.value)}
                            data-testid="booking-widget-checkout"
                            className="w-full bg-transparent outline-none text-xs text-white [color-scheme:dark]"
                          />
                        </div>
                      </label>
                    </div>
                  )}

                  {/* Guests */}
                  <div>
                    <span className={pillLabel}>{t('widget.number_of_guests')}</span>
                    <div className={`${pillField} justify-between`}>
                      <div className="flex items-center gap-2">
                        <Users size={16} className="text-white/60 flex-shrink-0" />
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={String(MAX_GUESTS).length}
                          aria-label={t('widget.number_of_guests')}
                          value={guests}
                          onChange={(e) => changeGuests(typedGuests(e.target.value))}
                          onBlur={() => setGuests(String(guestCount))}
                          data-testid="booking-widget-guests"
                          className="w-10 bg-transparent outline-none text-sm font-bold text-center text-white"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => changeGuests(String(Math.max(1, guestCount - 1)))}
                          disabled={guestCount <= 1}
                          aria-label={t('widget.guests_less')}
                          data-testid="booking-widget-guests-minus"
                          className="w-8 h-8 rounded-full border border-white/25 grid place-items-center text-white active:scale-95 disabled:opacity-30"
                        >
                          <Minus size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => changeGuests(String(Math.min(MAX_GUESTS, guestCount + 1)))}
                          disabled={guestCount >= MAX_GUESTS}
                          aria-label={t('widget.guests_more')}
                          data-testid="booking-widget-guests-plus"
                          className="w-8 h-8 rounded-full border border-white/25 grid place-items-center text-white active:scale-95 disabled:opacity-30"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sticky Bottom Search CTA */}
                <div className="p-4 bg-[#14201A] border-t border-white/10 flex-shrink-0">
                  <button
                    type="submit"
                    data-testid="booking-widget-panel-search"
                    className="w-full py-3.5 rounded-full bg-flag text-white font-extrabold flex items-center justify-center gap-2 active:scale-98 shadow-lg"
                  >
                    <Search size={18} /> {t('widget.search')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
