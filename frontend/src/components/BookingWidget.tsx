import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, MapPin, Navigation, Calendar, Users, Home as HomeIcon, Car, ChevronDown, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { todayStr, addDays, isBadRange } from '@/lib/dates';

// Offered the moment the field is focused, so an empty search still has
// somewhere to go. Filtered against whatever gets typed after that.
const POPULAR = [
  'Darjeeling', 'Ghum', 'Tiger Hill', 'Mirik',
  'Kurseong', 'Lamahatta', 'Takdah', 'Lepchajagat',
];

// Two digits is all the pill's guest segment has room for - a third pushes the
// count into the search button and breaks the bar's layout on a phone. It is
// also well past any real party size for a hill homestay.
const MAX_GUESTS = 99;

// `max` alone only marks a typed 250 invalid; the value still lands in state
// and renders, so the ceiling has to be held on the way in.
//
// Keeping to two digits is what does that, rather than clamping the number:
// clamping meant an empty box refilled with "1" on the very next keystroke, so
// typing 2 then 2 built "1" -> "12" -> "122" and landed on 99. An empty string
// is therefore a legal editing state here, resolved to 1 on blur.
const typedGuests = (raw) => raw.replace(/\D/g, '').slice(0, String(MAX_GUESTS).length);

/**
 * MakeMyTrip-inspired booking widget.
 *
 * Two shapes from one form: phones get a compact glass pill that answers each
 * question in its own small dropdown, desktop gets the tabs + single-row panel
 * it always had. Both drive the same state, so nothing is lost by collapsing.
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
  // Holds what's in the box, so it can legally be '' mid-edit. `guestCount` is
  // the number every display and caller should read.
  const [guests, setGuests] = useState('2');
  const guestCount = parseInt(guests, 10) || 1;

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGuestsPicker, setShowGuestsPicker] = useState(false);
  const [showTabMenu, setShowTabMenu] = useState(false);
  // The pill's own popovers, separate from the panel's so the two copies of
  // each picker can't both be open against a single shared flag.
  const [pillDates, setPillDates] = useState(false);
  const [pillGuests, setPillGuests] = useState(false);
  const [pillSearch, setPillSearch] = useState(false);
  const [matches, setMatches] = useState([]);
  const [matching, setMatching] = useState(false);
  const pillRef = useRef(null);
  const dateRef = useRef(null);
  const guestsRef = useRef(null);
  const tabMenuRef = useRef(null);
  const pillGuestInputRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dateRef.current && !dateRef.current.contains(event.target)) {
        setShowDatePicker(false);
      }
      if (guestsRef.current && !guestsRef.current.contains(event.target)) {
        setShowGuestsPicker(false);
      }
      if (tabMenuRef.current && !tabMenuRef.current.contains(event.target)) {
        setShowTabMenu(false);
      }
      // Tapping away from the pill puts the phone layout back to its resting
      // state so the hero isn't left half-covered.
      if (pillRef.current && !pillRef.current.contains(event.target)) {
        setPillDates(false);
        setPillGuests(false);
        setPillSearch(false);
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
    { key: 'stay', label: t('nav.stays', 'Stays'), Icon: HomeIcon, target: '/homestays' },
    { key: 'driver', label: t('nav.drivers'), Icon: Car, target: '/drivers' },
  ];
  const activeTab = tabs.find((x) => x.key === tab) ?? tabs[0];

  // The pill types into whichever field that tab actually searches on: the
  // destination for stays, the far end of the route for drivers.
  const term = tab === 'driver' ? to : q;
  const setTerm = tab === 'driver' ? setTo : setQ;

  // Curated places matching what's typed; all of them while it's empty, so
  // focusing the field immediately offers somewhere to go.
  const placeMatches = term.trim()
    ? POPULAR.filter((p) => p.toLowerCase().includes(term.trim().toLowerCase()))
    : POPULAR;

  // Real listings behind the typed text, debounced so a fast typist doesn't
  // fire a request per keystroke.
  useEffect(() => {
    if (!pillSearch) return;
    const needle = term.trim();
    if (needle.length < 2) { setMatches([]); setMatching(false); return; }

    setMatching(true);
    const timer = setTimeout(() => {
      api.get('/listings', {
        params: { q: needle, type: tab === 'driver' ? 'driver' : undefined, limit: 5 },
      })
        .then((r) => setMatches(r.data.items || []))
        .catch(() => setMatches([]))
        .finally(() => setMatching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [pillSearch, term, tab]);

  // Only one of the pill's dropdowns is ever open at a time.
  const openOnly = (which) => {
    setShowTabMenu(which === 'tab');
    setPillDates(which === 'dates');
    setPillGuests(which === 'guests');
    setPillSearch(which === 'search');
  };

  // Each segment answers in its own small dropdown rather than unfolding a
  // panel over the hero, so only what was asked for is ever on screen.
  const togglePillDates = () => openOnly(pillDates ? null : 'dates');

  const togglePillGuests = () => {
    const opening = !pillGuests;
    openOnly(opening ? 'guests' : null);
    // Land in the field with the current count selected, so typing a new
    // number replaces it rather than appending to it.
    if (opening) {
      requestAnimationFrame(() => {
        pillGuestInputRef.current?.focus();
        pillGuestInputRef.current?.select();
      });
    }
  };

  const today = todayStr();

  // A check-in that jumps past the chosen check-out invalidates it, so the
  // stale half of the range is dropped instead of being left on screen.
  const pickCheckIn = (value) => {
    setCheckIn(value);
    if (isBadRange(value, checkOut)) setCheckOut('');
  };

  const pickPlace = (name) => {
    setTerm(name);
    setPillSearch(false);
  };

  const submit = (e) => {
    e.preventDefault();
    const active = activeTab;

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

  const fieldLabel = "text-[11px] font-bold uppercase tracking-wider text-ink-soft";
  const fieldBox = "mt-1 flex items-center gap-2 border border-[var(--line)] rounded-2xl px-3 py-2.5 md:py-3";
  // Shared shell for everything the pill drops open, so the category, date and
  // guest menus read as three of the same thing.
  const pillMenu = "absolute right-0 top-full mt-2 z-50 bg-white border border-[var(--line)] rounded-2xl shadow-xl";

  // Called rather than rendered as <DateFields />: a component declared in the
  // render body is a fresh type every pass, which would remount these inputs
  // and drop focus mid-edit. Inlining the JSX keeps them stable.
  const dateFields = (onDone, rowClass = "flex gap-2") => (
    <>
      <div className={rowClass}>
        <div className="flex-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">{t('booking.checkin')}</span>
          <input
            type="date"
            value={checkIn}
            min={today}
            onChange={(e) => pickCheckIn(e.target.value)}
            className="w-full mt-1 border border-[var(--line)] rounded-xl px-2 py-1.5 text-xs outline-none bg-transparent"
            data-testid="booking-widget-checkin"
          />
        </div>
        <div className="flex-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">{t('booking.checkout')}</span>
          {/* Nothing before the night after check-in is a stay, so that's where
              the picker starts. Check-out on its own is still allowed - the
              widget reads it as an open-ended "until" search. */}
          <input
            type="date"
            value={checkOut}
            min={checkIn ? addDays(checkIn, 1) : today}
            onChange={(e) => setCheckOut(e.target.value)}
            className="w-full mt-1 border border-[var(--line)] rounded-xl px-2 py-1.5 text-xs outline-none bg-transparent"
            data-testid="booking-widget-checkout"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="w-full py-1.5 bg-flag text-white font-bold text-xs rounded-xl hover:opacity-90 transition-opacity"
      >
        {t('widget.done')}
      </button>
    </>
  );

  // The panel's copy passes no ref; only the pill's needs to grab focus.
  const guestFields = (inputRef = null) => (
    <>
      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">{t('widget.number_of_guests')}</span>
      {/* text + inputMode rather than type=number: a number input reports '' for
          anything it considers invalid, which hides the digits actually typed
          and makes a two-digit cap impossible to enforce cleanly. The numeric
          keypad still comes up on a phone. */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        maxLength={String(MAX_GUESTS).length}
        aria-label={t('widget.number_of_guests')}
        value={guests}
        onChange={(e) => setGuests(typedGuests(e.target.value))}
        onBlur={() => setGuests(String(guestCount))}
        data-testid="booking-widget-guests"
        className="w-full border border-[var(--line)] rounded-xl px-2 py-1.5 text-xs outline-none bg-transparent"
      />
    </>
  );

  return (
    <form onSubmit={submit} data-testid="booking-widget">
      {/* ---- Phone: compact glass pill ------------------------------------ */}
      {/* Dark and translucent so the hero video reads through it. Each segment
          is its own button; the divider between them makes that legible. */}
      <div
        ref={pillRef}
        data-testid="booking-widget-pill"
        className="md:hidden relative flex items-center gap-1.5 rounded-full pl-3.5 pr-2 py-2
                   bg-black/60 backdrop-blur-lg border border-white/20
                   shadow-[0_12px_36px_-10px_rgba(0,0,0,0.7)]"
      >
        {/* Typed straight into the pill — the text never moves somewhere else
            to be edited, so the bar always reads as what will be searched. */}
        <div className="flex items-center gap-2 min-w-0 flex-1 pr-1">
          <MapPin size={16} className="flex-shrink-0 text-white/70" />
          <input
            value={term}
            onChange={(e) => { setTerm(e.target.value); openOnly('search'); }}
            onFocus={() => openOnly('search')}
            placeholder={t('widget.search_short')}
            role="combobox"
            aria-label={t('widget.destination')}
            aria-expanded={pillSearch}
            aria-controls="booking-widget-pill-suggest"
            data-testid="booking-widget-pill-where"
            className="w-full min-w-0 py-1 bg-transparent outline-none
                       text-sm font-semibold text-white placeholder:font-normal placeholder:text-white/60"
          />
        </div>

        {/* Divider between search input and category */}
        <span aria-hidden="true" className="w-px h-5 bg-white/20 flex-shrink-0" />

        {/* Category picker — the phone's stand-in for the desktop tab strip. */}
        <div ref={tabMenuRef} className="relative flex-shrink-0 px-0.5">
          <button
            type="button"
            onClick={() => openOnly(showTabMenu ? null : 'tab')}
            aria-expanded={showTabMenu}
            aria-label={t('widget.change_category')}
            data-testid="booking-widget-pill-tab"
            className="flex items-center gap-1.5 py-1 px-1.5 text-sm font-semibold text-white
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-full hover:bg-white/10 transition-colors"
          >
            <activeTab.Icon size={15} className="flex-shrink-0 text-white/80" />
            <span className="truncate max-w-[5.5rem]">{activeTab.label}</span>
            <ChevronDown size={14} className={`flex-shrink-0 text-white/70 transition-transform duration-200 ${showTabMenu ? 'rotate-180' : ''}`} />
          </button>
          {showTabMenu && (
            <div
              role="tablist"
              className={`${pillMenu} w-44 p-1.5 shadow-2xl`}
            >
              {tabs.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  data-testid={`booking-widget-tab-${key}-menu`}
                  onClick={() => { setTab(key); setShowTabMenu(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-left transition-colors
                    ${tab === key ? 'bg-flag/10 text-flag' : 'text-ink hover:bg-black/5'}`}
                >
                  <Icon size={16} className="flex-shrink-0" /> {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <span aria-hidden="true" className="w-px h-5 bg-white/20 flex-shrink-0" />

        <button
          type="button"
          onClick={togglePillDates}
          aria-expanded={pillDates}
          aria-label={t('widget.when')}
          data-testid="booking-widget-pill-dates"
          className={`flex-shrink-0 p-2 rounded-full transition-colors
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60
                     ${pillDates ? 'bg-white/20 text-white' : 'text-white/85 hover:bg-white/10'}`}
        >
          <Calendar size={16} />
        </button>

        <span aria-hidden="true" className="w-px h-5 bg-white/20 flex-shrink-0" />

        <button
          type="button"
          onClick={togglePillGuests}
          aria-expanded={pillGuests}
          aria-label={t('widget.guests')}
          data-testid="booking-widget-pill-guests"
          className={`flex items-center gap-1.5 flex-shrink-0 p-1.5 px-2 rounded-full transition-colors
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60
                     ${pillGuests ? 'bg-white/20 text-white' : 'text-white/85 hover:bg-white/10'}`}
        >
          <Users size={16} />
          {/* guestCount, not the raw field - the pill stays legible while the
              box behind it is momentarily empty. */}
          <span className="text-sm font-semibold text-white">{guestCount}</span>
        </button>

        <button
          type="submit"
          data-testid="booking-widget-search-compact"
          aria-label={t('widget.search')}
          className="flex-shrink-0 w-9 h-9 rounded-full bg-flag text-white ml-0.5
                     flex items-center justify-center btn-hover shadow-md"
        >
          <Search size={16} />
        </button>

        {/* Answered in place, in the same card the category menu uses. Dates
            take the pill's full width so check-in and check-out stay on one
            row — side by side is how a stay reads, and stacking them in a
            narrow card made two fields out of what is really one question. */}
        {pillDates && (
          <div
            data-testid="booking-widget-pill-datepicker"
            className={`${pillMenu} left-0 p-3 flex flex-col gap-2`}
          >
            {dateFields(() => setPillDates(false))}
          </div>
        )}

        {pillGuests && (
          <div
            data-testid="booking-widget-pill-guestpicker"
            className={`${pillMenu} w-44 p-3 flex flex-col gap-2`}
          >
            {guestFields(pillGuestInputRef)}
          </div>
        )}

        {/* Suggestions only — no form, nothing to fill in. Places jump straight
            into the search box; listings skip the results page entirely.
            onMouseDown is prevented so the tap doesn't blur the input first. */}
        {pillSearch && (
          <div
            id="booking-widget-pill-suggest"
            data-testid="booking-widget-pill-suggest"
            className="absolute left-0 right-0 w-full top-full mt-2 z-50 bg-white border border-[var(--line)] rounded-2xl shadow-2xl p-2 max-h-[22rem] overflow-y-auto"
          >
            {/* Drivers need both ends of the route, and the pill only has room
                for one. The origin rides along here. */}
            {tab === 'driver' && (
              <div className="p-2 pb-3 mb-1 border-b border-[var(--line)]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">{t('widget.from')}</span>
                <div className="mt-1 flex items-center gap-2 border border-[var(--line)] rounded-xl px-2.5 py-1.5">
                  <MapPin size={14} className="text-ink-soft flex-shrink-0" />
                  <input
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    placeholder={t('widget.from_placeholder')}
                    data-testid="booking-widget-pill-from"
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                  />
                </div>
              </div>
            )}

            {placeMatches.length > 0 && (
              <div className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-ink-soft">
                {t('widget.popular')}
              </div>
            )}
            {placeMatches.map((p) => (
              <button
                key={p}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickPlace(p)}
                data-testid={`booking-widget-pill-place-${p}`}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-left text-ink hover:bg-black/5"
              >
                <MapPin size={15} className="flex-shrink-0 text-ink-soft" /> {p}
              </button>
            ))}

            {(matching || matches.length > 0) && (
              <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-ink-soft border-t border-[var(--line)] mt-1">
                {t('widget.matching')}
                {matching && <Loader2 size={11} className="animate-spin" />}
              </div>
            )}
            {matches.map((m) => (
              <button
                key={m.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setPillSearch(false); nav(`/listing/${m.id}`); }}
                data-testid={`booking-widget-pill-listing-${m.id}`}
                className="w-full flex items-start gap-2 px-3 py-2 rounded-xl text-left text-ink hover:bg-black/5"
              >
                <Search size={15} className="flex-shrink-0 mt-0.5 text-ink-soft" />
                <span className="min-w-0">
                  <span className="block text-sm font-bold truncate">{m.title}</span>
                  <span className="block text-xs text-ink-soft truncate">{m.location}</span>
                </span>
              </button>
            ))}

            {!matching && !placeMatches.length && !matches.length && (
              <div className="px-3 py-3 text-sm text-ink-soft">{t('widget.no_matches')}</div>
            )}
          </div>
        )}
      </div>

      {/* ---- Desktop: raised folder tabs ---------------------------------- */}
      {/* They share the panel's white and butt straight up against its top
          edge, so the active one reads as continuous with the form below. */}
      <div className="hidden md:flex items-end gap-1.5" role="tablist">
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            data-testid={`booking-widget-tab-${key}`}
            onClick={() => setTab(key)}
            className={`relative md:px-14 rounded-t-2xl px-3 py-3.5 min-w-0
              flex items-center justify-center gap-2 text-sm font-bold
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

      {/* ---- Panel: collapsed on phones until the pill opens it ----------- */}
      {/* Top-left stays square so the first desktop tab merges into the panel. */}
      <div
        data-testid="booking-widget-panel"
        className="hidden md:grid md:grid-cols-12 md:gap-3 md:items-end
                   bg-white rounded-3xl rounded-tl-none rounded-tr-3xl
                   shadow-[0_20px_50px_-30px_rgba(20,32,26,0.35)] p-5"
      >
        {tab !== 'driver' && (
          <label className="block md:col-span-5">
            <span className={fieldLabel}>{t('widget.destination')}</span>
            <div className={fieldBox}>
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
              <span className={fieldLabel}>{t('widget.from')}</span>
              <div className={fieldBox}>
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
              <span className={fieldLabel}>{t('widget.to')}</span>
              <div className={fieldBox}>
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
            <span className={fieldLabel}>{t('widget.when')}</span>
            <button
              type="button"
              onClick={() => setShowDatePicker((v) => !v)}
              aria-expanded={showDatePicker}
              data-testid="booking-widget-when"
              className={`${fieldBox} w-full bg-white text-left`}
            >
              <Calendar size={16} className="text-ink-soft flex-shrink-0" />
              <span className="flex-1 min-w-0 text-sm md:text-base text-ink select-none truncate">
                {formatDates()}
              </span>
            </button>
            {showDatePicker && (
              <div className="absolute left-0 right-0 top-full mt-2 md:top-auto md:bottom-full md:mt-0 md:mb-2 p-4 bg-white border border-[var(--line)] rounded-2xl shadow-xl z-50 flex flex-col gap-3">
                {dateFields(() => setShowDatePicker(false))}
              </div>
            )}
          </div>
        )}

        {tab === 'driver' && (
          /* 3 + 3 (from/to) + 3 + 2 (guests) + 1 (button) = the 12-col row */
          <label className="block md:col-span-3">
            <span className={fieldLabel}>{t('widget.date')}</span>
            <div className={fieldBox}>
              <Calendar size={16} className="text-ink-soft flex-shrink-0" />
              <input type="date" value={checkIn} min={today} onChange={(e) => pickCheckIn(e.target.value)}
                data-testid="booking-widget-date"
                className="flex-1 min-w-0 bg-transparent outline-none text-sm md:text-base" />
            </div>
          </label>
        )}

        <div ref={guestsRef} className="block md:col-span-2 relative">
          <span className={fieldLabel}>{t('widget.guests')}</span>
          <button
            type="button"
            onClick={() => setShowGuestsPicker((v) => !v)}
            aria-expanded={showGuestsPicker}
            data-testid="booking-widget-guests-toggle"
            className={`${fieldBox} w-full bg-white text-left`}
          >
            <Users size={16} className="text-ink-soft flex-shrink-0" />
            <span className="flex-1 min-w-0 text-sm md:text-base text-ink select-none truncate">
              {t('widget.guest_count', { count: guestCount })}
            </span>
          </button>
          {showGuestsPicker && (
            <div className="absolute right-0 top-full mt-2 md:top-auto md:bottom-full md:mt-0 md:mb-2 p-4 bg-white border border-[var(--line)] rounded-2xl shadow-xl z-50 w-44 flex flex-col gap-2">
              {guestFields()}
            </div>
          )}
        </div>

        <button type="submit" data-testid="booking-widget-search"
          className="w-full md:col-span-1 py-3 md:py-3.5 rounded-2xl bg-flag text-white font-extrabold btn-hover flex items-center justify-center gap-2">
          <Search size={16} /> <span className="md:hidden">{t('widget.search')}</span>
        </button>
      </div>
    </form>
  );
}
