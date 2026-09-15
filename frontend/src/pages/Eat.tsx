import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import Seo from '@/components/Seo';
import { listingImage } from '@/lib/listingContent';
import { MobileScreen, MobilePhoto, FilterPill, Rating } from '@/components/mobile';

type Tab = 'cafe' | 'restaurant' | 'shop';

/**
 * Mobile-only Eat & Shop tab, mirroring RN's app/eat.tsx. Cafés and
 * Restaurants both read the backend's `cafe` listing type (RN's own comment:
 * "Cafés and restaurants both live under the backend's `cafe` type"); Shops
 * reads `shop`. RN's "N shops accept pass" note is dropped - it counts
 * listings with a `deal` field the backend doesn't have, same reasoning as
 * the Stays filters decision in the Phase 3 plan.
 */
export default function Eat() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('cafe');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const type = tab === 'shop' ? 'shop' : 'cafe';
    api.get('/listings', { params: { type, limit: 40 } })
      .then((r) => { if (!cancelled) setItems(r.data.items || []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tab]);

  const hero = items[0];
  const rest = items.slice(1);

  return (
    <MobileScreen tone="light" className="lg:hidden pb-[calc(var(--bottom-nav-h)+1rem)]">
      <Seo title={t('mobileEat.title')} noindex />

      <div className="px-[var(--mu-gutter)] pt-6">
        <h1 className="font-[family-name:var(--mu-font-display)] font-black text-2xl text-[var(--mu-ink)] tracking-tight">
          {t('mobileEat.title')}
        </h1>
        <div className="mt-3 flex gap-2">
          <FilterPill active={tab === 'cafe'} onClick={() => setTab('cafe')}>
            {t('mobileEat.tab_cafes')}
          </FilterPill>
          <FilterPill active={tab === 'restaurant'} onClick={() => setTab('restaurant')}>
            {t('mobileEat.tab_restaurants')}
          </FilterPill>
          <FilterPill active={tab === 'shop'} onClick={() => setTab('shop')}>
            {t('mobileEat.tab_shops')}
          </FilterPill>
        </div>
      </div>

      <div className="mt-3.5 px-[var(--mu-gutter)] space-y-2.5">
        {loading && items.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--mu-text-muted)]">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--mu-text-muted)]">{t('category.empty')}</p>
        ) : (
          <>
            {hero && (
              <Link to={`/listing/${hero.id}`} className="block">
                <div className="rounded-[var(--mu-r-card)] overflow-hidden bg-[var(--mu-surface)]">
                  <MobilePhoto src={listingImage(hero, 700, 420)} alt={hero.title} radius="0" className="h-[110px]" />
                  <div className="px-3.5 pt-2.5 pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex-1 min-w-0 truncate font-[family-name:var(--mu-font-display)] font-bold text-[15px] text-[var(--mu-ink)]">
                        {hero.title}
                      </span>
                      <Rating value={hero.rating} />
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--mu-text-muted)] truncate">{hero.location}</div>
                  </div>
                </div>
              </Link>
            )}

            {rest.map((p) => (
              <Link key={p.id} to={`/listing/${p.id}`} className="block">
                <div className="flex gap-3 items-center rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] p-2.5">
                  <MobilePhoto src={listingImage(p, 200, 180)} alt={p.title} radius="var(--mu-r-tile)" className="w-[88px] h-[80px] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex-1 min-w-0 truncate font-[family-name:var(--mu-font-display)] font-bold text-sm text-[var(--mu-ink)]">
                        {p.title}
                      </span>
                      <Rating value={p.rating} />
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-[var(--mu-text-muted)] truncate">{p.location}</div>
                  </div>
                </div>
              </Link>
            ))}
          </>
        )}
      </div>
    </MobileScreen>
  );
}
