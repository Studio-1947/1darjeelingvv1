import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ArrowUpRight, MagnifyingGlass, SquaresFour } from '@phosphor-icons/react';
import api from '@/lib/api';
import { useSeo } from '@/components/Seo';

/**
 * Explore: every category as a photo tile, as the app's Explore screen
 * (src/components/CategorySheet.tsx in the app) shows it. A page of its own rather than a popup,
 * so it scrolls, has a URL and the back button works.
 */
const CLOUDINARY = 'https://res.cloudinary.com/drgb8w8ak/image/upload/w_700,q_auto,f_auto';
const PHOTOS: Record<string, string> = {
  spot: `${CLOUDINARY}/v1784109903/tigerhill_mcmhxp.webp`,
  homestay: `${CLOUDINARY}/v1784118976/mistpine_qc0xlt.webp`,
  driver: `${CLOUDINARY}/v1784115417/tenzing_ttsbl8.webp`,
  guide: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=700&q=70&fit=crop&auto=format',
  shop: `${CLOUDINARY}/v1784201627/nathmulls_kecous.webp`,
  cafe: `${CLOUDINARY}/v1784111263/keventers_zwibyf.webp`,
  event: `${CLOUDINARY}/v1784112327/losar_omcdmh.webp`,
  biodiversity: 'https://images.unsplash.com/photo-1542880941-1abfea46bba6?w=700&q=70&fit=crop&auto=format',
};

// `label` is the short nav.* name; `to` is the category page.
const GRID = [
  { key: 'homestay', to: '/homestays', label: 'homestays' },
  { key: 'driver', to: '/drivers', label: 'drivers' },
  { key: 'guide', to: '/guides', label: 'guides' },
  { key: 'shop', to: '/shops', label: 'shops' },
  { key: 'cafe', to: '/cafes', label: 'cafes' },
  { key: 'event', to: '/events', label: 'events' },
  { key: 'biodiversity', to: '/biodiversity', label: 'biodiversity' },
];

const COUNT_LIMIT = 200;

