import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import Seo from '@/components/Seo';
import { listingImage } from '@/lib/listingContent';
import { MobileScreen, MobilePhoto, Slab } from '@/components/mobile';

/**
 * Mobile-only Nature tab, mirroring RN's app/(tourist)/nature.tsx. RN's own
 * code hides its trail/guided-walk tabs and content whenever a real backend
 * is configured (`isApiEnabled() ? [] : TRAILS...`) - a listing row has no
 * difficulty/duration/meeting-point/season columns those need. Since this web
 * app is always backend-configured, porting RN's own real behavior against a
 * live backend means: no category tabs, no trail cards - just the species
 * "sightings" strip (first two) and the rest as full-width cards, which is
 * exactly what ships here.
 */
export default function Nature() {
  const { t } = useTranslation();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.get('/listings', { params: { type: 'biodiversity', limit: 60 } })
      .then((r) => { if (!cancelled) setItems(r.data.items || []); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const sightings = items.slice(0, 2);
  const rest = items.slice(2);

  return (
    <MobileScreen tone="ink" className="lg:hidden pb-[calc(var(--bottom-nav-h)+1rem)]">
      <Seo title={t('mobileNature.title')} noindex />

      <div className="px-[var(--mu-gutter)] pt-6 pb-4">
        <Slab className="text-[var(--mu-sage)]">{t('mobileNature.eyebrow')}</Slab>
        <h1 className="mt-1 font-[family-name:var(--mu-font-display)] font-extrabold text-3xl text-[var(--mu-cream)]">
          {t('mobileNature.title')}
        </h1>
      </div>

      <div className="px-[var(--mu-gutter)] pb-8 space-y-3">
        {loading ? (
          <p className="text-sm text-[var(--mu-text-on-dark-faint)]">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-[var(--mu-text-on-dark-faint)]">{t('mobileNature.empty')}</p>
        ) : (
          <>
            {sightings.length > 0 && (
              <div className="flex gap-2.5">
                {sightings.map((it) => (
                  <Link key={it.id} to={`/listing/${it.id}`} className="flex-1 min-w-0">
                    <div
                      className="h-full rounded-[var(--mu-r-card-sm)] border p-3.5"
                      style={{ background: 'var(--mu-on-dark-fill)', borderColor: 'var(--mu-on-dark-line-soft)' }}
                    >
                      <Slab className="text-[var(--mu-sage)]">
                        {(it.tags?.[0] || t('mobileNature.sightings_label')).toUpperCase()}
                      </Slab>
                      <div className="mt-1.5 font-[family-name:var(--mu-font-display)] font-bold text-[14.5px] leading-snug text-[var(--mu-cream)] line-clamp-2">
                        {it.title}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[var(--mu-text-on-dark-muted)] truncate">
                        {it.location}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {rest.map((it) => (
              <Link key={it.id} to={`/listing/${it.id}`} className="block">
                <div className="rounded-[var(--mu-r-card)] overflow-hidden bg-[var(--mu-surface)]">
                  <MobilePhoto src={listingImage(it, 700, 460)} alt={it.title} radius="0" className="h-[118px]" />
                  <div className="px-3.5 pt-2.5 pb-3">
                    <div className="font-[family-name:var(--mu-font-display)] font-bold text-[15px] text-[var(--mu-ink)]">
                      {it.title}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--mu-text-muted)]">{it.location}</div>
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
