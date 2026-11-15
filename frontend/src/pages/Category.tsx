import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { distanceTo } from '@/lib/places';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import SmartImg from '@/components/SmartImg';
import Seo from '@/components/Seo';
import { GridTileSkeleton, ListRowSkeleton, repeat } from '@/components/skeletons';
import { SquaresFour as LayoutGrid, Rows as Rows3, MapPin, CalendarDots as CalendarRange, Users, MagnifyingGlass as SearchIcon, CaretLeft, CaretRight } from '@phosphor-icons/react';
import CategoryFilterBar from '@/components/CategoryFilterBar';
import { contentFor } from '@/lib/listingContent';
import { tripMatch } from '@/lib/routeFares';
import { readTrip, hasTrip, tripSuffix } from '@/lib/tripParams';
import { formatDay, formatRange } from '@/lib/dates';
import SearchUnderstood, { type SearchInterpretation } from '@/components/SearchUnderstood';
import { Box, ButtonLink, Chip, Chips, IconButton, PageHead, SecHead, Status } from '@/components/ag';
import { ListRow, SpotCard, StayCard } from '@/components/home/cards';

const TYPE_MAP = {
  spots: 'spot',
  homestays: 'homestay',
  drivers: 'driver',
  guides: 'guide',
  shops: 'shop',
  cafes: 'cafe',
  events: 'event',
  biodiversity: 'biodiversity',
};

const OFFBEAT_PLACES = [
  {
    name: 'Lamahatta',
    lineKey: 'ui.category.offbeat.lamahatta.line',
    tagKey: 'ui.category.offbeat.lamahatta.tag',
    image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80',
  },
  {
    name: 'Takdah',
    lineKey: 'ui.category.offbeat.takdah.line',
    tagKey: 'ui.category.offbeat.takdah.tag',
    image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&q=80',
  },
  {
    name: 'Sittong',
    lineKey: 'ui.category.offbeat.sittong.line',
    tagKey: 'ui.category.offbeat.sittong.tag',
    image: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80',
  },
  {
    name: 'Chatakpur',
    lineKey: 'ui.category.offbeat.chatakpur.line',
    tagKey: 'ui.category.offbeat.chatakpur.tag',
    image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80',
  },
  {
    name: 'Tinchuley',
    lineKey: 'ui.category.offbeat.tinchuley.line',
    tagKey: 'ui.category.offbeat.tinchuley.tag',
    image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
  },
  {
    name: 'Mungpoo',
    lineKey: 'ui.category.offbeat.mungpoo.line',
    tagKey: 'ui.category.offbeat.mungpoo.tag',
    image: 'https://images.unsplash.com/photo-1584395631446-e41b0fc3f68d?w=800&q=80',
  },
  {
    name: 'Lepchajagat',
    lineKey: 'ui.category.offbeat.lepchajagat.line',
    tagKey: 'ui.category.offbeat.lepchajagat.tag',
    image: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80',
  },
];

/** Categories a business can list itself in (the rest are curated by our team). */
const HOST_TYPES = new Set(['homestay', 'driver', 'guide', 'cafe', 'shop']);

/** Results shown as stay cards (photo, price, button, heart); the rest get the tall photo card. */
const STAY_TYPES = HOST_TYPES;

/** Page eyebrow and title per category, in the prototype's words. */
const HEAD: Record<string, { eyebrow: [string, string]; title: [string, string] }> = {
  homestay: { eyebrow: ['home.stay_local', 'Stay local'], title: ['home.tile.stays', 'Homestay'] },
  driver: { eyebrow: ['home.eyebrow_cars', 'Ride local'], title: ['home.tile.cars', 'Car & Driver'] },
  spot: { eyebrow: ['home.must_visit', 'Must visit'], title: ['home.tile.spots', 'Offbeat Places'] },
  cafe: { eyebrow: ['home.eyebrow_eat', 'Eat local'], title: ['home.cafes_title', 'Cafes & Restaurants'] },
  shop: { eyebrow: ['home.eyebrow_shop', 'Shop local'], title: ['home.shops_title', 'Local Shops'] },
  guide: { eyebrow: ['home.eyebrow_guides', 'Go with a local'], title: ['home.tile.guides', 'Tour Guides'] },
  event: { eyebrow: ['home.eyebrow_events', 'Celebrate'], title: ['home.tile.events', 'Festivals'] },
  biodiversity: { eyebrow: ['home.eyebrow_nature', 'Wild side'], title: ['home.nature_title', 'Nature'] },
};

