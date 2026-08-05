import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { listingImage, sizedImage } from '@/lib/listingContent';
import FeedCard from '@/components/FeedCard';
import SmartImg from '@/components/SmartImg';
import Seo from '@/components/Seo';
import BookingWidget from '@/components/BookingWidget';
import HeroMedia from '@/components/HeroMedia';
import { CATEGORIES } from '@/constants/categories';
import { FeedCardSkeleton, SpotTileSkeleton, StayTileSkeleton, LoadingStatus, repeat } from '@/components/skeletons';
import { Mountain, ArrowRight, Sparkles, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';

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
  const [feed, setFeed] = useState([]);
  const [spots, setSpots] = useState([]);
  const [homestays, setHomestays] = useState([]);
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
          const [f, s, h] = await Promise.all([
            api.get('/listings', { params: { limit: 40 } }),
            api.get('/listings', { params: { type: 'spot', limit: 8 } }),
            api.get('/listings', { params: { type: 'homestay', limit: 8 } }),
          ]);
          setSpots(s.data.items || []);
          setHomestays(h.data.items || []);
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

  return (
    <div>
      <Seo description={t('seo.home_description')} />

      {/* HERO / Booking widget - starts at y=0 and carries the header height as
          padding, since the bar is drawn on top of the video. */}
      <section className="relative min-h-[100dvh] flex flex-col justify-center" data-hero>
        <HeroMedia poster={HERO_POSTER} />
        {/* Bottom padding outweighs the top on purpose: it lifts the centered
            block above the hero's midline so the search panel that opens under
            the bar has breathing space before the fold. */}
        <div className="relative z-10 mx-auto max-w-6xl w-full px-5 md:px-8 pt-[calc(var(--header-h)+0.5rem)] pb-80 md:pt-[calc(var(--header-h)+1.5rem)] md:pb-[22rem] flex-1 flex flex-col justify-center">
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
          <Sparkles size={18} className="text-flag" />
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
  );
}
