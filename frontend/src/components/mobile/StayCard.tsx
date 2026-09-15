import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listingImage } from '@/lib/listingContent';
import { amenitiesFor } from '@/lib/listingMeta';
import MobilePhoto from './Photo';
import { Card } from './ui';

/**
 * Search-result card, mirroring RN's StayCard.tsx `row` layout (the `tile`
 * desktop-grid layout is out of scope - see the Phase 3 plan). Amenity chips
 * reuse the existing amenitiesFor() helper (frontend/src/lib/listingMeta.ts),
 * which already solves "real amenities from tag-derived data" - RN's own
 * fixed AMENITY_LABEL id lookup doesn't match this backend's listing shape.
 */
export default function MobileStayCard({
  stay,
  tripSuffix = '',
}: {
  stay: any;
  tripSuffix?: string;
}) {
  const { t } = useTranslation();
  const amenities = amenitiesFor(stay, 3);

  return (
    <Link to={`/listing/${stay.id}${tripSuffix}`} className="mobile-ui block">
      <Card className="flex gap-3 p-2.5">
        <MobilePhoto
          src={listingImage(stay, 300, 350)}
          alt={stay.title}
          radius="var(--mu-r-tile)"
          className="w-[104px] h-[124px] flex-shrink-0"
        />
        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex-1 min-w-0 truncate font-[family-name:var(--mu-font-display)] font-bold text-[14.5px] text-[var(--mu-ink)]">
              {stay.title}
            </span>
            <span className="px-1.5 py-0.5 rounded-md bg-[var(--mu-green)] text-[11px] font-bold text-[var(--mu-cream)] flex-shrink-0">
              {stay.rating > 0 ? `★ ${Number(stay.rating).toFixed(1)}` : t('mobileHome.rating_new')}
            </span>
          </div>
          <div className="mt-0.5 text-[11.5px] text-[var(--mu-text-muted)] truncate">{stay.location}</div>

          {amenities.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {amenities.map(({ Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--mu-r-chip)] border border-[var(--mu-border)] bg-[var(--mu-surface)] text-[10.5px] font-semibold text-[var(--mu-text-body)]"
                >
                  <Icon size={11} />
                  {label}
                </span>
              ))}
            </div>
          )}

          <div className="mt-2">
            <span className="font-[family-name:var(--mu-font-display)] font-black text-[16px] text-[var(--mu-ink)]">
              ₹{stay.price}
            </span>
            <span className="ml-1 text-[10.5px] text-[var(--mu-text-faint)]">{t('common.per_head')}</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
