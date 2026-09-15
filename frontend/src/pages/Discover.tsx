import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { listingImage, sizedImage } from '@/lib/listingContent';
import FeedCard from '@/components/FeedCard';
import SmartImg from '@/components/SmartImg';
import Seo from '@/components/Seo';
import BookingWidget from '@/components/BookingWidget';
import HeroMedia from '@/components/HeroMedia';
import RouteEstimator from '@/components/RouteEstimator';
import { CATEGORIES } from '@/constants/categories';
import { FeedCardSkeleton, SpotTileSkeleton, StayTileSkeleton, LoadingStatus, repeat } from '@/components/skeletons';
import { Mountains as Mountain, ArrowRight, Compass, TrendUp as TrendingUp, CaretLeft as ChevronLeft, CaretRight as ChevronRight, Ticket as PassIcon } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import { isSupportActive } from '@/lib/support';
import { MobileScreen, MobilePhoto, HomeHeaderActions, MobileSearchWidget, FilterPill, Card, Touch, Tag, Rating, Slab } from '@/components/mobile';

const RED_PANDA = 'https://images.unsplash.com/photo-1542880941-1abfea46bba6';
const HERO_POSTER = 'https://images.unsplash.com/photo-1544735716-392fe2489ffa';

// Each deal sits on a real photo of what it sells rather than a flat colour
// block; the gradient stays underneath as the fallback while the image loads.
// Copy lives in the locale files under home.deals.<key> - resolved at render so
// it follows the language switcher.
const DEALS = [
  { key: 'monsoon', color: 'from-pine to-pine-dark', to: '/homestays', image: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05' },
  { key: 'sunrise', color: 'from-flag to-[#8a1e1e]', to: '/drivers', image: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa' },
  { key: 'tea', color: 'from-gold to-[#c69108]', to: '/spots', image: 'https://images.pexels.com/photos/103875/pexels-photo-103875.jpeg' },
];

// Six fills three rows of the two-column desktop grid exactly, and is about as
// far as anyone scrolls a phone before wanting a control rather than more feed.
const FEED_PAGE_SIZE = 6;

// The pills use the short nav.* labels rather than the editorial categories.*
// ones, which are too long to sit in a row of chips.
const NAV_LABEL_KEY: Record<string, string> = {
  spot: 'spots',
  homestay: 'homestays',
  driver: 'drivers',
  shop: 'shops',
  cafe: 'cafes',
  event: 'events',
  biodiversity: 'biodiversity',
};

/**
 * Page numbers to render, with `null` standing in for a gap.
 * Everything fits while there are few pages; past that it stays a fixed width
 * by windowing around the current page so the control never wraps on a phone.
 */
function pageWindow(current: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const around = [current - 1, current, current + 1].filter((p) => p > 0 && p < count - 1);
  const pages = Array.from(new Set([0, ...around, count - 1])).sort((a, b) => a - b);
  return pages.flatMap((p, i) => (i > 0 && p - pages[i - 1] > 1 ? [null, p] : [p]));
}

export default function Discover() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { user } = useAuth();
  const [feed, setFeed] = useState([]);
  const [spots, setSpots] = useState([]);
  const [homestays, setHomestays] = useState([]);
  // Mobile Home only (see the block lg:hidden tree below) - a single live
  // species listing for the biodiversity spotlight, and a small cafe sample
  // for the "cafes near you" quick tile's count, matching RN's
  // useListings('biodiversity', {limit:1}) / useListings('cafe', {limit:24}).
  const [spotlight, setSpotlight] = useState(null);
  const [cafes, setCafes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedType, setFeedType] = useState('all');
  const [feedPage, setFeedPage] = useState(0);
  const spotsScrollRef = useRef<HTMLDivElement>(null);
  const feedTopRef = useRef<HTMLElement>(null);
  const pointerRestoreRef = useRef<number>(undefined);

  // Only offer a pill for a type the feed actually contains, in the canonical
  // category order - an "Events" tab that always lands on an empty grid is
  // worse than no tab. Counts come along so each pill can show its weight.
  const feedTabs = useMemo(() => {
    const counts = feed.reduce((acc, it) => {
      acc[it.type] = (acc[it.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return [
      { key: 'all', label: t('home.filter_all'), count: feed.length },
      ...CATEGORIES
        .filter(({ key }) => counts[key])
        .map(({ key }) => ({ key, label: t(`nav.${NAV_LABEL_KEY[key]}`), count: counts[key] })),
    ];
  }, [feed, t]);

  const filteredFeed = useMemo(
    () => (feedType === 'all' ? feed : feed.filter((it) => it.type === feedType)),
    [feed, feedType],
  );

  const pageCount = Math.max(1, Math.ceil(filteredFeed.length / FEED_PAGE_SIZE));
  // Clamped rather than stored blindly: switching from a 24-item tab on page 4
  // to a 3-item tab would otherwise render an empty grid.
  const page = Math.min(feedPage, pageCount - 1);
  const visibleFeed = filteredFeed.slice(page * FEED_PAGE_SIZE, (page + 1) * FEED_PAGE_SIZE);

  const goToPage = (next: number) => {
    setFeedPage(next);
    // Paging without this leaves you at the bottom of the old page, looking at
    // the last two cards of the new one.
    feedTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selectTab = (key: string) => {
    setFeedType(key);
    setFeedPage(0);
  };

  const scrollSpots = (direction: 'left' | 'right') => {
    if (spotsScrollRef.current) {
      const container = spotsScrollRef.current;
      const scrollAmount = container.clientWidth * 0.75;
      // As cards glide under a stationary cursor, :hover flips on/off per card,
      // each firing a 200ms box-shadow/transform transition that repaints the
      // tile. Suspend pointer events until the smooth scroll settles.
      container.style.pointerEvents = 'none';
      window.clearTimeout(pointerRestoreRef.current);
      pointerRestoreRef.current = window.setTimeout(() => { container.style.pointerEvents = ''; }, 650);
      container.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const load = async () => {
          const [f, s, h, bio, c] = await Promise.all([
            api.get('/listings', { params: { limit: 40 } }),
            api.get('/listings', { params: { type: 'spot', limit: 8 } }),
            api.get('/listings', { params: { type: 'homestay', limit: 8 } }),
            api.get('/listings', { params: { type: 'biodiversity', limit: 1 } }),
            api.get('/listings', { params: { type: 'cafe', limit: 24 } }),
          ]);
          setSpots(s.data.items || []);
          setHomestays(h.data.items || []);
          setSpotlight((bio.data.items || [])[0] || null);
          setCafes(c.data.items || []);
          // interleave a feed with variety: homestay, spot, cafe, biodiversity...
          const all = f.data.items || [];
          const ordered = [
            ...all.filter((x) => x.type === 'homestay'),
            ...all.filter((x) => x.type === 'spot'),
            ...all.filter((x) => x.type === 'cafe'),
            ...all.filter((x) => x.type === 'biodiversity'),
            ...all.filter((x) => x.type === 'driver'),
            ...all.filter((x) => x.type === 'shop'),
            ...all.filter((x) => x.type === 'event'),
          ];
          setFeed(ordered);
          return ordered.length;
        };
        // An empty feed is not something a visitor can fix: seeding now lives
        // behind POST /api/admin/seed (auth + admin) and is triggered from the
        // admin panel. The old unauthenticated /dev/seed route was removed on
        // purpose - backend/test/admin.test.ts asserts it stays a 404.
        await load();
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Mobile Home greeting - no weather data source: RN's own useWeather() calls
  // GET /api/weather, which doesn't exist on this shared backend, so RN's real
  // behavior against it is the static greeting fallback. Porting that fallback
  // rather than wiring a new Open-Meteo-based greeting keeps this honest to
  // what RN actually does today, not a feature it has but can't reach.
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return t('mobileHome.greet_morning');
    if (h < 17) return t('mobileHome.greet_afternoon');
    return t('mobileHome.greet_evening');
  }, [t]);
  const firstName = user?.name ? user.name.split(' ')[0] : t('mobileHome.traveller');
  const featuredStay = homestays[0];

  return (
    <div>
      <Seo description={t('seo.home_description')} />

      {/* ============================================================= */}
      {/* DESKTOP & TABLET HOME (lg+) - unchanged                        */}
      {/* ============================================================= */}
      <div className="hidden lg:block">

      {/* HERO / Booking widget - starts at y=0 and carries the header height as
          padding, since the bar is drawn on top of the video. */}
      <section className="relative min-h-[100dvh] flex flex-col justify-center" data-hero>
        <HeroMedia poster={HERO_POSTER} />
        {/* Bottom padding outweighs the top on purpose: it lifts the centered
            block above the hero's midline so the search panel that opens under
            the bar has breathing space before the fold. */}
        <div className="relative z-10 mx-auto max-w-6xl w-full px-4 sm:px-6 md:px-8 pt-[calc(var(--header-h)+1rem)] pb-20 md:pt-[calc(var(--header-h)+2rem)] md:pb-28 flex-1 flex flex-col justify-center">
          <div className="text-white max-w-2xl">
            {/* data-hero-cutoff: the header drops its transparency the moment
                it would overlap this headline, instead of waiting for the whole
                hero to scroll away. */}
            <h1 data-hero-cutoff className="font-display font-extrabold text-[2.4rem] leading-[1.08] sm:text-5xl md:text-6xl tracking-tight drop-shadow-lg">
              {t('hero.title_1')}<br />{t('hero.title_2')}
            </h1>
            <p className="mt-4 md:mt-5 text-white/90 text-base sm:text-lg md:text-xl max-w-xl leading-relaxed drop-shadow">
              {t('hero.subtitle')}
            </p>
          </div>
          <div className="mt-7 md:mt-10">
            <BookingWidget />
          </div>
        </div>
      </section>

      {/* Deals strip (MMT-style) */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 pt-6 md:pt-8">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={18} className="text-flag" />
          <h2 className="font-display font-extrabold text-lg md:text-xl text-ink">{t('home.trending')}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {DEALS.map((d) => (
            <Link key={d.key} to={d.to} data-testid={`deal-${d.key}`}
              className={`relative overflow-hidden rounded-2xl p-4 md:p-5 text-white bg-gradient-to-br ${d.color} btn-hover min-h-[110px] flex flex-col justify-between`}>
              <img src={sizedImage(d.image, 600)} alt="" aria-hidden="true" loading="lazy"
                className="absolute inset-0 w-full h-full object-cover" />
              {/* Keeps the title and tag legible over whatever the photo does. */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/20" />
              <span className="relative inline-block w-fit px-2 py-0.5 rounded-full bg-white/25 backdrop-blur text-[10px] font-extrabold tracking-wider">{t(`home.deals.${d.key}.tag`)}</span>
              <div className="relative">
                <div className="font-display font-extrabold text-xl md:text-2xl leading-tight">{t(`home.deals.${d.key}.title`)}</div>
                <div className="text-sm text-white/90 mt-0.5">{t(`home.deals.${d.key}.sub`)}</div>
              </div>
              <ArrowRight size={18} className="absolute top-4 right-4 opacity-80" />
            </Link>
          ))}
        </div>

        {/* Route Estimator Section */}
        <div className="mt-8">
          <RouteEstimator />
        </div>
      </section>

      {/* Featured Spots - horizontal scroll (MMT style) */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 pt-8 md:pt-10">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-flag">{t('home.must_visit')}</div>
            <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink mt-0.5">{t('categories.spot')}</h2>
          </div>
          <Link to="/spots" className="text-sm font-bold text-pine whitespace-nowrap">{t('home.see_all')} →</Link>
        </div>
        <div className="relative group">
          {/* Left Navigation Arrow */}
          <button
            onClick={() => scrollSpots('left')}
            className="absolute -left-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white shadow-lg border border-[var(--line)] text-ink flex items-center justify-center transition-all hover:bg-mist active:scale-95 hidden md:flex"
            aria-label={t('home.scroll_left')}
          >
            <ChevronLeft size={20} className="text-ink" />
          </button>

          {/* Scroll Container */}
          <div
            ref={spotsScrollRef}
            className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 pb-2"
          >
            {loading && repeat(4, (i) => <SpotTileSkeleton key={i} />)}
            {spots.map((s) => (
              <Link key={s.id} to={`/listing/${s.id}`} data-testid={`spot-tile-${s.id}`}
                className="flex-shrink-0 w-[70%] sm:w-[45%] md:w-[30%] rounded-2xl overflow-hidden bg-white border border-[var(--line)] btn-hover">
                <div className="aspect-[4/5] relative bg-mist overflow-hidden">
                  {/* Per-listing, not the raw seed image five listings share - see
                      the note in Category.tsx's grid tile. */}
                  <SmartImg src={listingImage(s, 800, 1000)} alt={s.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <div className="absolute bottom-0 inset-x-0 p-3 md:p-4 text-white">
                    <div className="text-[10px] uppercase tracking-widest opacity-90">{s.location}</div>
                    <div className="font-display font-extrabold text-lg md:text-xl leading-tight drop-shadow line-clamp-2">{s.title}</div>
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-pine font-bold text-xs">
                      <Mountain size={12} /> {t('cta.explore')}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Right Navigation Arrow */}
          <button
            onClick={() => scrollSpots('right')}
            className="absolute -right-5 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white shadow-lg border border-[var(--line)] text-ink flex items-center justify-center transition-all hover:bg-mist active:scale-95 hidden md:flex"
            aria-label={t('home.scroll_right')}
          >
            <ChevronRight size={20} className="text-ink" />
          </button>
        </div>
      </section>

      {/* Homestays quick pick */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 pt-8 md:pt-10">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-flag">{t('home.stay_local')}</div>
            <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink mt-0.5">{t('categories.homestay')}</h2>
          </div>
          <Link to="/homestays" className="text-sm font-bold text-pine whitespace-nowrap">{t('home.see_all')} →</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {loading && repeat(4, (i) => <StayTileSkeleton key={i} />)}
          {homestays.slice(0, 4).map((h) => (
            <div key={h.id} data-testid={`stay-tile-${h.id}`} className="flex flex-col rounded-2xl overflow-hidden bg-white border border-[var(--line)] btn-hover">
              <Link to={`/listing/${h.id}`} className="block aspect-square bg-mist overflow-hidden">
                <SmartImg src={listingImage(h, 500, 500)} alt={h.title} className="w-full h-full object-cover" />
              </Link>
              <div className="p-3 flex-1 flex flex-col">
                <div className="font-display font-bold text-sm md:text-base text-ink line-clamp-1">{h.title}</div>
                <div className="text-[11px] text-ink-soft line-clamp-1 mt-0.5">{h.location}</div>
                <div className="mt-1.5 flex items-baseline gap-1">
                  <span className="font-extrabold text-pine text-sm md:text-base">₹{h.price}</span>
                  <span className="text-[10px] text-ink-soft">{t('common.per_head')}</span>
                </div>
                <Link to={`/listing/${h.id}`} data-testid={`stay-book-${h.id}`}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 py-2 rounded-full bg-flag text-white font-bold text-xs btn-hover">
                  {t('cta.book_now')} <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Instagram-style feed */}
      {/* scroll-mt clears the sticky header when paging jumps back up here. */}
      <section ref={feedTopRef} className="mx-auto max-w-6xl px-4 md:px-6 pt-10 md:pt-14 scroll-mt-[calc(var(--header-h)+1rem)]">
        <div className="flex items-center gap-2">
          <Compass size={20} className="text-pine" />
          <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">{t('home.explore_darjeeling')}</h2>
        </div>

        {/* Type filter. A horizontal scroller rather than a wrap, so the row
            stays one line on a phone and the header below it doesn't move as
            the selection changes. */}
        {!loading && feedTabs.length > 1 && (
          <div
            role="group"
            aria-label={t('home.filter_label')}
            data-testid="feed-filter"
            className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 pb-1"
          >
            {feedTabs.map(({ key, label, count }) => {
              const active = feedType === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectTab(key)}
                  aria-pressed={active}
                  data-testid={`feed-filter-${key}`}
                  className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-bold
                    border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine
                    ${active
                      ? 'bg-pine text-white border-pine'
                      : 'bg-white text-ink border-[var(--line)] hover:border-pine/40'}`}
                >
                  {label}
                  <span className={`text-[11px] font-extrabold ${active ? 'text-white/70' : 'text-ink-soft'}`}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          {loading ? (
            <>
              <LoadingStatus label={t('common.loading')} />
              {repeat(FEED_PAGE_SIZE, (i) => <FeedCardSkeleton key={i} />)}
            </>
          ) : (
            visibleFeed.map((it, idx) => (
              // Only the first page's opening cards are above the fold; the rest
              // stay lazy so paging doesn't eagerly fetch six full-size images.
              <FeedCard key={it.id} item={it} priority={page === 0 && idx < 2} />
            ))
          )}
        </div>

        {!loading && filteredFeed.length === 0 && (
          <div className="mist-panel p-8 text-center" data-testid="feed-empty">
            <p className="text-ink-soft">{t('category.empty')}</p>
          </div>
        )}

        {!loading && pageCount > 1 && (
          <nav
            aria-label={t('home.pagination_label')}
            data-testid="feed-pagination"
            className="mt-8 flex items-center justify-center gap-1.5"
          >
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page === 0}
              aria-label={t('home.prev_page')}
              data-testid="feed-page-prev"
              className="w-10 h-10 rounded-full grid place-items-center border border-[var(--line)] bg-white text-ink
                         disabled:opacity-40 disabled:cursor-not-allowed hover:border-pine/40 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>

            {pageWindow(page, pageCount).map((p, i) =>
              p === null ? (
                <span key={`gap-${i}`} aria-hidden="true" className="w-6 text-center text-ink-soft">…</span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => goToPage(p)}
                  aria-label={t('home.page_n', { page: p + 1 })}
                  aria-current={p === page ? 'page' : undefined}
                  data-testid={`feed-page-${p + 1}`}
                  className={`w-10 h-10 rounded-full text-sm font-bold border transition-colors
                    ${p === page
                      ? 'bg-pine text-white border-pine'
                      : 'bg-white text-ink border-[var(--line)] hover:border-pine/40'}`}
                >
                  {p + 1}
                </button>
              ),
            )}

            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= pageCount - 1}
              aria-label={t('home.next_page')}
              data-testid="feed-page-next"
              className="w-10 h-10 rounded-full grid place-items-center border border-[var(--line)] bg-white text-ink
                         disabled:opacity-40 disabled:cursor-not-allowed hover:border-pine/40 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </nav>
        )}

        {/* Announced to screen readers on every page change; the numbers above
            convey this visually but never as a live update. */}
        {!loading && filteredFeed.length > 0 && (
          <p role="status" aria-live="polite" data-testid="feed-range" className="mt-3 text-center text-xs text-ink-soft">
            {t('home.showing_range', {
              from: page * FEED_PAGE_SIZE + 1,
              to: Math.min((page + 1) * FEED_PAGE_SIZE, filteredFeed.length),
              total: filteredFeed.length,
            })}
          </p>
        )}
      </section>

      {/* Provider CTA banner */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 pt-10 md:pt-14">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-pine to-pine-dark text-white p-6 md:p-10">
          <div className="max-w-lg relative z-10">
            <span className="chip bg-white/15 !text-black backdrop-blur">{t('home.one_time_fee')}</span>
            <h3 className="mt-3 font-display font-extrabold text-2xl sm:text-3xl md:text-4xl leading-tight">{t('provider.onboard_title')}</h3>
            <p className="mt-2 text-white/90 text-sm md:text-base">{t('provider.onboard_sub')}</p>
            <Link to="/provider/onboard" data-testid="banner-provider-cta" className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white text-pine font-extrabold btn-hover">
              {t('hero.cta_provider')} <ArrowRight size={16} />
            </Link>
          </div>
          <img src={sizedImage(RED_PANDA, 400)} alt="" className="absolute -right-8 -bottom-8 md:right-6 md:bottom-6 w-40 h-40 md:w-52 md:h-52 rounded-full object-cover border-4 border-white/20 opacity-90" />
        </div>
      </section>

      </div>

      {/* ============================================================= */}
      {/* MOBILE HOME (< lg) - matches 1-Darjeeling-Mobile-App's          */}
      {/* app/(tourist)/home.tsx structure: greeting, search, featured    */}
      {/* stay, biodiversity spotlight, two quick tiles, pass nudge.      */}
      {/* Ends there - no deals strip/RouteEstimator/carousel/grid/feed   */}
      {/* on mobile, per the Phase 2 plan's "match RN exactly" decision.  */}
      {/* ============================================================= */}
      <MobileScreen tone="light" className="block lg:hidden pb-[calc(var(--bottom-nav-h)+1rem)]">
        <div className="px-[var(--mu-gutter)] pt-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-[var(--mu-text-muted)]">
                {greeting} {firstName} 👋
              </div>
              {/* RN's headline here is a weather line from a backend endpoint
                  (GET /api/weather) this shared backend doesn't have - its own
                  fallback is a static, fabricated-sounding sentence ("Darjeeling
                  is misty ☁ 14°"), which this codebase's "never fabricate"
                  principle argues against porting even as a fallback. The
                  existing, real brand tagline fills the same visual slot instead. */}
              <div className="mt-0.5 font-[family-name:var(--mu-font-display)] font-black text-2xl leading-tight text-[var(--mu-ink)] tracking-tight">
                {t('brand_tagline')}
              </div>
            </div>
            <HomeHeaderActions />
          </div>

          <div className="mt-3.5">
            <MobileSearchWidget />
          </div>
        </div>

        {/* Filter pills - RN's home filters (All/Stays/Rides/Eat/Nature). Eat has
            no combined cafes+shops route yet, so it points at /cafes as a
            placeholder (see Phase 2 plan). */}
        <div className="mt-3.5 flex gap-2 px-[var(--mu-gutter)] pb-1 overflow-x-auto no-scrollbar">
          <FilterPill active>{t('mobileHome.filter_all')}</FilterPill>
          <FilterPill onClick={() => nav('/homestays')}>🏠 {t('nav.stays')}</FilterPill>
          <FilterPill onClick={() => nav('/drivers')}>🚕 {t('nav.rides')}</FilterPill>
          <FilterPill onClick={() => nav('/eat')}>☕ {t('mobileHome.filter_eat')}</FilterPill>
          <FilterPill onClick={() => nav('/nature')}>🌿 {t('nav.nature')}</FilterPill>
        </div>

        <div className="mt-3 px-[var(--mu-gutter)] space-y-3">
          {/* Featured stay - omitted rather than faked when nothing is live. */}
          {featuredStay && (
            <Link to={`/listing/${featuredStay.id}`}>
              <Card className="overflow-hidden">
                <div className="relative">
                  <MobilePhoto src={listingImage(featuredStay, 800, 500)} alt={featuredStay.title} className="h-32" radius="0" />
                  <Tag className="absolute top-2.5 left-3">{t('mobileHome.rating_new')}</Tag>
                </div>
                <div className="px-4 pt-3 pb-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex-1 min-w-0 truncate font-[family-name:var(--mu-font-display)] font-bold text-[16.5px] text-[var(--mu-ink)]">
                      {featuredStay.title}
                    </span>
                    <Rating value={featuredStay.rating} />
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--mu-text-muted)]">
                    {featuredStay.location} · ₹{featuredStay.price}{t('common.per_head')}
                  </div>
                </div>
              </Card>
            </Link>
          )}

          {/* Biodiversity spotlight - a real species listing, or nothing. */}
          {spotlight && (
            <Link to={`/listing/${spotlight.id}`}>
              <div className="rounded-[var(--mu-r-card)] px-[18px] pt-[15px] pb-[14px]" style={{ background: 'var(--mu-green)' }}>
                <Slab className="text-[var(--mu-sage)]">{t('mobileHome.spotlight_label')}</Slab>
                <div className="mt-1.5 font-[family-name:var(--mu-font-display)] font-black text-[18.5px] leading-snug text-[var(--mu-cream)]">
                  {spotlight.title}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="flex-1 min-w-0 truncate text-xs text-[var(--mu-text-on-dark-muted)]">
                    {spotlight.location}
                  </span>
                  <span className="px-4 py-2 rounded-[var(--mu-r-chip)]" style={{ background: 'var(--mu-lime)' }}>
                    <span className="text-xs font-bold" style={{ color: 'var(--mu-lime-ink)' }}>
                      {t('mobileHome.spotlight_open')}
                    </span>
                  </span>
                </div>
              </div>
            </Link>
          )}

          {/* Two quick tiles - each carries a real photo and a count it can
              stand behind, never a fabricated stat. */}
          <div className="flex gap-3">
            <Link to="/culture" className="flex-1">
              <Card className="p-3">
                <MobilePhoto src={listingImage(spots[0], 300, 200)} alt="" radius="var(--mu-r-tile-sm)" className="h-[50px]" />
                <div className="mt-2 text-[13px] font-bold text-[var(--mu-ink)]">{t('mobileHome.toy_train_title')}</div>
              </Card>
            </Link>
            <Link to="/eat" className="flex-1">
              <Card className="p-3">
                <MobilePhoto src={listingImage(cafes[0], 300, 200)} alt="" radius="var(--mu-r-tile-sm)" className="h-[50px]" />
                <div className="mt-2 text-[13px] font-bold text-[var(--mu-ink)]">{t('mobileHome.cafes_title')}</div>
                {cafes.length > 0 && (
                  <div className="text-[11.5px] text-[var(--mu-text-faint)]">
                    {cafes.length} {t('mobileHome.cafes_listed')}
                  </div>
                )}
              </Card>
            </Link>
          </div>

          {/* Pass nudge - only until the user has one, matching RN's
              {!state.hasPass ? ... : null}. Guarded for anonymous visitors:
              isSupportActive expects a user object, not null. */}
          {!(user && isSupportActive(user)) && (
            <Link to="/support">
              <div className="flex items-center gap-3 rounded-[var(--mu-r-card-sm)] px-4 py-3.5" style={{ background: 'var(--mu-green-tint)' }}>
                <PassIcon size={20} className="text-[var(--mu-green)] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-[var(--mu-green)]">
                    {t('mobileHome.pass_title_pre')} {t('mobileHome.pass_title_price')}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-[var(--mu-text-body)]">{t('mobileHome.pass_browse_free')}</div>
                </div>
                <span className="font-bold text-base text-[var(--mu-green)]">→</span>
              </div>
            </Link>
          )}
        </div>
      </MobileScreen>
    </div>
  );
}
