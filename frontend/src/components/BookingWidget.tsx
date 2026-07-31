import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, MapPin, Navigation, Calendar, Users, Home as HomeIcon, Car, Loader2, Minus, Plus } from 'lucide-react';
import api from '@/lib/api';
import { todayStr, addDays, isBadRange } from '@/lib/dates';

// Offered the moment the field is focused, so an empty search still has
// somewhere to go. Filtered against whatever gets typed after that.
/**
 * Everything the destination field will suggest: towns, viewpoints,
 * monasteries, tea estates, nurseries and parks across the Darjeeling,
 * Kurseong and Kalimpong subdivisions.
 *
 * `alt` holds the spellings and older names people actually type - Delo for
 * Deolo, Durbin for Durpin, Jelep La for Jelepla. They match but never display,
 * so a chip stays short while the field still finds the place.
 */
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

/**
 * The shortlist offered before anything is typed. The full gazetteer as chips
 * would bury the field it sits under, so the empty state stays to the handful
 * of places most people arrive looking for; the rest surface as they type.
 */
const POPULAR = ['Darjeeling', 'Kalimpong', 'Kurseong', 'Mirik', 'Tiger Hill', 'Ghum'];

/** Case-insensitive substring match over a place's name and its aliases. */
function placeMatchesTerm(place: { name: string; alt?: string[] }, needle: string): boolean {
  if (place.name.toLowerCase().includes(needle)) return true;
  return (place.alt || []).some((a) => a.toLowerCase().includes(needle));
}

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
 * One shape everywhere: a compact glass pill that opens a single panel holding
 * the category tabs, place suggestions, dates and guest steppers. Desktop only
 * caps the pill's width so it reads as a search bar, not a toolbar.
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

  // The widget is one panel rather than four independent popovers, so it
  // needs one flag. `showSuggest` only governs the place list inside it.
  const [panelOpen, setPanelOpen] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [matches, setMatches] = useState([]);
  const [matching, setMatching] = useState(false);
  const pillRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      // Tapping away from the bar puts it back to its resting state so the
      // hero isn't left half-covered.
      if (pillRef.current && !pillRef.current.contains(event.target)) {
        setPanelOpen(false);
        setShowSuggest(false);
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
    { key: 'stay', label: t('nav.stays', 'Stays'), Icon: HomeIcon, target: '/homestays', type: 'homestay' },
    { key: 'driver', label: t('nav.drivers'), Icon: Car, target: '/drivers', type: 'driver' },
  ];
  const activeTab = tabs.find((x) => x.key === tab) ?? tabs[0];

  const [activeField, setActiveField] = useState<'q' | 'from' | 'to'>('q');

  const currentField = tab === 'stay' ? 'q' : (activeField === 'from' ? 'from' : 'to');
  const term = currentField === 'from' ? from : currentField === 'to' ? to : q;
  const setTerm = currentField === 'from' ? setFrom : currentField === 'to' ? setTo : setQ;

  // Curated places matching what's typed against the full gazetteer (name & alt);
  // defaults to POPULAR when empty so focusing immediately offers top destinations.
  const needle = term.trim().toLowerCase();
  const placeMatches = needle
    ? PLACES.filter((p) => placeMatchesTerm(p, needle)).map((p) => p.name)
    : POPULAR;

  // Real listings behind the typed text, debounced so a fast typist doesn't
  // fire a request per keystroke. Scoped to the tab's type, so the stays tab
  // can't suggest a driver - or any other category - as a match.
  useEffect(() => {
    if (!panelOpen || !showSuggest) return;
    const needle = term.trim();
    if (needle.length < 2) { setMatches([]); setMatching(false); return; }

    setMatching(true);
    const timer = setTimeout(() => {
      api.get('/listings', {
        params: { q: needle, limit: 5, type: activeTab.type },
      })
        .then((r) => setMatches(r.data.items || []))
        .catch(() => setMatches([]))
        .finally(() => setMatching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [panelOpen, showSuggest, term, activeTab.type]);

  const today = todayStr();

  // A check-in that jumps past the chosen check-out invalidates it, so the
  // stale half of the range is dropped instead of being left on screen.
  const pickCheckIn = (value) => {
    setCheckIn(value);
    if (isBadRange(value, checkOut)) setCheckOut('');
  };

  const pickPlace = (name) => {
    setTerm(name);
    setShowSuggest(false);
  };

  // The bar sits mid-hero, so opening the panel where it stands leaves it
  // running off the bottom of the screen. Pull the bar up under the header
  // first and the panel gets the rest of the viewport.
  const togglePanel = () => {
    const opening = !panelOpen;
    setPanelOpen(opening);
    if (!opening) setShowSuggest(false);
    else requestAnimationFrame(() => {
      pillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // Shared field chrome for the phone panel, so its six inputs read as one set.
  const pillLabel = 'text-[10px] font-bold uppercase tracking-wider text-ink-soft';
  const pillField = 'mt-1 flex items-center gap-2 border border-[var(--line)] rounded-xl px-3 py-2.5';

  /**
   * What the collapsed bar says once something has been chosen: place, then
   * dates, then guests, skipping whatever is still empty. Empty string means
   * nothing is set and the placeholder should show instead.
   *
   * Guests only ever qualifies a query - it never starts one. It defaults to 2,
   * so counting it would leave the bar reading "2 Guests" on a first visit,
   * where the visitor has chosen nothing and needs the "Search" prompt.
   */
  const summaryPlace = tab === 'driver'
    ? [from.trim(), to.trim()].filter(Boolean).join(' → ')
    : q.trim();
  const summaryDates = (checkIn || checkOut) ? formatDates() : '';
  const summary = (summaryPlace || summaryDates)
    ? [
        summaryPlace,
        summaryDates,
        guestCount > 1 ? t('widget.guest_count', { count: guestCount }) : '',
      ].filter(Boolean).join('  ·  ')
    : '';

  // The tab isn't a hint, it's the scope: a stays search returns homestays and
  // nothing else, a driver search returns drivers and nothing else. Every query
  // therefore carries the tab's type, and an empty one falls through to that
  // category's own page.
  const submit = (e) => {
    e.preventDefault();
    const active = activeTab;
    const params = new URLSearchParams({ type: active.type });

    if (tab === 'driver') {
      const a = from.trim();
      const b = to.trim();
      if (!a && !b) return nav(active.target);
      // The route, not free text: a driver's title and location say where they
      // live, not where they drive, so matching `q` against them dropped the
      // drivers who actually run the trip. /search reads from/to against each
      // driver's own routes instead.
      if (a) params.set('from', a);
      if (b) params.set('to', b);
      return nav(`/search?${params}`);
    }

    const where = q.trim();
    if (!where) return nav(active.target);
    params.set('q', where);
    return nav(`/search?${params}`);
  };

  return (
    <form onSubmit={submit} data-testid="booking-widget">
      {/* ---- One search bar, everything else in a sheet below ------------- */}
      {/* The bar asks one question - where - and holds nothing but the place
          icon, the term and the submit. Dates, guests and the category used to
          sit inline as four more tap targets in a 340px-wide pill, each with
          its own popover; they now live in a single white panel that opens
          under the bar, so the resting state reads as a search box rather than
          a toolbar. */}
      {/* scroll-mt clears the fixed hero header when opening pulls the bar up. */}
      {/* Full container width on md+ so the bar's right edge meets the header's
          login CTA. The hero pads with px-8 where the header uses px-6, so the
          extra 0.5rem is given back on the right to line the two edges up. */}
      <div
        ref={pillRef}
        data-testid="booking-widget-pill"
        className="relative md:-mr-2 scroll-mt-[calc(var(--header-h)+0.75rem)]"
      >
        <div
          className="flex items-center gap-1 rounded-full pl-4 pr-1.5 py-1.5
                     bg-black/60 backdrop-blur-lg border border-white/20
                     shadow-[0_12px_36px_-10px_rgba(0,0,0,0.7)]"
        >
          <button
            type="button"
            onClick={togglePanel}
            aria-expanded={panelOpen}
            aria-controls="booking-widget-panel-mobile"
            data-testid="booking-widget-pill-open"
            className="flex items-center gap-2.5 min-w-0 flex-1 py-2 text-left
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-full"
          >
            <MapPin size={17} className="flex-shrink-0 text-white/70" />
            {/* Once anything is chosen the bar summarises it, so the visitor can
                see their query without reopening the panel. */}
            <span className={`truncate text-sm ${summary ? 'font-semibold text-white' : 'text-white/60'}`}>
              {summary || t('widget.search_short')}
            </span>
          </button>

          <button
            type="submit"
            data-testid="booking-widget-search-compact"
            aria-label={t('widget.search')}
            className="flex-shrink-0 w-11 h-11 rounded-full bg-flag text-white
                       flex items-center justify-center btn-hover shadow-md"
          >
            <Search size={18} />
          </button>
        </div>

        {panelOpen && (
          <div
            id="booking-widget-panel-mobile"
            data-testid="booking-widget-pill-panel"
            className="absolute left-0 right-0 top-full mt-2 z-50 bg-white border border-[var(--line)]
                       rounded-3xl shadow-2xl p-4 overflow-y-auto
                       max-h-[calc(100dvh-var(--header-h)-var(--bottom-nav-h)-6rem)]
                       lg:max-h-[calc(100dvh-var(--header-h)-6rem)]
                       animate-in fade-in slide-in-from-top-2 duration-200"
          >
            {/* What you're looking for. Drives which fields the rest shows. */}
            <div role="tablist" aria-label={t('widget.change_category')} className="flex gap-1 p-1 rounded-full bg-mist">
              {tabs.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  data-testid={`booking-widget-tab-${key}-menu`}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-full text-sm font-bold transition-colors
                    ${tab === key ? 'bg-white text-pine shadow-sm' : 'text-ink-soft'}`}
                >
                  <Icon size={15} className="flex-shrink-0" /> {label}
                </button>
              ))}
            </div>

            {/* Where. Drivers sell a journey, so that tab asks for both ends. */}
            {tab === 'driver' ? (
              <>
                <label className="block mt-4">
                  <span className={pillLabel}>{t('widget.from')}</span>
                  <div className={pillField}>
                    <MapPin size={15} className="text-ink-soft flex-shrink-0" />
                    <input
                      value={from}
                      onChange={(e) => { setFrom(e.target.value); setActiveField('from'); setShowSuggest(true); }}
                      onFocus={() => { setActiveField('from'); setShowSuggest(true); }}
                      placeholder={t('widget.from_placeholder')}
                      data-testid="booking-widget-pill-from"
                      className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                    />
                  </div>
                </label>

                <label className="block mt-4">
                  <span className={pillLabel}>{t('widget.to')}</span>
                  <div className={pillField}>
                    <Navigation size={15} className="text-ink-soft flex-shrink-0" />
                    <input
                      value={to}
                      onChange={(e) => { setTo(e.target.value); setActiveField('to'); setShowSuggest(true); }}
                      onFocus={() => { setActiveField('to'); setShowSuggest(true); }}
                      placeholder={t('widget.to_placeholder')}
                      role="combobox"
                      aria-expanded={showSuggest}
                      aria-controls="booking-widget-pill-suggest"
                      data-testid="booking-widget-pill-to"
                      className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                    />
                  </div>
                </label>
              </>
            ) : (
              <label className="block mt-4">
                <span className={pillLabel}>{t('widget.destination')}</span>
                <div className={pillField}>
                  <MapPin size={15} className="text-ink-soft flex-shrink-0" />
                  <input
                    value={q}
                    onChange={(e) => { setQ(e.target.value); setActiveField('q'); setShowSuggest(true); }}
                    onFocus={() => { setActiveField('q'); setShowSuggest(true); }}
                    placeholder={t('widget.destination_placeholder')}
                    role="combobox"
                    aria-expanded={showSuggest}
                    aria-controls="booking-widget-pill-suggest"
                    data-testid="booking-widget-pill-where"
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                  />
                </div>
              </label>
            )}

            {/* Suggestions sit inline under the field rather than in their own
                layer - the panel is already the layer. onMouseDown is prevented
                so choosing one doesn't blur the input first. */}
            {showSuggest && (
              <div id="booking-widget-pill-suggest" data-testid="booking-widget-pill-suggest" className="mt-2">
                {placeMatches.length > 0 && (
                  <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-ink-soft">
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
                      className="px-3 py-1.5 rounded-full border border-[var(--line)] bg-white text-xs font-bold text-ink hover:border-pine/40"
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {(matching || matches.length > 0) && (
                  <div className="flex items-center gap-1.5 px-1 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-ink-soft">
                    {t('widget.matching')}
                    {matching && <Loader2 size={11} className="animate-spin" />}
                  </div>
                )}
                {matches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setPanelOpen(false); nav(`/listing/${m.id}`); }}
                    data-testid={`booking-widget-pill-listing-${m.id}`}
                    className="w-full flex items-start gap-2 px-2 py-2 rounded-xl text-left text-ink hover:bg-black/5"
                  >
                    <Search size={14} className="flex-shrink-0 mt-0.5 text-ink-soft" />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold truncate">{m.title}</span>
                      <span className="block text-xs text-ink-soft truncate">{m.location}</span>
                    </span>
                  </button>
                ))}

                {!matching && !placeMatches.length && !matches.length && (
                  <div className="px-1 py-2 text-sm text-ink-soft">{t('widget.no_matches')}</div>
                )}
              </div>
            )}

            {/* When. A stay spans nights; a driver is booked for a single day. */}
            {tab === 'driver' ? (
              <label className="block mt-4">
                <span className={pillLabel}>{t('widget.date')}</span>
                <div className={pillField}>
                  <Calendar size={15} className="text-ink-soft flex-shrink-0" />
                  <input
                    type="date"
                    value={checkIn}
                    min={today}
                    onChange={(e) => pickCheckIn(e.target.value)}
                    data-testid="booking-widget-date"
                    className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                  />
                </div>
              </label>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={pillLabel}>{t('booking.checkin')}</span>
                  <div className={pillField}>
                    <input
                      type="date"
                      value={checkIn}
                      min={today}
                      onChange={(e) => pickCheckIn(e.target.value)}
                      data-testid="booking-widget-checkin"
                      className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                    />
                  </div>
                </label>
                <label className="block">
                  <span className={pillLabel}>{t('booking.checkout')}</span>
                  <div className={pillField}>
                    <input
                      type="date"
                      value={checkOut}
                      min={checkIn ? addDays(checkIn, 1) : today}
                      onChange={(e) => setCheckOut(e.target.value)}
                      data-testid="booking-widget-checkout"
                      className="flex-1 min-w-0 bg-transparent outline-none text-sm"
                    />
                  </div>
                </label>
              </div>
            )}

            {/* How many. Steppers rather than a bare number field - the common
                case is one or two taps, and typing stays available for the rest. */}
            <div className="mt-4">
              <span className={pillLabel}>{t('widget.number_of_guests')}</span>
              <div className={`${pillField} justify-between`}>
                <Users size={15} className="text-ink-soft flex-shrink-0" />
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={String(MAX_GUESTS).length}
                  aria-label={t('widget.number_of_guests')}
                  value={guests}
                  onChange={(e) => setGuests(typedGuests(e.target.value))}
                  onBlur={() => setGuests(String(guestCount))}
                  data-testid="booking-widget-guests"
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm text-center"
                />
                <span className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setGuests(String(Math.max(1, guestCount - 1)))}
                    disabled={guestCount <= 1}
                    aria-label={t('widget.guests_less')}
                    data-testid="booking-widget-guests-minus"
                    className="w-8 h-8 rounded-full border border-[var(--line)] grid place-items-center text-ink disabled:opacity-40"
                  >
                    <Minus size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuests(String(Math.min(MAX_GUESTS, guestCount + 1)))}
                    disabled={guestCount >= MAX_GUESTS}
                    aria-label={t('widget.guests_more')}
                    data-testid="booking-widget-guests-plus"
                    className="w-8 h-8 rounded-full border border-[var(--line)] grid place-items-center text-ink disabled:opacity-40"
                  >
                    <Plus size={14} />
                  </button>
                </span>
              </div>
            </div>

            <button
              type="submit"
              data-testid="booking-widget-panel-search"
              className="mt-5 w-full py-3 rounded-full bg-flag text-white font-extrabold btn-hover
                         inline-flex items-center justify-center gap-2"
            >
              <Search size={16} /> {t('widget.search')}
            </button>
          </div>
        )}
      </div>

    </form>
  );
}
