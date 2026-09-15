import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import Seo from '@/components/Seo';
import { listingImage } from '@/lib/listingContent';
import { MobileScreen, MobilePhoto, Slab } from '@/components/mobile';

/**
 * Mobile-only Culture tab, mirroring RN's app/(tourist)/culture.tsx exactly:
 * a featured-event banner (first live event, omitted if none - never
 * invented) above a curated grid of spots (RN's own `tiles` is spots only,
 * not a combined spots+events feed - the Phase 1 placeholder's filter chips
 * didn't match this and are removed here), and a "Shop local" row linking to
 * /eat at the bottom.
 */
export default function Culture() {
  const { t } = useTranslation();
  const [spots, setSpots] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get('/listings', { params: { type: 'spot', limit: 12 } }),
      api.get('/listings', { params: { type: 'event', limit: 4 } }),
    ])
      .then(([spotsRes, eventsRes]) => {
        if (cancelled) return;
        setSpots(spotsRes.data.items || []);
        setEvents(eventsRes.data.items || []);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const tiles = spots.slice(0, 6);
  const featuredEvent = events[0];

  return (
    <MobileScreen tone="light" className="lg:hidden pb-[calc(var(--bottom-nav-h)+1rem)]">
      <Seo title={t('mobileCulture.title')} noindex />

      <div className="px-[var(--mu-gutter)] pt-6 pb-4">
        <Slab>{t('mobileCulture.eyebrow')}</Slab>
        <h1 className="mt-1 font-[family-name:var(--mu-font-display)] font-extrabold text-3xl text-[var(--mu-ink)]">
          {t('mobileCulture.title')}
        </h1>
        <p className="mt-1 text-sm text-[var(--mu-text-body)]">{t('mobileCulture.subtitle')}</p>
      </div>

      <div className="px-[var(--mu-gutter)] pb-8 space-y-3">
        {loading ? (
          <p className="text-sm text-[var(--mu-text-muted)]">{t('common.loading')}</p>
        ) : (
          <>
            {/* Featured event - no live event, no invented one. */}
            {featuredEvent && (
              <Link to={`/listing/${featuredEvent.id}`} className="block">
                <div className="rounded-[var(--mu-r-card)] px-[17px] pt-[15px] pb-[15px]" style={{ background: 'var(--mu-orange)' }}>
                  <Slab className="text-[var(--mu-orange-soft)]">
                    {(featuredEvent.tags?.[0] || 'On now').toUpperCase()}
                  </Slab>
                  <div className="mt-1 font-[family-name:var(--mu-font-display)] font-black text-[17.5px] leading-snug text-[var(--mu-surface)]">
                    {featuredEvent.title}
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <span className="flex-1 min-w-0 truncate text-[11.5px]" style={{ color: 'var(--mu-orange-soft)' }}>
                      {featuredEvent.location}
                    </span>
                    <span className="px-3 py-1.5 rounded-[var(--mu-r-chip)] bg-[var(--mu-surface)] flex-shrink-0">
                      <span className="text-xs font-bold" style={{ color: 'var(--mu-orange)' }}>
                        {t('mobileCulture.directions')}
                      </span>
                    </span>
                  </div>
                </div>
              </Link>
            )}

            {tiles.length === 0 ? (
              <p className="text-sm text-[var(--mu-text-muted)]">{t('category.empty')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {tiles.map((it) => (
                  <Link key={it.id} to={`/listing/${it.id}`} className="block">
                    <div className="rounded-[var(--mu-r-tile)] overflow-hidden bg-[var(--mu-surface)]">
                      <MobilePhoto src={listingImage(it, 400, 260)} alt={it.title} radius="0" className="h-[74px]" />
                      <div className="px-3 pt-2 pb-2.5">
                        <div className="text-[12.5px] font-bold text-[var(--mu-ink)] line-clamp-1">{it.title}</div>
                        <div className="text-[11px] text-[var(--mu-text-faint)] line-clamp-1">{it.location}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            <Link to="/eat" className="block">
              <div className="flex items-center gap-3 rounded-[var(--mu-r-card-sm)] bg-[var(--mu-surface)] border border-[var(--mu-border)] px-3.5 py-3.5">
                <div className="w-10 h-10 rounded-[var(--mu-r-tile-sm)] bg-[var(--mu-green-tint)] flex items-center justify-center text-lg flex-shrink-0">
                  🧶
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-[var(--mu-ink)]">{t('mobileCulture.shop_local')}</div>
                  <div className="text-[11px] text-[var(--mu-text-faint)]">{t('mobileCulture.shop_local_meta')}</div>
                </div>
                <span className="text-[var(--mu-green)] text-base flex-shrink-0">→</span>
              </div>
            </Link>
          </>
        )}
      </div>
    </MobileScreen>
  );
}
