import React, { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { PLACES, distanceTo, placeFor } from '@/lib/places';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SuggestPlace from '@/components/spots/SuggestPlace';
import api from '@/lib/api';
import Seo from '@/components/Seo';
import { GridTileSkeleton, ListRowSkeleton, repeat } from '@/components/skeletons';
import CategoryFilterBar, { type SortOrder } from '@/components/CategoryFilterBar';
import { contentFor } from '@/lib/listingContent';
import { normalizeRoutes, routeForTrip, tripMatch } from '@/lib/routeFares';
import { readTrip, hasTrip, tripSuffix } from '@/lib/tripParams';
import { formatDay, formatRange } from '@/lib/dates';
import SearchUnderstood, { type SearchInterpretation } from '@/components/SearchUnderstood';
import { Box, Button, ButtonLink, Chip, Chips, PageHead, SecHead, Status, cx } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import { ListRow } from '@/components/home/cards';
import { CatSpotCard, CatStayCard } from '@/components/ListingCard';
import { typeMatches } from '@/components/home/HomeFilterPanel';

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
/** Kinds the home filter panel names differently from the API. */
const TYPE_ALIAS: Record<string, string> = { nature: 'biodiversity', stays: 'homestay', drivers: 'driver' };

const SORTS = new Set(['price_asc', 'price_desc', 'name_asc']);
const squash = (v: string) => v.toLowerCase().replace(/[^a-z]/g, '');
/** A place picked in the filter matches its other spellings too (Ghum / Ghoom). */
function placeKeys(name: string): string[] {
  const n = squash(name);
  const hit = PLACES.find((p) => p.keys.some((k) => squash(k) === n));
  return hit ? hit.keys.map(squash) : [n];
}
/** A spot with an entry ticket ("₹30 per person") is paid even if its listed price is 0. */
function freeEntry(it: any): boolean {
  const fee = String(it.extras?.entry_fee || '').toLowerCase();
  if (/free|nil|no entry fee/.test(fee)) return true;
  if (/[1-9]/.test(fee)) return false;
  return !Number(it.price);
}
/** Car words by cab kind, from titles and the host's vehicle type (constants/listingOptions VEHICLE_TYPES). */
const CAB_WORDS: Record<string, string[]> = {
  hatchback: ['hatchback', 'sedan', 'dzire', 'swift', 'etios', 'alto', 'wagon', 'amaze', 'aura'],
  suv: ['suv', 'innova', 'bolero', 'sumo', 'scorpio', 'jeep', 'xylo', 'ertiga', 'mountain'],
};

/** Results shown as stay cards (photo, facts, price, button, heart). */
const STAY_TYPES = new Set(['homestay', 'driver', 'guide', 'cafe', 'shop']);
/** Results shown as the tall photo card with the name over it. */
const SPOT_TYPES = new Set(['spot', 'biodiversity']);
/** Bookable from the listing page: the card's button says Reserve, the rest say View. */
const BOOKABLE = new Set(['homestay', 'driver', 'guide']);

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

/** Where distances on the cards are measured from until the traveller turns on My location. */
const TOWN = placeFor('darjeeling') as { lat: number; lng: number };

/** A spot's kind, read from its tags, for the kind chips above the list (prototype layout.js). */
const KINDS: [string, string[]][] = [
  ['viewpoint', ['viewpoint', 'sunrise', 'panoramic']],
  ['monastery', ['monastery', 'gompa', 'buddhist']],
  ['lake', ['lake']],
  ['waterfall', ['waterfall']],
  ['wild', ['wildlife', 'zoo', 'birdlife']],
  ['heritage', ['heritage', 'tea', 'museum', 'toy train']],
  ['park', ['park', 'garden']],
  ['village', ['village', 'hamlet']],
  ['temple', ['temple']],
  ['peak', ['peak', 'trek']],
  ['protected', ['flora', 'forest', 'sanctuary']],
];
const KIND_LABEL: Record<string, string> = {
  viewpoint: 'Viewpoints', monastery: 'Monasteries', lake: 'Lakes', waterfall: 'Waterfalls', wild: 'Wildlife',
  heritage: 'Heritage sites', park: 'Parks', village: 'Villages', temple: 'Temples', peak: 'Peaks', protected: 'Protected forests', attraction: 'Attractions',
};
const kindOf = (it: any): string => {
  const tags = (Array.isArray(it.tags) ? it.tags : []).map((x: unknown) => String(x).toLowerCase());
  return KINDS.find(([, keys]) => keys.some((k) => tags.includes(k)))?.[0] || (it.type === 'biodiversity' ? 'wild' : 'attraction');
};

/** Places offered in Find a ride as you type; anything else can be typed too. */
const RIDE_PLACES = ['Darjeeling', 'Ghum', 'Tiger Hill', 'Kurseong', 'Mirik', 'Kalimpong', 'Siliguri', 'NJP Station', 'Bagdogra Airport', 'Gangtok', 'Sittong', 'Lamahatta', 'Takdah', 'Lepchajagat', 'Sukhia Pokhri'];
const SUPPORT_PHONE = '+91 90932 77919';

/** A new category or search starts clean: filters from one page never carry into the next. */
export default function Category({ typeOverride }: { typeOverride?: string }) {
  const { pathname } = useLocation();
  const [sp] = useSearchParams();
  return <CategoryPage key={`${pathname}|${sp.get('type') || ''}`} typeOverride={typeOverride} />;
}

function CategoryPage({ typeOverride }: { typeOverride?: string }) {
  const { t, i18n } = useTranslation();
  const { type: paramType } = useParams();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') || '';
  const urlType = sp.get('type') || '';
  // A driver search asks for a journey rather than a place, so the widget sends
  // both ends of the route instead of a query.
  const from = sp.get('from') || '';
  const to = sp.get('to') || '';
  const type = typeOverride ? typeOverride : (TYPE_ALIAS[urlType] || urlType || TYPE_MAP[paramType]);
  // The home filter's Foods & Shops ('food') is cafes and shops together: fetch all, keep those two.
  const apiType = type === 'food' ? undefined : type;
  const keepType = (list: any[]) => (type === 'food' ? list.filter((it) => typeMatches('food', it.type)) : list);
  const trip = useMemo(() => readTrip(sp), [sp]);
  // Find a ride's day: only the drivers free that day (server: not switched off, no accepted or
  // confirmed booking on it).
  const availableOn = type === 'driver' && trip.checkIn ? trip.checkIn : '';
  const dayParam = availableOn ? { available_on: availableOn } : {};
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  // Everything matching the query in *other* categories. Only fetched when the
  // scoped search comes back empty - see the effect below.
  const [elsewhere, setElsewhere] = useState([]);

  // Interactive Filter & Search states
  const [searchQuery, setSearchQuery] = useState(q);
  const [selectedLocation, setSelectedLocation] = useState(() => sp.get('loc') || 'All Locations');
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => (SORTS.has(sp.get('sort') || '') ? sp.get('sort') : 'recommended') as SortOrder);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(() => Number(sp.get('max')) || undefined);
  const [selectedCab, setSelectedCab] = useState<string>(() => sp.get('cab') || 'all');
  const [entryFilter, setEntryFilter] = useState<string>(() => sp.get('entry') || 'all');
  const [kind, setKind] = useState(() => sp.get('kind') || '');
  const [delivers, setDelivers] = useState(() => sp.get('del') === '1');
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
  // Filters handed over by the home filter panel: ?near=me|<place>&within=<km>&sort=price_asc.
  const nearParam = sp.get('near') || '';
  const withinParam = Number(sp.get('within')) || 0;
  const sortParam = sp.get('sort') || '';
  useEffect(() => {
    if (nearParam === 'me' && !near) locate();
    else if (nearParam) { const at = placeFor(nearParam); if (at) setNear(at); }
    if (nearParam && withinParam > 0) setRadius(withinParam);
    if (sortParam === 'price_asc' || sortParam === 'price_desc' || sortParam === 'name_asc') setSortOrder(sortParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearParam, withinParam, sortParam]);
  const clearing = useRef(false);
  // Keep the address in step with the filters (replace, so Back still leaves the page in one step).
  useEffect(() => {
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      if (clearing.current) { clearing.current = false; n.delete('q'); n.delete('guests'); }
      const put = (k: string, v: string | null) => { if (v) n.set(k, v); else n.delete(k); };
      put('loc', selectedLocation !== 'All Locations' ? selectedLocation : null);
      put('max', maxPrice ? String(maxPrice) : null);
      put('cab', selectedCab !== 'all' ? selectedCab : null);
      put('entry', entryFilter !== 'all' ? entryFilter : null);
      put('kind', kind || null);
      put('del', delivers ? '1' : null);
      put('sort', sortOrder !== 'recommended' ? sortOrder : null);
      put('near', near ? (prev.get('near') || 'me') : null);
      put('within', near && radius ? String(radius) : null);
      return n.toString() === prev.toString() ? prev : n;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation, maxPrice, selectedCab, entryFilter, kind, delivers, sortOrder, near, radius]);

  // Smart search (server lib/search.ts): reads intent, budget, local spellings and typos and ranks
  // the results. Asked a moment after typing stops; until it answers, the plain match below shows.
  const [smart, setSmart] = useState<{ q: string; items: any[]; search: SearchInterpretation | null } | null>(null);
  useEffect(() => {
    const term = searchQuery.trim();
    if (!term) { setSmart(null); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      api.get('/listings', { params: { q: term, type: apiType, limit: apiType ? 60 : 200, ...dayParam } })
        .then((r) => { if (!cancelled) setSmart({ q: term, items: keepType(r.data.items || []), search: r.data.search || null }); })
        .catch(() => { if (!cancelled) setSmart(null); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery, type, availableOn]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setElsewhere([]);
    api.get('/listings', { params: { type: apiType, limit: apiType ? 60 : 200, ...dayParam } })
      .then((r) => { if (!cancelled) setItems(keepType(r.data.items || [])); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type, availableOn]);

  // Narrowed here rather than in the query: a driver's routes live in
  // `extras.routes` or - for the seeded drivers - only in the editorial map, so
  // `contentFor` is the one place that sees both and the API can't filter on it.
  const routeTrip = [from.trim(), to.trim()].filter(Boolean).join(' → ');
  // Drivers whose routes cover the trip first, then every other driver under "may also do this
  // trip": routes are free text and rarely complete, so leaving them out ended the region's most
  // common search (NJP → Darjeeling) on an empty page.
  const matchOf = (it: any) => tripMatch(contentFor(it).routes || [], from, to);
  const baseResults = items;

  // The kind chips on spots and nature, with how many of each (prototype layout.js).
  const kinds = useMemo(() => {
    if (!SPOT_TYPES.has(type)) return [];
    const n: Record<string, number> = {};
    baseResults.forEach((it: any) => { const k = kindOf(it); n[k] = (n[k] || 0) + 1; });
    const list = Object.keys(n).sort((a, b) => n[b] - n[a]).map((k) => ({ k, n: n[k] }));
    return list.length > 1 ? list : [];
  }, [baseResults, type]);

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
      const keys = placeKeys(selectedLocation);
      list = list.filter((it) => { const at = squash(it.location || ''); return keys.some((k) => at.includes(k)); });
    }

    if (maxPrice !== undefined && maxPrice > 0) {
      list = list.filter((it) => it.price && Number(it.price) <= maxPrice);
    }

    if (selectedCab && selectedCab !== 'all') {
      const words = CAB_WORDS[selectedCab] || [];
      list = list.filter((it) => {
        const hay = `${it.title || ''} ${JSON.stringify(it.extras || {})}`.toLowerCase();
        return !words.length || words.some((w) => hay.includes(w));
      });
    }

    if (entryFilter !== 'all') {
      list = list.filter((it) => {
        const free = freeEntry(it);
        if (entryFilter === 'free') return free;
        if (entryFilter === 'paid') return !free;
        return true;
      });
    }

    if (kind) list = list.filter((it) => kindOf(it) === kind);
    if (delivers) list = list.filter((it) => it.extras?.home_delivery === true);

    if (near) {
      list = list
        // A map pin when there is one, otherwise the place the listing names (drivers, guides).
        .map((it) => ({ it, d: distanceTo(near, it) }))
        .filter(({ d }) => radius === null || (d !== null && d.km <= radius))
        .sort((a, b) => (a.d?.km ?? 1e9) - (b.d?.km ?? 1e9))
        .map(({ it, d }) => ({ ...it, _km: d }));
    } else {
      // The prototype always shows how far a place is, from town until My location is on.
      list = list.map((it) => ({ ...it, _km: distanceTo(TOWN, it) }));
    }

    const priced = (it: any, none: number) => Number(it.price) || none;
    if (sortOrder === 'price_asc') {
      list.sort((a, b) => priced(a, Infinity) - priced(b, Infinity));
    } else if (sortOrder === 'price_desc') {
      list.sort((a, b) => priced(b, -1) - priced(a, -1));
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
  }, [baseResults, searchQuery, smart, type, routeTrip, from, to, selectedLocation, maxPrice, selectedCab, entryFilter, kind, delivers, sortOrder, near, radius, trip.guests]);

  // Where "may also do this trip" starts in a driver trip search (-1 when it does not apply).
  const unlistedFrom = (type === 'driver' && routeTrip) ? results.findIndex((it) => matchOf(it) !== 'covers') : -1;
  const unlistedHeading = (
    <div className="col-span-full" data-testid="trip-unlisted-heading">
      <SecHead title={t('category.trip_unlisted_title')} className="!mb-1 !mt-2" />
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
    setKind('');
    setDelivers(false);
    setNear(null);
    setRadius(null);
    clearing.current = true;
    setSp((prev) => { const n = new URLSearchParams(prev); ['q', 'guests'].forEach((k) => n.delete(k)); return n; }, { replace: true });
  };

  const searching = !!(q || routeTrip || searchQuery);
  // Any filter on: an empty list then means "nothing matches these filters", not "nothing here".
  const filtering = selectedLocation !== 'All Locations' || !!maxPrice || selectedCab !== 'all' || entryFilter !== 'all'
    || !!kind || delivers || !!near || trip.guests > 1;
  // Typed words wait for the smart search; until it answers, show the loading state, not "nothing found".
  const smartPending = !!searchQuery.trim() && smart?.q !== searchQuery.trim();

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
  const title = (q && !type) ? `“${q}”` : head ? t(head.title[0], head.title[1]) : (q ? `“${q}”` : t('category.search'));
  const eyebrow = head ? t(head.eyebrow[0], head.eyebrow[1]) : t('category.search');
  // A driver searched by route also carries where from and where to, so the booking form starts filled.
  const suffix = (() => {
    const params = new URLSearchParams(tripSuffix(trip).replace(/^\?/, ''));
    if (type === 'driver' && from) params.set('from', from);
    if (type === 'driver' && to) params.set('to', to);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  })();
  const listingHref = (id: string) => `/listing/${id}${suffix}`;

  const locale = i18n.language || 'en';
  const dateSummary = trip.checkIn && trip.checkOut
    ? formatRange(trip.checkIn, trip.checkOut, locale)
    : trip.checkIn
      ? t('widget.from_date', { date: formatDay(trip.checkIn, locale) })
      : trip.checkOut
        ? t('widget.until_date', { date: formatDay(trip.checkOut, locale) })
        : '';

  // Across every category (search) and festivals: one row per result, as the prototype lists them.
  const asRows = !type || !(STAY_TYPES.has(type) || SPOT_TYPES.has(type));
  // Every result carries grid-tile-<id>: the release walks count them.
  const cardOf = (it: any) => {
    if (asRows) return <ListRow key={it.id} it={it} href={listingHref(it.id)} km={near ? it._km : undefined} testId={`grid-tile-${it.id}`} />;
    if (STAY_TYPES.has(it.type)) {
      return (
        <CatStayCard key={it.id} it={it} href={listingHref(it.id)} km={it._km} testId={`grid-tile-${it.id}`} ctaTestId={`grid-cta-${it.id}`}
          fare={it.type === 'driver' && routeTrip ? routeForTrip(normalizeRoutes(contentFor(it).routes), from, to) : null}
          ctaLabel={BOOKABLE.has(it.type) ? t('cta.reserve', 'Reserve') : t('cta.view', 'View')} />
      );
    }
    if (SPOT_TYPES.has(it.type)) return <CatSpotCard key={it.id} it={it} href={listingHref(it.id)} km={near ? it._km : undefined} testId={`grid-tile-${it.id}`} />;
    return <ListRow key={it.id} it={it} href={listingHref(it.id)} km={near ? it._km : undefined} testId={`grid-tile-${it.id}`} />;
  };

  const resultsOf = (list: any[]) => (
    <div className={asRows ? 'flex flex-col gap-2.5' : 'ag-category-grid'} data-testid="category-results">
      {list.map((it, i) => (
        <Fragment key={it.id}>
          {i === unlistedFrom && unlistedHeading}
          {cardOf(it)}
        </Fragment>
      ))}
    </div>
  );

  const countLine = loading || smartPending ? t('common.loading') : t('category.results', { count: results.length });

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        <Seo
          title={searching ? `${t('category.search')}: ${routeTrip || q || searchQuery}` : (type ? t(`categories.${type}`) : t('nav.discover'))}
          noindex={searching || hasTrip(trip)}
        />

        <PageHead eyebrow={eyebrow} title={title} />

        {hasTrip(trip) && (
          <div data-testid="trip-summary" className="ag-row">
            {dateSummary && (
              <Status tone="info"><Icon name="t_trip" className="!h-3.5 !w-3.5" /> {dateSummary}</Status>
            )}
            {trip.guests > 1 && (
              <Status tone="info"><Icon name="person" className="!h-3.5 !w-3.5" /> {t('widget.guest_count', { count: trip.guests })}</Status>
            )}
          </div>
        )}

        {type === 'driver' && (
          <>
            <RideSearch from={from} to={to} date={trip.checkIn} onSearch={(f, tt, d) => setSp((prev) => {
              const next = new URLSearchParams(prev);
              next.set('from', f); next.set('to', tt);
              if (d) next.set('check_in', d); else next.delete('check_in');
              return next;
            })} onClear={() => setSp((prev) => { const next = new URLSearchParams(prev); next.delete('from'); next.delete('to'); return next; })} />
            <h2 className="ag-category-h2">{routeTrip ? t('category.rs_all', 'All drivers') : t('nav.drivers', 'Drivers')}</h2>
            {availableOn && (
              <p className="ag-small m-0" data-testid="ride-free-on">
                {t('category.rs_free_on', 'Drivers free on {{date}}', { date: formatDay(availableOn, locale) })}
              </p>
            )}
          </>
        )}

        <CategoryFilterBar
          categoryType={type}
          searchQuery={searchQuery}
          onSearchChange={(v: string) => {
            setSearchQuery(v);
            if (!v.trim() && q) setSp((prev) => { const next = new URLSearchParams(prev); next.delete('q'); return next; }, { replace: true });
          }}
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
          extraActive={!!near || (type === 'homestay' && trip.guests > 1) || delivers || !!kind}
          nearSlot={(
            <button type="button" className={cx('ag-category-myloc', near && 'on')} aria-pressed={!!near}
              onClick={near ? () => { setNear(null); setRadius(null); } : locate} disabled={locating} data-testid="near-me-toggle">
              <Icon name="locate" />
              {locating ? t('ui.category.finding_you') : t('category.myloc', 'My location')}
            </button>
          )}
        >
          {near && (
            <div className="ag-category-frow" data-testid="near-me">
              <span className="flex justify-between gap-2">
                <span>{t('category.within', 'Within')}</span>
                <b>{radius ? t('ui.category.within_km', { km: radius }) : t('ui.category.any_distance')}</b>
              </span>
              <Chips scroll role="group" aria-label={t('category.within', 'Within')}>
                {[null, 5, 10, 25].map((km) => (
                  <Chip key={String(km)} on={radius === km} onClick={() => setRadius(km)} data-testid={`near-${km ?? 'any'}`}>
                    {km ? `${km} km` : t('ui.category.any_distance')}
                  </Chip>
                ))}
              </Chips>
            </div>
          )}

          {type === 'homestay' && (
            <div className="ag-category-frow">
              <span>{t('filter.guests', 'Guests')}</span>
              <Chips scroll data-testid="guest-filter" role="group" aria-label={t('filter.guests', 'Guests')}>
                {[1, 2, 4, 6, 8].map((n) => {
                  const on = n === 1 ? trip.guests <= 1 : trip.guests === n;
                  return (
                    <Chip key={n} on={on} data-testid={`guest-filter-${n}`}
                      onClick={() => setSp((prev) => { const next = new URLSearchParams(prev); if (n === 1) next.delete('guests'); else next.set('guests', String(n)); return next; })}>
                      {n === 1 ? t('filter.any', 'Any') : `${n}+`}
                    </Chip>
                  );
                })}
              </Chips>
            </div>
          )}
        </CategoryFilterBar>

        {smart?.search && smart.q === searchQuery.trim() && (
          <SearchUnderstood search={smart.search} fixedType={type} onUse={(text) => {
            // The corrected words become the search itself, heading and address included.
            if (q) setSp((prev) => { const next = new URLSearchParams(prev); next.set('q', text); return next; });
            setSearchQuery(text);
          }} />
        )}

        {kinds.length > 0 && (
          <div className="ag-category-pills" role="group" aria-label={t('category.kind', 'Kind of place')} data-testid="kind-chips">
            {[{ k: '', n: baseResults.length }, ...kinds].map(({ k, n }) => (
              <button key={k || 'all'} type="button" className="ag-category-svpill" aria-pressed={kind === k} onClick={() => setKind(k)} data-testid={`kind-${k || 'all'}`}>
                {k ? t(`category.kp_${k}`, KIND_LABEL[k]) : t('category.k_all', 'All')} <span className="svn">{n}</span>
              </button>
            ))}
          </div>
        )}

        {(type === 'cafe' || type === 'shop') && (
          <div className="ag-category-pills">
            <button type="button" className="ag-category-svpill" aria-pressed={delivers} onClick={() => setDelivers((v) => !v)} data-testid="category-delivers">
              <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM5.5 15.5h5l3-6h3l2 6M13.5 9.5L12 6H9" /></svg>
              {t('category.delivers', 'Delivers')}
            </button>
          </div>
        )}

        {filtering && (
          <Chips scroll role="group" aria-label={t('category.applied', 'Filters on')} data-testid="category-applied">
            {[
              selectedLocation !== 'All Locations' && { k: 'loc', label: selectedLocation, off: () => setSelectedLocation('All Locations') },
              !!near && { k: 'near', label: radius ? `${t('filter.within', 'Within')} ${radius} km` : (sp.get('near') && sp.get('near') !== 'me' ? sp.get('near') : t('filter.my_location', 'My location')), off: () => { setNear(null); setRadius(null); } },
              !!maxPrice && { k: 'max', label: `≤ ₹${maxPrice.toLocaleString('en-IN')}`, off: () => setMaxPrice(undefined) },
              selectedCab !== 'all' && { k: 'cab', label: selectedCab === 'suv' ? t('ui.categoryFilterBar.cab_suv') : t('ui.categoryFilterBar.cab_hatchback'), off: () => setSelectedCab('all') },
              entryFilter !== 'all' && { k: 'entry', label: entryFilter === 'free' ? t('category.free_entry', 'Free entry') : t('category.paid_entry', 'Paid entry'), off: () => setEntryFilter('all') },
              !!kind && { k: 'kind', label: kind, off: () => setKind('') },
              delivers && { k: 'del', label: t('category.delivers', 'Delivers'), off: () => setDelivers(false) },
              trip.guests > 1 && { k: 'guests', label: t('widget.guest_count', { count: trip.guests }), off: () => setSp((prev) => { const n = new URLSearchParams(prev); n.delete('guests'); return n; }) },
            ].filter(Boolean).map((c: any) => (
              <Chip key={c.k} on onClick={c.off} aria-label={`${c.label}: ${t('common.remove', 'Remove')}`} data-testid={`applied-${c.k}`}>
                {c.label} <Icon name="close" className="!h-3 !w-3" />
              </Chip>
            ))}
          </Chips>
        )}

        <p className={searching || filtering ? 'ag-small m-0' : 'sr-only'} role="status" data-testid="category-count">{countLine}</p>

        {loading || smartPending ? (
          asRows ? (
            <div className="flex flex-col gap-2.5">{repeat(5, (i) => <ListRowSkeleton key={i} />)}</div>
          ) : (
            <div className="ag-category-grid">{repeat(6, (i) => <GridTileSkeleton key={i} />)}</div>
          )
        ) : results.length === 0 ? (
          <div data-testid="category-empty" className="flex flex-col gap-4">
            {!searching && filtering ? (
              <Box className="ag-category-empty" data-testid="category-none-filtered">
                <p className="m-0">{t('category.none_filtered', 'Nothing matches these filters.')}</p>
                <Button onClick={resetFilters} icon={<Icon name="close" />} data-testid="category-clear-filters">{t('category.clear', 'Clear filters')}</Button>
              </Box>
            ) : searching ? (
              <Box className="ag-category-empty">
                <p className="m-0">
                  {type
                    ? t('category.none_in_category', { category: t(`categories.${type}`), query: routeTrip || q || searchQuery })
                    : t('category.none', 'Nothing found. Try another place or word.')}
                </p>
                {type && (routeTrip || q || searchQuery) && (
                  <ButtonLink to={`/search?q=${encodeURIComponent(routeTrip || q || searchQuery)}`} go icon={<Icon name="search" />} data-testid="search-all-categories">
                    {t('category.search_all')}
                  </ButtonLink>
                )}
              </Box>
            ) : (
              <EmptyCategory />
            )}

            {elsewhere.length > 0 && (
              <section data-testid="results-elsewhere" aria-labelledby="elsewhere-h">
                <SecHead id="elsewhere-h" title={t('category.found_elsewhere', { count: elsewhere.length, query: routeTrip || q || searchQuery })} />
                <p className="ag-small -mt-1 mb-3">{t('category.found_elsewhere_note')}</p>
                <div className="flex flex-col gap-2.5">
                  {elsewhere.map((it: any) => <ListRow key={it.id} it={it} href={listingHref(it.id)} testId={`grid-tile-${it.id}`} />)}
                </div>
              </section>
            )}
          </div>
        ) : (
          resultsOf(results)
        )}
        {type === 'spot' && <SuggestPlace />}
      </div>
    </div>
  );
}

/** "No listings here yet": our number to call, a way to copy it, and a way to list yourself. */
function EmptyCategory() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(SUPPORT_PHONE).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };
  return (
    <Box className="ag-category-empty">
      <p className="m-0">{t('category.empty')}</p>
      <a className="phone" href={`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`}>{SUPPORT_PHONE}</a>
      <div className="flex flex-col items-center gap-3" data-testid="category-empty-actions">
        <Button onClick={copy} aria-live="polite" data-testid="category-copy-phone">
          {copied ? t('category.copied', 'Copied') : t('category.copy', 'Copy number')}
        </Button>
        <ButtonLink to="/provider/onboard" go data-testid="category-empty-list">{t('category.list_mine', 'Add my homestay, car or shop')}</ButtonLink>
      </div>
    </Box>
  );
}

