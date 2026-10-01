import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import FeedCard from '@/components/FeedCard';
import SmartImg from '@/components/SmartImg';
import Seo from '@/components/Seo';
import { FeedCardSkeleton, GridTileSkeleton, LoadingStatus, repeat } from '@/components/skeletons';
import { SquaresFour as LayoutGrid, Rows as Rows3, MapPin, ArrowRight, CalendarDots as CalendarRange, Users, MagnifyingGlass as SearchIcon, Mountains as Mountain } from '@phosphor-icons/react';
import CategoryFilterBar from '@/components/CategoryFilterBar';
import { contentFor, listingImage } from '@/lib/listingContent';
import { routesCoverTrip } from '@/lib/routeFares';
import { readTrip, hasTrip, tripSuffix } from '@/lib/tripParams';
import { cardCtaKey } from '@/lib/cardCta';
import { formatDay, formatRange } from '@/lib/dates';

const TYPE_MAP = {
  spots: 'spot',
  homestays: 'homestay',
  drivers: 'driver',
  shops: 'shop',
  cafes: 'cafe',
  events: 'event',
  biodiversity: 'biodiversity',
};

const OFFBEAT_PLACES = [
  {
    name: 'Lamahatta',
    line: 'Pine forest park with a small lake at the top',
    tag: 'Pine Forest',
    image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80',
  },
  {
    name: 'Takdah',
    line: 'Old cantonment village with an orchid centre',
    tag: 'Heritage Village',
    image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?w=800&q=80',
  },
  {
    name: 'Sittong',
    line: 'Orange orchards, best in the winter harvest',
    tag: 'Orange Valley',
    image: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80',
  },
  {
    name: 'Chatakpur',
    line: 'Eco-village inside Senchal Wildlife Sanctuary',
    tag: 'Eco Sanctuary',
    image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80',
  },
  {
    name: 'Tinchuley',
    line: 'Village viewpoints over the Teesta valley',
    tag: 'Teesta Views',
    image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
  },
  {
    name: 'Mungpoo',
    line: 'Cinchona plantations and the Tagore house',
    tag: 'Cinchona & Tagore',
    image: 'https://images.unsplash.com/photo-1584395631446-e41b0fc3f68d?w=800&q=80',
  },
  {
    name: 'Lepchajagat',
    line: 'Forest hamlet on the road to Sukhiapokhri',
    tag: 'Quiet Hamlet',
    image: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80',
  },
];

