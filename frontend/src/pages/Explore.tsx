import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, MagnifyingGlass, SquaresFour, House, Car, Mountains, Coffee, Storefront, PersonSimpleHike, Confetti, Leaf } from '@phosphor-icons/react';
import api from '@/lib/api';
import { useSeo } from '@/components/Seo';
import { Box, MenuIcon, PageHead, Status } from '@/components/ag';
import { CategoryTiles, type Tile } from '@/components/home/cards';

/**
 * Explore: every category as a tile, then a way into every listing at once. A page of its own
 * rather than a popup, so it scrolls, has a URL and the back button works.
 */
const TILES: Tile[] = [
  { key: 'homestay', to: '/homestays', Icon: House, title: ['home.tile.stays', 'Homestay'], sub: ['explore.homestay_sub', 'Places to stay'] },
  { key: 'driver', to: '/drivers', Icon: Car, title: ['home.tile.cars', 'Car & Driver'], sub: ['explore.driver_sub', 'Taxis and hill routes'] },
  { key: 'spot', to: '/spots', Icon: Mountains, title: ['home.tile.spots', 'Offbeat Places'], sub: ['explore.spot_sub', 'Sunrise points, monasteries and viewpoints'] },
  { key: 'cafe', to: '/cafes', Icon: Coffee, title: ['home.cafes_title', 'Cafes & Restaurants'], sub: ['explore.cafe_sub', 'Coffee and bakeries'] },
  { key: 'shop', to: '/shops', Icon: Storefront, title: ['home.shops_title', 'Local Shops'], sub: ['explore.shop_sub', 'Tea, crafts, daily needs'] },
  { key: 'guide', to: '/guides', Icon: PersonSimpleHike, title: ['home.tile.guides', 'Tour Guides'], sub: ['explore.guide_sub', 'Trekking, heritage and nature guides'] },
  { key: 'event', to: '/events', Icon: Confetti, title: ['home.tile.events', 'Festivals'], sub: ['explore.event_sub', 'Festivals and markets'] },
  { key: 'biodiversity', to: '/biodiversity', Icon: Leaf, title: ['home.nature_title', 'Nature'], sub: ['explore.biodiversity_sub', 'Wildlife and trails'] },
];

const COUNT_LIMIT = 200;

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
    <div className="ag-wrap" data-testid="explore-page">
      <div className="ag-main">
        <PageHead eyebrow={t('nav.discover')} title={t('nav.categories')}>
          <Status tone="info" className="mt-2 self-start">{t('explore.region')}</Status>
        </PageHead>

        <form onSubmit={search} role="search"
          className="flex h-14 items-center gap-2.5 rounded-full border border-[var(--outline)] bg-white pl-5 pr-1.5 focus-within:border-[var(--r)] focus-within:outline focus-within:outline-2 focus-within:outline-[var(--r-tint)]">
          <MagnifyingGlass size={20} weight="bold" className="flex-none text-[var(--r)]" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            enterKeyHint="search"
            placeholder={t('explore.search_placeholder')}
            aria-label={t('explore.search_placeholder')}
            data-testid="explore-search"
            className="h-full min-w-0 flex-1 bg-transparent text-base text-[var(--ink-strong)] outline-none placeholder:text-[var(--ink-faint)] [&::-webkit-search-cancel-button]:hidden"
          />
          {/* A visible way to search, not only the Enter key. */}
          <button type="submit" aria-label={t('explore.search_go')} data-testid="explore-search-go"
            className="grid h-11 w-11 flex-none place-items-center rounded-full bg-[var(--r)] text-[var(--on-r)]">
            <ArrowUpRight size={18} weight="bold" />
          </button>
        </form>

        <CategoryTiles
          tiles={TILES}
          testIdPrefix="explore-"
          label={t('nav.categories')}
          subFor={(key) => (key === 'homestay' && counts?.byType.homestay != null
            ? t('explore.homestay_count', { n: countText(counts.byType.homestay) })
            : undefined)}
        />

        <Box>
          <div className="ag-menu">
            <Link to="/search" data-testid="explore-browse-all">
              <MenuIcon><SquaresFour /></MenuIcon>
              <span className="ag-mlab">
                <span>{t('explore.browse_all')}</span>
                <span className="ag-small">
                  {counts ? t('explore.browse_all_count', { n: countText(counts.total) }) : t('explore.browse_all_sub')}
                </span>
              </span>
              <ArrowUpRight size={18} className="flex-none text-[var(--r)]" aria-hidden="true" />
            </Link>
          </div>
        </Box>
      </div>
    </div>
  );
}