function PhotoTile({ k, to, className, children }: { k: string; to: string; className: string; children: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  return (
    <Link
      to={to}
      data-testid={`explore-${k}`}
      className={`group relative overflow-hidden rounded-3xl bg-[#2C3A2F] p-3.5 flex flex-col justify-between text-white transition-transform active:scale-[0.985] ${className}`}
    >
      {!failed && (
        <img src={PHOTOS[k]} alt="" loading="lazy" onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-[rgba(60,112,96,0.30)] via-black/5 to-[rgba(12,32,24,0.90)]" />
      <div className="relative flex flex-col justify-between h-full">{children}</div>
    </Link>
  );
}

export default function Explore() {
  const { t } = useTranslation();
  useSeo({ title: t('nav.explore') });
  const nav = useNavigate();
  const [query, setQuery] = useState('');
  const [counts, setCounts] = useState<{ total: number; byType: Record<string, number>; capped: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    api.get('/listings', { params: { limit: COUNT_LIMIT } })
      .then(({ data }) => {
        if (!live) return;
        const items = data?.items || [];
        const byType: Record<string, number> = {};
        items.forEach((it: any) => { byType[it.type] = (byType[it.type] ?? 0) + 1; });
        setCounts({ total: items.length, byType, capped: items.length >= COUNT_LIMIT });
      })
      .catch(() => { /* the tiles read fine without a number */ });
    return () => { live = false; };
  }, []);

  const countText = (n: number) => (counts?.capped ? `${n}+` : String(n));

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    nav(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pt-4 pb-8 md:py-10" data-testid="explore-page">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink">{t('nav.discover')}</div>
          <h1 className="font-display font-extrabold text-[26px] md:text-4xl text-ink leading-tight tracking-tight">{t('nav.categories')}</h1>
        </div>
        <span className="mt-1 px-2.5 py-1 rounded-full bg-mist border border-[var(--line)] text-[11.5px] font-semibold text-ink-soft">
          {t('explore.region')}
        </span>
      </div>

      <form onSubmit={search} className="mt-3.5 flex items-center gap-2.5 h-[46px] px-3.5 rounded-xl bg-white border border-[var(--line)] focus-within:border-pine">
        <MagnifyingGlass size={17} className="text-ink-soft flex-shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          enterKeyHint="search"
          placeholder={t('explore.search_placeholder')}
          aria-label={t('explore.search_placeholder')}
          data-testid="explore-search"
          className="flex-1 min-w-0 bg-transparent outline-none text-sm font-medium text-ink placeholder:text-ink-soft"
        />
        {/* A visible way to search, not only the Enter key. */}
        <button type="submit" aria-label={t('explore.search_go')} data-testid="explore-search-go"
          className="-mr-1.5 h-9 w-9 flex-shrink-0 rounded-full bg-pine text-white grid place-items-center btn-hover">
          <ArrowRight size={16} weight="bold" />
        </button>
      </form>

      {/* Spots: the hero */}
      <PhotoTile k="spot" to="/spots" className="mt-3.5 h-[190px] md:h-[240px]">
        <div className="flex items-center gap-1.5">
          <span className="px-2.5 py-1 rounded-full bg-white/20 border border-white/35 text-[10px] font-bold tracking-wider">
            {t('explore.most_visited')}
          </span>
          <span className="px-2 py-1 rounded-full bg-[rgba(29,78,216,0.86)] border border-white/45 text-[9px] font-bold tracking-wider">
            OFFBEAT
          </span>
        </div>
        <div className="flex items-end gap-3">
          <div className="flex-1 min-w-0 [text-shadow:0_1px_4px_rgba(0,0,0,0.35)]">
            <div className="font-display font-extrabold text-2xl">{t('nav.spots')}</div>
            <div className="mt-0.5 text-[12.5px] text-white/90">{t('explore.spot_sub')}</div>
          </div>
          <span className="w-[38px] h-[38px] rounded-full bg-white text-ink grid place-items-center flex-shrink-0">
            <ArrowUpRight size={18} weight="bold" />
          </span>
        </div>
      </PhotoTile>

      {/* The other seven, two per row */}
      <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
        {GRID.map(({ key, to, label }, i) => {
          const sub = key === 'homestay' && counts?.byType.homestay != null
            ? t('explore.homestay_count', { n: countText(counts.byType.homestay) })
            : t(`explore.${key}_sub`);
          return (
            <PhotoTile key={key} k={key} to={to}
              className={`h-[150px] md:h-[170px] ${i === GRID.length - 1 ? 'col-span-2 md:col-span-1' : ''}`}>
              <span className="w-[30px] h-[30px] rounded-full bg-[rgba(12,20,15,0.48)] border border-white/40 grid place-items-center">
                <ArrowUpRight size={15} weight="bold" />
              </span>
              <div className="min-w-0 [text-shadow:0_1px_4px_rgba(0,0,0,0.35)]">
                <div className="font-display font-bold text-base truncate">{t(`nav.${label}`)}</div>
                <div className="mt-px text-[11.5px] text-white/85 truncate">{sub}</div>
              </div>
            </PhotoTile>
          );
        })}
      </div>

      {/* Browse all */}
      <Link to="/search" data-testid="explore-browse-all"
        className="mt-3.5 flex items-center gap-3 p-4 rounded-3xl bg-white border border-[var(--line)] btn-hover">
        <span className="w-10 h-10 rounded-xl bg-mist text-pine grid place-items-center flex-shrink-0">
          <SquaresFour size={18} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-ink">{t('explore.browse_all')}</span>
          <span className="block mt-px text-xs text-ink-soft">
            {counts ? t('explore.browse_all_count', { n: countText(counts.total) }) : t('explore.browse_all_sub')}
          </span>
        </span>
        <ArrowRight size={17} className="text-ink-soft" />
      </Link>
    </div>
  );
}
