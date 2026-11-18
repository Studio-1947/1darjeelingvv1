import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MagnifyingGlass as Search, House as HomeIcon, Car, CircleNotch as Loader2, Minus, Plus, X } from '@phosphor-icons/react';
import api from '@/lib/api';
import { todayStr, addDays, isBadRange, formatDay, formatRange } from '@/lib/dates';
import { writeTrip } from '@/lib/tripParams';
import WeatherForecast from '@/components/WeatherForecast';
import { Box, Button, Chip, Chips, IconButton, Seg, TextField, cx } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';

/**
 * The search field's resting placeholder: "Search homestays", then cafes, drivers, viewpoints,
 * typed and deleted letter by letter as the prototype does. Held on the first word for people
 * who ask for reduced motion.
 */
const SEARCH_WORDS = ['Homestays', 'Drivers', 'Offbeat Places', 'Tour Guides', 'Cafes & Restaurants', 'Local Shops'];

function TypewriterHint() {
  const { t } = useTranslation();
  // The prototype's word list (v7.js "sw"): the six kinds of listing, typed one after another.
  const words = t('home.search_words', { returnObjects: true }) as unknown;
  const list = Array.isArray(words) && words.length ? (words as string[]) : SEARCH_WORDS;
  const key = list.join('|');
  const [shown, setShown] = useState(list[0]);
  useEffect(() => {
    setShown(list[0]);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    let i = 0;
    let pos = list[0].length;
    let deleting = true;
    let timer = 0;
    const tick = () => {
      const word = list[i % list.length];
      if (deleting) {
        pos -= 1;
        setShown(word.slice(0, Math.max(0, pos)));
        if (pos <= 0) { deleting = false; i += 1; pos = 0; timer = window.setTimeout(tick, 320); return; }
        timer = window.setTimeout(tick, 40);
        return;
      }
      pos += 1;
      setShown(word.slice(0, pos));
      if (pos >= word.length) { deleting = true; timer = window.setTimeout(tick, 1400); return; }
      timer = window.setTimeout(tick, 85);
    };
    timer = window.setTimeout(tick, 1400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return (
    <span className="ag-home-qph" aria-hidden="true" data-testid="search-hint">
      <span className="qtype">{shown}</span>
    </span>
  );
}

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
  const [focused, setFocused] = useState(false);

  const changeGuests = (value: string) => {
    setGuestsTouched(true);
    setGuests(value);
  };

  const [panelOpen, setPanelOpen] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [matches, setMatches] = useState<any[]>([]);
  const [matching, setMatching] = useState(false);
  const [activeField, setActiveField] = useState<'q' | 'from' | 'to'>('q');

  const containerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Voice search: the browser's own speech recognition, only where it exists (Chrome, Edge,
  // Safari). Elsewhere the mic is not drawn at all.
  const recRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const canListen = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  useEffect(() => () => { try { recRef.current?.stop(); } catch { /* already stopped */ } }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggest(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Escape closes the suggestions first, then the filter panel, like every other dialog on the site.
  useEffect(() => {
    if (!panelOpen && !showSuggest) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showSuggest) setShowSuggest(false); else setPanelOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen, showSuggest]);

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
      // The tab's own kind first; when nothing of that kind matches (a monastery on the Stays tab),
      // the closest matches of any kind, so the box never answers a real place with "nothing".
      api
        .get('/listings', { params: { q: searchNeedle, limit: 5, type: activeTab.type } })
        .then(async (r) => {
          const own = r.data.items || [];
          if (own.length || !activeTab.type) return own;
          const any = await api.get('/listings', { params: { q: searchNeedle, limit: 5 } });
          return any.data.items || [];
        })
        .then((items) => setMatches(items))
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

  // Under the row while the panel is shut: what the search will carry besides the place.
  const summaryRoute = tab === 'driver' && from.trim() ? [from.trim(), to.trim()].filter(Boolean).join(' → ') : '';
  const summary = [
    summaryRoute,
    checkIn || checkOut ? formatDates() : '',
    guestsTouched && guestCount > 1 ? t('widget.guest_count', { count: guestCount }) : '',
  ].filter(Boolean).join('  ·  ');

  const listen = () => {
    if (recRef.current) { try { recRef.current.stop(); } catch { /* already stopped */ } return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    const lang = (i18n.language || 'en').slice(0, 2);
    rec.lang = ({ hi: 'hi-IN', ne: 'ne-NP', bn: 'bn-IN' } as Record<string, string>)[lang] || 'en-IN';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (ev: any) => {
      const heard = Array.from(ev.results as ArrayLike<any>).map((r: any) => r[0]?.transcript || '').join(' ').trim();
      if (heard) setMain(heard);
    };
    rec.onend = () => { recRef.current = null; setListening(false); inputRef.current?.focus(); };
    rec.onerror = rec.onend;
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { rec.onend(); }
  };

  const submit = (e?: React.FormEvent) => {
    if (e?.preventDefault) e.preventDefault();
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

  // Whatever the visitor is typing as their destination, on whichever tab is active.
  const destinationQuery = tab === 'driver' ? (to.trim() || from.trim()) : q;

  // The search row holds the destination: the place on Stays, where to on Drivers.
  const mainValue = tab === 'driver' ? to : q;
  const setMain = (v: string) => {
    if (tab === 'driver') { setTo(v); setActiveField('to'); } else { setQ(v); setActiveField('q'); }
    setShowSuggest(true);
  };

  const suggestions = showSuggest && (
    <Box flat id="booking-widget-pill-suggest" data-testid="booking-widget-pill-suggest" className="!gap-2">
      {placeMatches.length > 0 && <span className="ag-eyebrow">{t('widget.popular')}</span>}
      {placeMatches.length > 0 && (
        <Chips>
          {placeMatches.slice(0, 10).map((p) => (
            <Chip
              key={p}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickPlace(p)}
              data-testid={`booking-widget-pill-place-${p}`}
            >
              {p}
            </Chip>
          ))}
        </Chips>
      )}

      {(matching || matches.length > 0) && (
        <span className="ag-eyebrow mt-1 flex items-center gap-1.5">
          {t('widget.matching')}
          {matching && <Loader2 size={12} className="animate-spin" />}
        </span>
      )}
      {matches.length > 0 && (
        <div className="ag-menu">
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
            >
              <span className="ag-micon" aria-hidden="true"><Search /></span>
              <span className="ag-mlab">
                <span className="truncate">{m.title}</span>
                <span className="ag-small truncate">{m.location}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {!matching && !placeMatches.length && !matches.length && (
        <p className="ag-small m-0">{t('widget.no_matches')}</p>
      )}
    </Box>
  );

  return (
    <form ref={containerRef} onSubmit={submit} data-testid="booking-widget" className="flex w-full flex-col gap-3">
      {/* The search row (prototype v7 home): a red 56px pill with the typed hint, then a round mic
          (only where the browser can listen) and the round filter button that opens Stays / Drivers,
          dates and guests. */}
      <div className="ag-home-searchrow" data-testid="booking-widget-pill" data-home-search>
        <div className="ag-home-search">
          <button type="submit" data-testid="booking-widget-search-compact" aria-label={t('widget.search')} className="qbtn">
            <Icon name="search" />
          </button>
          <span className="qbox">
            <input
              ref={inputRef}
              value={mainValue}
              onChange={(e) => setMain(e.target.value)}
              onFocus={() => {
                setFocused(true);
                setActiveField(tab === 'driver' ? 'to' : 'q');
                setShowSuggest(true);
              }}
              onBlur={() => setFocused(false)}
              type="search"
              enterKeyHint="search"
              placeholder={focused ? (tab === 'driver' ? t('widget.to_placeholder') : t('widget.destination_placeholder')) : ''}
              aria-label={tab === 'driver' ? t('widget.to') : t('widget.destination')}
              role="combobox"
              aria-expanded={showSuggest}
              aria-controls="booking-widget-pill-suggest"
              data-testid={tab === 'driver' ? 'booking-widget-pill-to' : 'booking-widget-pill-where'}
            />
            {!mainValue && !focused && <TypewriterHint />}
          </span>
          {mainValue && (
            <button type="button" onClick={() => setMain('')} aria-label={t('ui.categoryFilterBar.clear_search')} className="qclear">
              <Icon name="x" />
            </button>
          )}
        </div>
        {canListen && (
          <button
            type="button"
            className={cx('ag-home-round', listening && 'on')}
            aria-label={t('home.voice', 'Voice search')}
            aria-pressed={listening}
            onClick={listen}
            data-testid="booking-widget-voice"
          >
            <Icon name="mic" />
          </button>
        )}
        <button
          type="button"
          className={cx('ag-home-round', panelOpen && 'on')}
          aria-label={t('filter.filters', 'Filters')}
          title={t('filter.filters', 'Filters')}
          onClick={togglePanel}
          aria-expanded={panelOpen}
          aria-controls="booking-widget-panel"
          data-testid="booking-widget-pill-open"
        >
          <Icon name="filter" />
        </button>
      </div>

      {activeField !== 'from' && suggestions}

      {!panelOpen && summary && (
        <p className="ag-small m-0" data-testid="booking-widget-summary">{activeTab.label}  ·  {summary}</p>
      )}

      {panelOpen && (
        <Box id="booking-widget-panel" data-testid="booking-widget-pill-panel">
          <div className="flex items-center gap-2">
            <Seg
              label={t('widget.change_category')}
              value={tab}
              onChange={(key) => { setTab(key); setShowSuggest(false); }}
              options={tabs.map(({ key, label, Icon }) => ({ value: key, label, icon: <Icon size={16} />, testId: `booking-widget-tab-${key}-menu` }))}
              className="flex-1"
            />
            <IconButton label={t('ui.bookingWidget.close_search')} onClick={() => setPanelOpen(false)}>
              <X />
            </IconButton>
          </div>

          {tab === 'driver' ? (
            <>
              <TextField
                label={t('widget.from')}
                value={from}
                onChange={(e) => { setFrom(e.target.value); setActiveField('from'); setShowSuggest(true); }}
                onFocus={() => { setActiveField('from'); setShowSuggest(true); }}
                placeholder={t('widget.from_placeholder')}
                data-testid="booking-widget-pill-from"
                autoComplete="off"
              />
              {activeField === 'from' && suggestions}
              <TextField
                label={t('widget.date')}
                type="date"
                value={checkIn}
                min={today}
                onChange={(e) => pickCheckIn(e.target.value)}
                data-testid="booking-widget-date"
              />
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <TextField
                label={t('booking.checkin')}
                type="date"
                value={checkIn}
                min={today}
                onChange={(e) => pickCheckIn(e.target.value)}
                data-testid="booking-widget-checkin"
                className="min-w-0"
              />
              <TextField
                label={t('booking.checkout')}
                type="date"
                value={checkOut}
                min={checkIn ? addDays(checkIn, 1) : today}
                onChange={(e) => setCheckOut(e.target.value)}
                data-testid="booking-widget-checkout"
                className="min-w-0"
              />
            </div>
          )}

          <div className="ag-stepper">
            <span className="ag-field">{t('widget.number_of_guests')}</span>
            <span className="flex items-center gap-2">
              <IconButton
                label={t('widget.guests_less')}
                onClick={() => changeGuests(String(Math.max(1, guestCount - 1)))}
                disabled={guestCount <= 1}
                data-testid="booking-widget-guests-minus"
                className="disabled:opacity-40"
              >
                <Minus />
              </IconButton>
              <input
                type="text"
                inputMode="numeric"
                maxLength={String(MAX_GUESTS).length}
                aria-label={t('widget.number_of_guests')}
                value={guests}
                onChange={(e) => changeGuests(typedGuests(e.target.value))}
                onBlur={() => setGuests(String(guestCount))}
                data-testid="booking-widget-guests"
                className="n w-12 bg-transparent outline-none"
              />
              <IconButton
                label={t('widget.guests_more')}
                onClick={() => changeGuests(String(Math.min(MAX_GUESTS, guestCount + 1)))}
                disabled={guestCount >= MAX_GUESTS}
                data-testid="booking-widget-guests-plus"
                className="disabled:opacity-40"
              >
                <Plus />
              </IconButton>
            </span>
          </div>

          <Button variant="primary" go block onClick={() => submit()} data-testid="booking-widget-panel-search" icon={<Search />}>
            {t('widget.search')}
          </Button>
        </Box>
      )}

      {destinationQuery.trim().length >= 3 && <WeatherForecast query={destinationQuery} />}
    </form>
  );
}
