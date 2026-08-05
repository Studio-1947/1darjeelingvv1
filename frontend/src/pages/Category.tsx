import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import FeedCard from '@/components/FeedCard';
import SmartImg from '@/components/SmartImg';
import Seo from '@/components/Seo';
import { FeedCardSkeleton, GridTileSkeleton, LoadingStatus, repeat } from '@/components/skeletons';
import { LayoutGrid, Rows3, MapPin, ArrowRight, CalendarRange, Users, Search as SearchIcon } from 'lucide-react';
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setElsewhere([]);
    api.get('/listings', { params: { type, q: q || undefined, limit: 60 } })
      .then((r) => { if (!cancelled) setItems(r.data.items || []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type, q]);

  // Narrowed here rather than in the query: a driver's routes live in
  // `extras.routes` or - for the seeded drivers - only in the editorial map, so
  // `contentFor` is the one place that sees both and the API can't filter on it.
  const routeTrip = [from.trim(), to.trim()].filter(Boolean).join(' → ');
  const results = (type === 'driver' && routeTrip)
    ? items.filter((it) => routesCoverTrip(contentFor(it).routes || [], from, to))
    : items;

  const searching = !!(q || routeTrip);

  /**
   * A type-scoped search that finds nothing is not the same answer as "there is
   * nothing here", and the site was giving the second.
   *
   * The hero search defaults to the Stays tab and offers Tiger Hill, Ghum and
   * Darjeeling as popular destinations - but Tiger Hill is a viewpoint, so
   * /search?type=homestay&q=Tiger+Hill correctly returned zero homestays and
   * told a first-time visitor there was no inventory, while /search?q=Tiger+Hill
   * had a result waiting (QA 2.1). Rather than quietly widening the search - the
   * category *is* what the visitor picked - we keep the honest empty answer and
   * show what the same words find everywhere else.
   */
  // A driver search is a route, so the arrow-joined "A → B" that titles the page
  // matches nothing as free text - the destination is the searchable half of it.
  const fallbackTerm = q || to.trim() || from.trim();

  useEffect(() => {
    if (loading || !searching || !type || results.length > 0 || !fallbackTerm) return;
    let cancelled = false;
    api.get('/listings', { params: { q: fallbackTerm, limit: 12 } })
      .then((r) => { if (!cancelled) setElsewhere((r.data.items || []).filter((it) => it.type !== type)); })
      .catch(() => { if (!cancelled) setElsewhere([]); });
    return () => { cancelled = true; };
  }, [loading, searching, type, results.length, fallbackTerm]);

  const title = routeTrip || (q ? `“${q}”` : type ? t(`categories.${type}`) : t('nav.discover'));
  // Dates and party size stay attached to every listing link, so the booking form
  // opens already filled in with what was typed into the hero search (QA 2.2).
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

  /**
   * The badge over a card's photo.
   *
   * Spots mostly have no `price` - only 2 of 6 carried one - so most cards had a
   * bare corner while their neighbours showed a fare, which reads as missing data
   * rather than as "free to walk into" (QA 4.3). An admin-entered entry fee is
   * used where there is one, and everything else says so in words.
   */
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
              {/* listingImage, not the raw `it.image`: a seeded row's image column
                  holds one of five shared stock photos, so the grid showed the same
                  Himalayan peak on card after card and read as fabricated inventory
                  (QA 3.7). listingImage keeps a genuine upload and gives everything
                  else a picture of its own. */}
              <SmartImg src={listingImage(it, 600, 600)} alt={it.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <div className="absolute bottom-0 inset-x-0 p-2 sm:p-3 text-white">
                <div className="font-display font-extrabold text-xs sm:text-sm md:text-base leading-tight line-clamp-2 drop-shadow">{it.title}</div>
                <div className="text-[10px] text-white/90 flex items-center gap-1 mt-0.5"><MapPin size={10} /> <span className="line-clamp-1">{it.location}</span></div>
              </div>
              {/* max-w + truncate: an admin's entry fee is free text and can run
                  to "₹30 per person, ₹100 camera" - long enough to cross the tile. */}
              {badge && (
                <div className="absolute top-2 right-2 max-w-[75%] truncate px-2 py-0.5 rounded-full bg-white/95 text-ink text-[11px] font-extrabold">
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
        // A search result set is not a page worth indexing separately, and every
        // permutation of dates would otherwise be its own URL to Google. The
        // category landing pages themselves stay indexable.
        noindex={searching || hasTrip(trip)}
      />

      {/* Sticky sub-header */}
      <div className="flex items-end justify-between mb-4 md:mb-6">
        <div>
          {/* The category is part of the answer, not just the query: a search
              made from the Stays tab returns stays, and the eyebrow says so. */}
          {searching && (
            <div className="text-[11px] font-bold uppercase tracking-widest text-flag">
              {type ? `${t('category.search')} · ${t(`categories.${type}`)}` : t('category.search')}
            </div>
          )}
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">{title}</h1>
          {/* A count of 0 while the request is still out reads as "nothing here". */}
          <p className="mt-1 text-sm text-ink-soft">
            {loading ? t('common.loading') : t('category.results', { count: results.length })}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1 p-1 rounded-full bg-white border border-[var(--line)]">
          {/* Icon-only, so each carries its own name - a screen reader otherwise
              announces the pair as "button, button" (QA 5.1). */}
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

      {/* What the hero search was actually asked for. Shown rather than silently
          applied: these are carried on to the booking form, so the visitor should
          be able to see - and correct - them before they get there. */}
      {hasTrip(trip) && (
        <div data-testid="trip-summary" className="mb-5 flex flex-wrap items-center gap-2">
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
