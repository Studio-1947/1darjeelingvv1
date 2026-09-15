import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Car } from '@phosphor-icons/react';
import api from '@/lib/api';
import { Monogram } from './ui';
import Slab from './Slab';

// RN's exact fixed route (1-Darjeeling-Mobile-App/app/(tourist)/rides.tsx
// FROM_HUB/TO_HUB) - hub names the backend's estimator recognises.
const FROM_HUB = 'NJP Railway Station';
const TO_HUB = 'Darjeeling Town (Chowk Bazaar / Clubside)';

/**
 * Mobile /drivers screen, structurally matching RN's rides.tsx. Consumes
 * Category.tsx's existing driver-listing fetch as props (see Phase 3 plan's
 * "Key reuse discovery"). The route/fare card hits the same
 * GET /api/routes/estimate endpoint RouteEstimator.tsx and RN's own
 * useRouteEstimate both already use, with the fixed hub pair RN quotes.
 *
 * Per the Rides-scope decision: RN's "Talk to driver" is pass-gated and
 * creates a real booking to reveal the driver's phone - Pass doesn't exist on
 * the web yet (Phase 5), so each driver's CTA opens its listing page instead,
 * same as every other category's cards today.
 */
export default function MobileRidesScreen({
  className = '',
  results,
  loading,
}: {
  className?: string;
  results: any[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [estimate, setEstimate] = useState<{ minFare: number; suvFare: number; distanceKm: number; durationHours: number; routeNote: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/routes/estimate', { params: { from: FROM_HUB, to: TO_HUB } })
      .then((r) => { if (!cancelled) setEstimate(r.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const sharedFare = estimate?.minFare ?? 300;
  const cabFare = estimate?.suvFare ?? 2500;

  return (
    <div className={`mobile-ui bg-[var(--mu-bg)] min-h-screen pb-[calc(var(--bottom-nav-h)+1rem)] ${className}`}>
      <div className="px-[var(--mu-gutter)] pt-4">
        <h1 className="font-[family-name:var(--mu-font-display)] font-black text-2xl text-[var(--mu-ink)] tracking-tight">
          {t('mobileRides.title')} 🚕
        </h1>

        <div className="mt-3 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] p-1.5">
          <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-[var(--mu-border)]">
            <span className="text-[var(--mu-green)]">●</span>
            <span className="text-[13.5px] font-semibold text-[var(--mu-ink)]">{FROM_HUB}</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="text-[var(--mu-orange)]">▼</span>
            <span className="text-[13.5px] font-semibold text-[var(--mu-ink)]">{TO_HUB}</span>
          </div>
        </div>

        <div className="mt-2.5 flex gap-2.5">
          <div className="flex-1 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] px-3.5 py-2.5">
            <Slab>{t('mobileRides.shared_jeep')}</Slab>
            <div className="mt-0.5 font-[family-name:var(--mu-font-display)] font-bold text-[15px] text-[var(--mu-ink)]">
              ₹{sharedFare.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="flex-1 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] px-3.5 py-2.5">
            <Slab>{t('mobileRides.private_cab')}</Slab>
            <div className="mt-0.5 font-[family-name:var(--mu-font-display)] font-bold text-[15px] text-[var(--mu-ink)]">
              ₹{cabFare.toLocaleString('en-IN')}
            </div>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--mu-text-faint)]">{t('mobileRides.fare_band_note')}</p>
        {estimate && estimate.distanceKm > 0 && (
          <p className="mt-1.5 text-[11.5px] text-[var(--mu-text-faint)]">
            {estimate.distanceKm} km · {estimate.durationHours} hr · {estimate.routeNote}
          </p>
        )}
      </div>

      <Slab className="block px-[var(--mu-gutter)] pt-4 pb-2">{t('mobileRides.verified_drivers')}</Slab>

      <div className="px-[var(--mu-gutter)] space-y-2.5">
        {loading && results.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--mu-text-muted)]">{t('common.loading')}</p>
        ) : results.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--mu-text-muted)]">{t('category.empty')}</p>
        ) : (
          results.map((d) => (
            <Link key={d.id} to={`/listing/${d.id}`} className="block">
              <div className="rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] px-3.5 py-3">
                <div className="flex items-center gap-3">
                  <Monogram label={d.title} className="w-[42px] h-[42px] text-sm flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-[var(--mu-ink)] truncate">{d.title}</div>
                    <div className="mt-0.5 text-[11.5px] text-[var(--mu-text-faint)] truncate">
                      {[d.location, d.rating > 0 ? `★ ${Number(d.rating).toFixed(1)}` : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {d.price > 0 && (
                    <span className="font-[family-name:var(--mu-font-display)] font-black text-[15px] text-[var(--mu-green)] flex-shrink-0">
                      ₹{d.price}
                    </span>
                  )}
                </div>
                <div className="mt-2.5 py-2 rounded-[var(--mu-r-chip)] bg-[var(--mu-green)] text-center">
                  <span className="text-xs font-bold text-[var(--mu-cream)]">{t('mobileRides.view_driver')}</span>
                </div>
              </div>
            </Link>
          ))
        )}

        <div className="rounded-[var(--mu-r-card-sm)] border border-dashed border-[var(--mu-sage)] bg-[var(--mu-green-tint)] px-3.5 py-3 flex items-center gap-2">
          <Car size={16} className="text-[var(--mu-green)] flex-shrink-0" />
          <span className="text-xs text-[var(--mu-green-deep)]">{t('mobileRides.day_tour_note')}</span>
        </div>
      </div>
    </div>
  );
}