/** Find a ride (prototype ridesearch.js): where from, where to and the day; the list then puts the drivers who cover it first. */
function RideSearch({ from, to, date, onSearch, onClear }: {
  from: string; to: string; date: string;
  onSearch: (from: string, to: string, date: string) => void; onClear: () => void;
}) {
  const { t } = useTranslation();
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const [f, setF] = useState(from);
  const [tt, setTt] = useState(to);
  const [d, setD] = useState(date || today);
  const [err, setErr] = useState('');
  useEffect(() => { setF(from); setTt(to); }, [from, to]);
  useEffect(() => { if (date) setD(date); }, [date]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.trim() || !tt.trim()) { setErr(t('category.rs_need', 'Pick where from and where to.')); return; }
    setErr('');
    onSearch(f.trim(), tt.trim(), d && d >= today ? d : '');
  };
  return (
    <form className="ag-box blush ag-category-rsbox" onSubmit={submit} data-testid="ride-search">
      <h2>{t('category.rs_h', 'Find a ride')}</h2>
      <p className="ag-small m-0">{t('category.rs_s', 'Where from, where to and when. We show drivers who cover that route first.')}</p>
      <datalist id="ride-places">{RIDE_PLACES.map((p) => <option key={p} value={p} />)}</datalist>
      <label className="ag-field">
        <span>{t('widget.from', 'From')}</span>
        <span className="ag-category-locin">
          <Icon name="search" />
          <input className="ag-in" type="search" list="ride-places" autoComplete="off" value={f} onChange={(e) => setF(e.target.value)}
            placeholder={t('category.find_place', 'Search a place')} data-testid="ride-from" />
        </span>
      </label>
      <label className="ag-field">
        <span>{t('widget.to', 'To')}</span>
        <span className="ag-category-locin">
          <Icon name="search" />
          <input className="ag-in" type="search" list="ride-places" autoComplete="off" value={tt} onChange={(e) => setTt(e.target.value)}
            placeholder={t('category.find_place', 'Search a place')} data-testid="ride-to" />
        </span>
      </label>
      <label className="ag-field">
        <span>{t('category.journey_date', 'Journey date')}</span>
        <input className="ag-in" type="date" min={today} value={d} onChange={(e) => setD(e.target.value)} data-testid="ride-date" />
      </label>
      {err && <p className="ag-err" role="alert">{err}</p>}
      <div className="ag-row">
        <button type="submit" className="ag-btn primary" data-testid="ride-go"><Icon name="search" /><span>{t('category.rs_go', 'Search drivers')}</span></button>
        {(from || to) && <button type="button" className="ag-btn text" onClick={onClear} data-testid="ride-clear">{t('category.rs_clear', 'Clear')}</button>}
      </div>
    </form>
  );
}