export default function Category({ typeOverride }) {
  const { t, i18n } = useTranslation();
  const { type: paramType } = useParams();
  const [sp] = useSearchParams();
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
  const [view, setView] = useState('grid'); // 'grid' or 'feed'

  // Interactive Filter & Search states
  const [searchQuery, setSearchQuery] = useState(q);
  const [selectedLocation, setSelectedLocation] = useState('All Locations');
  const [sortOrder, setSortOrder] = useState<'recommended' | 'price_asc' | 'price_desc' | 'name_asc'>('recommended');
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [selectedCab, setSelectedCab] = useState<string>('all');
  const [entryFilter, setEntryFilter] = useState<string>('all');

  useEffect(() => {
    setSearchQuery(q);
  }, [q]);

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
  const baseResults = (type === 'driver' && routeTrip)
    ? items.filter((it) => routesCoverTrip(contentFor(it).routes || [], from, to))
    : items;

  // Realtime Filter & Sorting Pipeline
  const results = useMemo(() => {
    let list = [...baseResults];

    if (searchQuery.trim()) {
      const s = searchQuery.trim().toLowerCase();
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

    if (sortOrder === 'price_asc') {
      list.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    } else if (sortOrder === 'price_desc') {
      list.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    } else if (sortOrder === 'name_asc') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    return list;
  }, [baseResults, searchQuery, selectedLocation, maxPrice, selectedCab, entryFilter, sortOrder]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedLocation('All Locations');
    setSortOrder('recommended');
    setMaxPrice(undefined);
    setSelectedCab('all');
    setEntryFilter('all');
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

  const title = routeTrip || (q ? `“${q}”` : type ? t(`categories.${type}`) : t('nav.discover'));
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

  const priceBadge = (it: any) => {
    if (it.price > 0) return `₹${it.price}`;
    if (it.extras?.entry_fee) return it.extras.entry_fee;
    if (it.type === 'spot' || it.type === 'biodiversity' || it.type === 'event') return t('common.entry_varies');
    return '';
  };

  const gridTiles = (list: any[]) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
      {list.map((it) => {
        const badge = priceBadge(it);
        return (
          <div key={it.id} data-testid={`grid-tile-${it.id}`} className="flex flex-col rounded-xl sm:rounded-2xl bg-white border border-[var(--line)] overflow-hidden btn-hover">
            <Link to={listingHref(it.id)} className="block relative aspect-square overflow-hidden bg-mist group">
              <SmartImg src={listingImage(it, 600, 600)} alt={it.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute bottom-0 inset-x-0 p-2 sm:p-3 text-white">
                <div className="font-display font-extrabold text-xs sm:text-sm md:text-base leading-tight line-clamp-2 drop-shadow">{it.title}</div>
                <div className="text-[10px] text-white/90 flex items-center gap-1 mt-0.5"><MapPin size={10} /> <span className="line-clamp-1">{it.location}</span></div>
              </div>
              {badge && (
                <div className="absolute top-2 right-2 max-w-[75%] truncate px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-white border border-white/20 text-[11px] font-extrabold shadow-sm">
                  {badge}
                </div>
              )}
            </Link>
            <div className="p-2 sm:p-3">
              <Link to={listingHref(it.id)} data-testid={`grid-cta-${it.id}`}
                className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-full bg-flag text-white font-bold text-xs btn-hover">
                {t(cardCtaKey(it.type))} <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-8">
      <Seo
        title={searching ? `${t('category.search')}: ${routeTrip || q}` : (type ? t(`categories.${type}`) : t('nav.discover'))}
        noindex={searching || hasTrip(trip)}
      />

      {/* Sticky sub-header */}
      <div className="flex items-end justify-between mb-4 md:mb-6">
        <div>
          {searching && (
            <div className="text-[11px] font-bold uppercase tracking-widest text-flag">
              {type ? `${t('category.search')} · ${t(`categories.${type}`)}` : t('category.search')}
            </div>
          )}
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">{title}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {loading ? t('common.loading') : t('category.results', { count: results.length })}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1 p-1 rounded-full bg-white border border-[var(--line)]">
          <button onClick={() => setView('grid')} data-testid="view-grid" type="button"
            aria-label={t('category.view_grid')} aria-pressed={view === 'grid'}
            className={`p-2 rounded-full ${view === 'grid' ? 'bg-mist text-pine' : 'text-ink-soft'}`}>
            <LayoutGrid size={16} />
          </button>
          <button onClick={() => setView('feed')} data-testid="view-feed" type="button"
            aria-label={t('category.view_list')} aria-pressed={view === 'feed'}
            className={`p-2 rounded-full ${view === 'feed' ? 'bg-mist text-pine' : 'text-ink-soft'}`}>
            <Rows3 size={16} />
          </button>
        </div>
      </div>

      {hasTrip(trip) && (
        <div data-testid="trip-summary" className="mb-4 flex flex-wrap items-center gap-2">
          {dateSummary && (
            <span className="chip bg-white border border-[var(--line)] text-ink">
              <CalendarRange size={13} className="mr-1.5" /> {dateSummary}
            </span>
          )}
          {trip.guests > 1 && (
            <span className="chip bg-white border border-[var(--line)] text-ink">
              <Users size={13} className="mr-1.5" /> {t('widget.guest_count', { count: trip.guests })}
            </span>
          )}
        </div>
      )}

      {/* Offbeat rail when viewing Spots */}
      {type === 'spot' && !searching && (
        <section className="mb-8 pt-1">
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest text-flag">{t('home.hidden_gems', 'HIDDEN GEMS')}</div>
              <h2 className="font-display font-extrabold text-xl md:text-2xl text-ink mt-0.5">{t('home.offbeat', 'Offbeat & Quiet Villages')}</h2>
              <p className="text-xs text-ink-soft mt-0.5">{t('home.offbeat_sub', 'Quieter villages a day trip or a night away from town')}</p>
            </div>
          </div>
          <div className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 pb-2">
            {OFFBEAT_PLACES.map((place) => (
              <Link
                key={place.name}
                to={`/discover?q=${encodeURIComponent(place.name)}`}
                className="flex-shrink-0 w-[70%] sm:w-[45%] md:w-[28%] rounded-2xl overflow-hidden bg-white border border-[var(--line)] btn-hover"
              >
                <div className="aspect-[4/5] relative bg-mist overflow-hidden">
                  <SmartImg src={place.image} alt={place.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/35" />
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full bg-black/50 backdrop-blur border border-white/20 text-[10px] font-bold text-white tracking-wider flex items-center gap-1">
                      <MapPin size={10} weight="fill" /> {place.tag}
                    </span>
                    <span className="w-6 h-6 rounded-full bg-black/40 backdrop-blur border border-white/20 grid place-items-center text-white">
                      <ArrowRight size={12} className="-rotate-45" />
                    </span>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 p-3 md:p-4 text-white">
                    <div className="font-display font-extrabold text-lg md:text-xl leading-tight drop-shadow">{place.name}</div>
                    <div className="text-xs text-white/85 line-clamp-2 mt-1 leading-snug">{place.line}</div>
                    <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-pine font-bold text-xs">
                      <Mountain size={12} weight="fill" /> {t('cta.explore', 'Explore')}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Universal Search & Filter Component */}
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
      />

      {loading ? (
        <>
          <LoadingStatus label={t('common.loading')} />
          {view === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
              {repeat(8, (i) => <GridTileSkeleton key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
              {repeat(4, (i) => <FeedCardSkeleton key={i} />)}
            </div>
          )}
        </>
      ) : results.length === 0 ? (
        <div data-testid="category-empty">
          <div className="mist-panel p-8 md:p-10 text-center">
            <p className="text-ink-soft">
              {searching && type
                ? t('category.none_in_category', { category: t(`categories.${type}`), query: routeTrip || q })
                : t('category.empty')}
            </p>
            {searching && (
              <Link
                to={`/search?q=${encodeURIComponent(routeTrip || q)}`}
                data-testid="search-all-categories"
                className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-pine text-white font-bold btn-hover"
              >
                <SearchIcon size={15} /> {t('category.search_all')}
              </Link>
            )}
          </div>

          {elsewhere.length > 0 && (
            <section className="mt-10" data-testid="results-elsewhere">
              <h2 className="font-display font-extrabold text-xl md:text-2xl text-ink">
                {t('category.found_elsewhere', { count: elsewhere.length, query: routeTrip || q })}
              </h2>
              <p className="mt-1 mb-4 text-sm text-ink-soft">{t('category.found_elsewhere_note')}</p>
              {gridTiles(elsewhere)}
            </section>
          )}
        </div>
      ) : view === 'grid' ? (
        // Instagram Explore-style grid: tight, image-first
        gridTiles(results)
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          {results.map((it, i) => <FeedCard key={it.id} item={it} priority={i < 2} tripSuffix={suffix} />)}
        </div>
      )}
    </div>
  );
}