export default function Category({ typeOverride }) {
  const { t, i18n } = useTranslation();
  const { type: paramType } = useParams();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') || '';
  const urlType = sp.get('type') || '';
  // A driver search asks for a journey rather than a place, so the widget sends
  // both ends of the route instead of a query.
  const from = sp.get('from') || '';
  const to = sp.get('to') || '';
  const type = typeOverride ? typeOverride : (urlType || TYPE_MAP[paramType]);
  const trip = useMemo(() => readTrip(sp), [sp]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  // Everything matching the query in *other* categories. Only fetched when the
  // scoped search comes back empty - see the effect below.
  const [elsewhere, setElsewhere] = useState([]);
  // 'grid' (two columns of cards) or 'feed' (104px list rows). Search across every category opens as
  // the list, as the prototype shows it; a category opens as the grid.
  const [viewPick, setView] = useState<'grid' | 'feed' | null>(null);
  // The offbeat rail scrolls sideways; a mouse has no swipe, so it gets arrow buttons.
  const railRef = useRef<HTMLDivElement>(null);
  const scrollRail = (dir: 1 | -1) => {
    const el = railRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  // Interactive Filter & Search states
  const [searchQuery, setSearchQuery] = useState(q);
  const [selectedLocation, setSelectedLocation] = useState('All Locations');
  const [sortOrder, setSortOrder] = useState<'recommended' | 'price_asc' | 'price_desc' | 'name_asc'>('recommended');
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [selectedCab, setSelectedCab] = useState<string>('all');
  const [entryFilter, setEntryFilter] = useState<string>('all');
  // Board: "Filter > by proximity & by price". Where the traveller is, and how far they will go.
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const locate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setNear({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => { setLocating(false); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  useEffect(() => {
    setSearchQuery(q);
  }, [q]);

  // Smart search (server lib/search.ts): reads intent, budget, local spellings and typos and ranks
  // the results. Asked a moment after typing stops; until it answers, the plain match below shows.
  const [smart, setSmart] = useState<{ q: string; items: any[]; search: SearchInterpretation | null } | null>(null);
  useEffect(() => {
    const term = searchQuery.trim();
    if (!term) { setSmart(null); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      api.get('/listings', { params: { q: term, type, limit: 60 } })
        .then((r) => { if (!cancelled) setSmart({ q: term, items: r.data.items || [], search: r.data.search || null }); })
        .catch(() => { if (!cancelled) setSmart(null); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery, type]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setElsewhere([]);
    api.get('/listings', { params: { type, limit: 60 } })
      .then((r) => { if (!cancelled) setItems(r.data.items || []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type]);

  // Narrowed here rather than in the query: a driver's routes live in
  // `extras.routes` or - for the seeded drivers - only in the editorial map, so
  // `contentFor` is the one place that sees both and the API can't filter on it.
  const routeTrip = [from.trim(), to.trim()].filter(Boolean).join(' → ');
  // Drivers whose routes cover the trip first, then every other driver under "may also do this
  // trip": routes are free text and rarely complete, so leaving them out ended the region's most
  // common search (NJP → Darjeeling) on an empty page.
  const matchOf = (it: any) => tripMatch(contentFor(it).routes || [], from, to);
  const baseResults = items;

  // Realtime Filter & Sorting Pipeline
  const results = useMemo(() => {
    let list = [...baseResults];

    const term = searchQuery.trim();
    if (term && smart?.q === term) {
      // Server order is best match first; a driver trip still narrows it to the route.
      list = (type === 'driver' && routeTrip)
        ? smart.items.filter((it) => matchOf(it) !== 'no')
        : [...smart.items];
    } else if (term) {
      const s = term.toLowerCase();
      list = list.filter(
        (it) =>
          it.title?.toLowerCase().includes(s) ||
          it.description?.toLowerCase().includes(s) ||
          it.location?.toLowerCase().includes(s),
      );
    }

    if (selectedLocation && selectedLocation !== 'All Locations') {
      const loc = selectedLocation.toLowerCase();
      list = list.filter((it) => it.location?.toLowerCase().includes(loc));
    }

    if (maxPrice !== undefined && maxPrice > 0) {
      list = list.filter((it) => it.price && Number(it.price) <= maxPrice);
    }

    if (selectedCab && selectedCab !== 'all') {
      list = list.filter((it) => {
        const extrasStr = JSON.stringify(it.extras || {}).toLowerCase();
        const titleStr = (it.title || '').toLowerCase();
        if (selectedCab === 'hatchback') return titleStr.includes('dzire') || titleStr.includes('hatchback') || titleStr.includes('sedan') || extrasStr.includes('hatchback');
        if (selectedCab === 'suv') return titleStr.includes('innova') || titleStr.includes('bolero') || titleStr.includes('suv') || extrasStr.includes('suv');
        return true;
      });
    }

    if (entryFilter !== 'all') {
      list = list.filter((it) => {
        const free = !it.price || Number(it.price) === 0 || it.extras?.entry_fee?.toLowerCase().includes('free') || it.extras?.entry_fee?.toLowerCase().includes('nil');
        if (entryFilter === 'free') return free;
        if (entryFilter === 'paid') return !free;
        return true;
      });
    }

    if (near) {
      list = list
        // A map pin when there is one, otherwise the place the listing names (drivers, guides).
        .map((it) => ({ it, d: distanceTo(near, it) }))
        .filter(({ d }) => radius === null || (d !== null && d.km <= radius))
        .sort((a, b) => (a.d?.km ?? 1e9) - (b.d?.km ?? 1e9))
        .map(({ it, d }) => ({ ...it, _km: d }));
    }

    if (sortOrder === 'price_asc') {
      list.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    } else if (sortOrder === 'price_desc') {
      list.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    } else if (sortOrder === 'name_asc') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    // A homestay that cannot take the whole group is left out (persona test 2026-11-09: a family of
    // six saw homestays for two). Listings with no stated capacity stay, the host can say.
    if (type === 'homestay' && trip.guests > 1) {
      list = list.filter((it) => !(Number(it.max_guests) > 0) || Number(it.max_guests) >= trip.guests);
    }

    // A trip search lists the drivers who cover it first, in the chosen order, then the rest.
    if (type === 'driver' && routeTrip) {
      list = [...list.filter((it) => matchOf(it) === 'covers'), ...list.filter((it) => matchOf(it) !== 'covers')];
    }

    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseResults, searchQuery, smart, type, routeTrip, from, to, selectedLocation, maxPrice, selectedCab, entryFilter, sortOrder, near, radius, trip.guests]);

  // Where "may also do this trip" starts in a driver trip search (-1 when it does not apply).
  const unlistedFrom = (type === 'driver' && routeTrip) ? results.findIndex((it) => matchOf(it) !== 'covers') : -1;
  const unlistedHeading = (
    <div className="col-span-full" data-testid="trip-unlisted-heading">
      <SecHead title={t('category.trip_unlisted_title')} className="!mb-1" />
      <p className="ag-small m-0">{t('category.trip_unlisted_body')}</p>
    </div>
  );

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedLocation('All Locations');
    setSortOrder('recommended');
    setMaxPrice(undefined);
    setSelectedCab('all');
    setEntryFilter('all');
    setNear(null);
    setRadius(null);
  };

  const searching = !!(q || routeTrip || searchQuery);

  /**
   * A type-scoped search that finds nothing is not the same answer as "there is
   * nothing here", and the site was giving the second.
   */
  const fallbackTerm = q || searchQuery || to.trim() || from.trim();

  useEffect(() => {
    if (loading || !searching || !type || results.length > 0 || !fallbackTerm) return;
    let cancelled = false;
    api.get('/listings', { params: { q: fallbackTerm, limit: 12 } })
      .then((r) => { if (!cancelled) setElsewhere((r.data.items || []).filter((it) => it.type !== type)); })
      .catch(() => { if (!cancelled) setElsewhere([]); });
    return () => { cancelled = true; };
  }, [loading, searching, type, results.length, fallbackTerm]);

  const head = type ? HEAD[type] : undefined;
  const title = routeTrip || (q ? `“${q}”` : head ? t(head.title[0], head.title[1]) : t('nav.discover'));
  const eyebrow = searching
    ? (type ? `${t('category.search')} · ${t(`categories.${type}`)}` : t('category.search'))
    : head ? t(head.eyebrow[0], head.eyebrow[1]) : t('nav.discover');
  const view = viewPick ?? (type ? 'grid' : 'feed');
  const suffix = tripSuffix(trip);
  const listingHref = (id: string) => `/listing/${id}${suffix}`;

  const locale = i18n.language || 'en';
  const dateSummary = trip.checkIn && trip.checkOut
    ? formatRange(trip.checkIn, trip.checkOut, locale)
    : trip.checkIn
      ? t('widget.from_date', { date: formatDay(trip.checkIn, locale) })
      : trip.checkOut
        ? t('widget.until_date', { date: formatDay(trip.checkOut, locale) })
        : '';

  // Stays, drivers, guides, cafes and shops get the stay card; spots, nature and festivals the tall
  // photo card. Every result carries grid-tile-<id>: the release walks count them.
  const resultCard = (it: any) => (STAY_TYPES.has(it.type)
    ? <StayCard key={it.id} it={it} href={listingHref(it.id)} km={it._km} testId={`grid-tile-${it.id}`} ctaTestId={`grid-cta-${it.id}`} />
    : <SpotCard key={it.id} it={it} href={listingHref(it.id)} km={it._km} testId={`grid-tile-${it.id}`} />);
  const listRow = (it: any) => <ListRow key={it.id} it={it} href={listingHref(it.id)} km={it._km} testId={`grid-tile-${it.id}`} />;

  const resultsOf = (list: any[], offset = 0) => (
    <div className={view === 'grid' ? 'grid grid-cols-2 gap-2.5' : 'flex flex-col gap-2.5'}>
      {list.map((it, i) => (
        <Fragment key={it.id}>
          {i + offset === unlistedFrom && unlistedHeading}
          {view === 'grid' ? resultCard(it) : listRow(it)}
        </Fragment>
      ))}
    </div>
  );

  const countLine = loading ? t('common.loading') : type === 'spot' && !searching
    // On Tourism spots the curated villages rail sits above the list, so say what the number counts.
    ? t('category.spots_listed', { count: results.length })
    : t('category.results', { count: results.length });

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        <Seo
          title={searching ? `${t('category.search')}: ${routeTrip || q}` : (type ? t(`categories.${type}`) : t('nav.discover'))}
          noindex={searching || hasTrip(trip)}
        />

        <PageHead eyebrow={eyebrow} title={title}>
          {smart?.search && smart.q === searchQuery.trim() && (
            <SearchUnderstood search={smart.search} fixedType={type} onUse={(text) => {
              // The corrected words become the search itself, heading and address included.
              if (q) setSp((prev) => { const next = new URLSearchParams(prev); next.set('q', text); return next; });
              setSearchQuery(text);
            }} />
          )}
        </PageHead>

        {hasTrip(trip) && (
          <div data-testid="trip-summary" className="ag-row">
            {dateSummary && (
              <Status tone="info"><CalendarRange size={14} aria-hidden="true" /> {dateSummary}</Status>
            )}
            {trip.guests > 1 && (
              <Status tone="info"><Users size={14} aria-hidden="true" /> {t('widget.guest_count', { count: trip.guests })}</Status>
            )}
          </div>
        )}

        {/* Offbeat villages above the list on Tourism spots */}
        {type === 'spot' && !searching && (
          <section aria-labelledby="offbeat-h">
            <SecHead
              id="offbeat-h"
              eyebrow={t('home.hidden_gems', 'HIDDEN GEMS')}
              title={t('home.offbeat', 'Offbeat & Quiet Villages')}
              action={(
                <span className="hidden gap-2 sm:flex">
                  <IconButton label={t('common.previous', 'Previous')} onClick={() => scrollRail(-1)} data-testid="offbeat-prev"><CaretLeft /></IconButton>
                  <IconButton label={t('common.next', 'Next')} onClick={() => scrollRail(1)} data-testid="offbeat-next"><CaretRight /></IconButton>
                </span>
              )}
            />
            <p className="ag-small -mt-1 mb-3">{t('home.offbeat_sub', 'Quieter villages a day trip or a night away from town')}</p>
            <div ref={railRef} data-testid="offbeat-rail"
              className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto overscroll-x-contain scroll-smooth px-4 pb-2 no-scrollbar">
              {OFFBEAT_PLACES.map((place) => (
                <Link
                  key={place.name}
                  to={`/search?q=${encodeURIComponent(place.name)}`}
                  className="relative block aspect-[3/4] w-[44%] flex-none snap-start overflow-hidden rounded-[var(--r-card)] border border-[var(--warmline)] bg-[var(--creme2)] text-white no-underline sm:w-[30%]"
                >
                  <SmartImg src={place.image} alt={place.name} className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" aria-hidden="true" />
                  <span className="ag-status absolute left-2 top-2 max-w-[85%] truncate">{t(place.tagKey)}</span>
                  <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3">
                    <b className="text-base font-medium leading-snug">{place.name}</b>
                    <span className="line-clamp-2 text-xs text-white/85">{t(place.lineKey)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <CategoryFilterBar
          categoryType={type}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedLocation={selectedLocation}
          onLocationChange={setSelectedLocation}
          sortOrder={sortOrder}
          onSortChange={setSortOrder}
          maxPrice={maxPrice}
          onMaxPriceChange={setMaxPrice}
          selectedCab={selectedCab}
          onCabChange={setSelectedCab}
          entryFilter={entryFilter}
          onEntryFilterChange={setEntryFilter}
          onReset={resetFilters}
          totalCount={results.length}
        >
          {/* Near me: nearest first, then within 5 / 10 / 25 km. */}
          <Chips scroll data-testid="near-me">
            <Chip on={!!near} onClick={near ? () => { setNear(null); setRadius(null); } : locate} disabled={locating} data-testid="near-me-toggle">
              <MapPin aria-hidden="true" /> {locating ? t('ui.category.finding_you') : near ? t('ui.category.near_me_on') : t('ui.category.near_me')}
            </Chip>
            {near && [null, 5, 10, 25].map((km) => (
              <Chip key={String(km)} on={radius === km} onClick={() => setRadius(km)} data-testid={`near-${km ?? 'any'}`}>
                {km ? t('ui.category.within_km', { km }) : t('ui.category.any_distance')}
              </Chip>
            ))}
          </Chips>

          {type === 'homestay' && (
            <Chips scroll data-testid="guest-filter" role="group" aria-label={t('filter.guests', 'Guests')}>
              {[1, 2, 4, 6, 8].map((n) => {
                const on = n === 1 ? trip.guests <= 1 : trip.guests === n;
                return (
                  <Chip key={n} on={on} data-testid={`guest-filter-${n}`}
                    onClick={() => setSp((prev) => { const next = new URLSearchParams(prev); if (n === 1) next.delete('guests'); else next.set('guests', String(n)); return next; })}>
                    {n === 1 && <Users aria-hidden="true" />}
                    {n === 1 ? `${t('filter.guests', 'Guests')}: ${t('filter.any', 'Any')}` : `${n}+`}
                  </Chip>
                );
              })}
            </Chips>
          )}
        </CategoryFilterBar>

        <div className="flex items-center justify-between gap-3">
          <p className="ag-small m-0" role="status">{countLine}</p>
          <span className="flex gap-2">
            <IconButton label={t('category.view_grid')} tint={view === 'grid'} aria-pressed={view === 'grid'} onClick={() => setView('grid')} data-testid="view-grid">
              <LayoutGrid />
            </IconButton>
            <IconButton label={t('category.view_list')} tint={view === 'feed'} aria-pressed={view === 'feed'} onClick={() => setView('feed')} data-testid="view-feed">
              <Rows3 />
            </IconButton>
          </span>
        </div>

        {loading ? (
          view === 'grid' ? (
            <div className="grid grid-cols-2 gap-2.5">{repeat(6, (i) => <GridTileSkeleton key={i} />)}</div>
          ) : (
            <div className="flex flex-col gap-2.5">{repeat(5, (i) => <ListRowSkeleton key={i} />)}</div>
          )
        ) : results.length === 0 ? (
          <div data-testid="category-empty" className="flex flex-col gap-4">
            <Box>
              <p className="ag-lead m-0">
                {searching && type
                  ? t('category.none_in_category', { category: t(`categories.${type}`), query: routeTrip || q })
                  : t('category.empty')}
              </p>
              {searching && (
                <ButtonLink to={`/search?q=${encodeURIComponent(routeTrip || q)}`} go icon={<SearchIcon />} className="self-start" data-testid="search-all-categories">
                  {t('category.search_all')}
                </ButtonLink>
              )}
              {/* An empty category (no guides live yet, say) is not a dead end: ask us, or list yours. */}
              {!searching && (
                <div className="flex flex-col gap-2 sm:flex-row" data-testid="category-empty-actions">
                  <ButtonLink to="/contact" go>{t('category.empty_ask')}</ButtonLink>
                  {HOST_TYPES.has(type) && <ButtonLink to="/provider/onboard" go>{t('category.empty_list')}</ButtonLink>}
                </div>
              )}
            </Box>

            {elsewhere.length > 0 && (
              <section data-testid="results-elsewhere" aria-labelledby="elsewhere-h">
                <SecHead id="elsewhere-h" title={t('category.found_elsewhere', { count: elsewhere.length, query: routeTrip || q })} />
                <p className="ag-small -mt-1 mb-3">{t('category.found_elsewhere_note')}</p>
                <div className="flex flex-col gap-2.5">{elsewhere.map(listRow)}</div>
              </section>
            )}
          </div>
        ) : (
          resultsOf(results)
        )}
      </div>
    </div>
  );
}
