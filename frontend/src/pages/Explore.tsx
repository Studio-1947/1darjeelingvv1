import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useSeo } from '@/components/Seo';
import { Box, MenuIcon, PageHead, Status } from '@/components/ag';
import { CategoryTiles, type Tile } from '@/components/home/cards';
import { Icon, type IconName } from '@/components/ag/Icon';

/** A tile icon from the prototype's own line set. */
const ic = (name: IconName) => function TileIcon(props: React.SVGProps<SVGSVGElement>) { return <Icon name={name} {...(props as any)} />; };

/**
 * Explore: every category as a tile, then a way into every listing at once. A page of its own
 * rather than a popup, so it scrolls, has a URL and the back button works.
 */
const TILES: Tile[] = [
  { key: 'homestay', to: '/homestays', Icon: ic('home'), title: ['home.tile.stays', 'Homestay'], sub: ['explore.homestay_sub', 'Places to stay'] },
  { key: 'driver', to: '/drivers', Icon: ic('car'), title: ['home.tile.cars', 'Car & Driver'], sub: ['explore.driver_sub', 'Taxis and hill routes'] },
  { key: 'spot', to: '/spots', Icon: ic('mountain'), title: ['home.tile.spots', 'Offbeat Places'], sub: ['explore.spot_sub', 'Sunrise points, monasteries and viewpoints'] },
  { key: 'cafe', to: '/cafes', Icon: ic('cup'), title: ['home.cafes_title', 'Cafes & Restaurants'], sub: ['explore.cafe_sub', 'Coffee and bakeries'] },
  { key: 'shop', to: '/shops', Icon: ic('bag'), title: ['home.shops_title', 'Local Shops'], sub: ['explore.shop_sub', 'Tea, crafts, daily needs'] },
  { key: 'guide', to: '/guides', Icon: ic('trek'), title: ['home.tile.guides', 'Tour Guides'], sub: ['explore.guide_sub', 'Trekking, heritage and nature guides'] },
  { key: 'event', to: '/events', Icon: ic('party'), title: ['home.tile.events', 'Festivals'], sub: ['explore.event_sub', 'Festivals and markets'] },
  { key: 'biodiversity', to: '/biodiversity', Icon: ic('leaf'), title: ['home.nature_title', 'Nature'], sub: ['explore.biodiversity_sub', 'Wildlife and trails'] },
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

        <form onSubmit={search} role="search" className="ag-category-searchrow">
          <label className="ag-category-search">
            <Icon name="search" />
            <span className="qbox">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                enterKeyHint="search"
                placeholder={t('explore.search_placeholder')}
                aria-label={t('explore.search_placeholder')}
                data-testid="explore-search"
                className="placeholder:text-[#7A7A7A]"
              />
            </span>
          </label>
          {/* A visible way to search, not only the Enter key. */}
          <span className="ag-category-sact">
            <button type="submit" aria-label={t('explore.search_go')} title={t('explore.search_go')} data-testid="explore-search-go" className="fbtn">
              <Icon name="arrowne" />
            </button>
          </span>
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
              <MenuIcon><Icon name="search" /></MenuIcon>
              <span className="ag-mlab">
                <span>{t('explore.browse_all')}</span>
                <span className="ag-small">
                  {counts ? t('explore.browse_all_count', { n: countText(counts.total) }) : t('explore.browse_all_sub')}
                </span>
              </span>
              <Icon name="arrowne" className="flex-none text-[var(--r)] !h-[18px] !w-[18px]" />
            </Link>
          </div>
        </Box>
      </div>
    </div>
  );
}
