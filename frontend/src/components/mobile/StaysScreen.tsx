import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from '@phosphor-icons/react';
import MobileStayCard from './StayCard';
import MobileSearchWidget, { MobileSearchQuery } from './SearchWidget';
import MobileSheet from './Sheet';
import { Touch } from './ui';

// The last band's "max" can't be `undefined` - Category.tsx's maxPrice state
// uses `undefined` to mean "no filter applied", so a real sentinel here keeps
// this band's selected state distinguishable from the unfiltered default.
const PRICE_BANDS = [
  { label: 'Under ₹1,000', max: 1000 },
  { label: '₹1,000 – ₹2,000', max: 2000 },
  { label: '₹2,000 – ₹3,500', max: 3500 },
  { label: '₹3,500+', max: Number.MAX_SAFE_INTEGER },
];

type SortOrder = 'recommended' | 'price_asc' | 'price_desc' | 'name_asc';
const SORTS: { id: SortOrder; key: string }[] = [
  { id: 'recommended', key: 'filter.sort_recommended' },
  { id: 'price_asc', key: 'filter.sort_price_asc' },
  { id: 'price_desc', key: 'filter.sort_price_desc' },
  { id: 'name_asc', key: 'filter.sort_name_asc' },
];

/**
 * Mobile /homestays results screen, structurally matching RN's phone branch
 * of app/(tourist)/stays.tsx. Consumes Category.tsx's existing fetch/filter
 * state as props rather than fetching again - see the Phase 3 plan's "Key
 * reuse discovery". RN's 5th sort option, "distance", is dropped (no
 * distanceKm field on real listings); its filter set is price-band + sort
 * only (see plan for why amenities/property-type aren't ported literally).
 */
export default function MobileStaysScreen({
  className = '',
  results,
  loading,
  searchQuery,
  onSearchChange,
  sortOrder,
  onSortChange,
  maxPrice,
  onMaxPriceChange,
  onReset,
}: {
  className?: string;
  results: any[];
  loading: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortOrder: SortOrder;
  onSortChange: (s: SortOrder) => void;
  maxPrice: number | undefined;
  onMaxPriceChange: (p: number | undefined) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const [sheet, setSheet] = useState<'sort' | 'filter' | null>(null);
  const activeCount = maxPrice !== undefined ? 1 : 0;

  const handleSearch = (q: MobileSearchQuery) => {
    onSearchChange(q.dest);
  };

  return (
    <div className={`mobile-ui bg-[var(--mu-bg)] min-h-screen pb-[calc(var(--bottom-nav-h)+1rem)] ${className}`}>
      <div className="px-[var(--mu-gutter)] pt-4 space-y-2.5">
        <MobileSearchWidget
          variant="bar"
          initial={{ dest: searchQuery || 'Darjeeling' }}
          onSearch={handleSearch}
        />

        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex-1 text-xs text-[var(--mu-text-muted)]">
            {t('category.results', { count: results.length })}
          </span>
          <Touch
            onClick={() => setSheet('sort')}
            className="px-3.5 py-2 rounded-[var(--mu-r-chip)] border border-[var(--mu-border)] bg-[var(--mu-surface)] text-xs font-semibold text-[var(--mu-text-body)]"
          >
            ⇅ {t(SORTS.find((s) => s.id === sortOrder)?.key || SORTS[0].key)}
          </Touch>
          <Touch
            onClick={() => setSheet('filter')}
            className={`px-3.5 py-2 rounded-[var(--mu-r-chip)] border text-xs font-semibold ${
              activeCount > 0
                ? 'bg-[var(--mu-green)] border-[var(--mu-green)] text-[var(--mu-cream)]'
                : 'border-[var(--mu-border)] bg-[var(--mu-surface)] text-[var(--mu-text-body)]'
            }`}
          >
            ☰ {t('filter.filters')}
            {activeCount > 0 ? ` · ${activeCount}` : ''}
          </Touch>
        </div>
      </div>

      <div className="mt-3 px-[var(--mu-gutter)] space-y-2.5">
        {loading && results.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--mu-text-muted)]">{t('common.loading')}</p>
        ) : results.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--mu-text-muted)]">{t('category.empty')}</p>
        ) : (
          results.map((stay) => <MobileStayCard key={stay.id} stay={stay} />)
        )}
      </div>

      <MobileSheet open={sheet === 'sort'} onClose={() => setSheet(null)} title={t('filter.sort_by')}>
        <div className="space-y-2">
          {SORTS.map((s) => {
            const active = sortOrder === s.id;
            return (
              <Touch
                key={s.id}
                onClick={() => {
                  onSortChange(s.id);
                  setSheet(null);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-[var(--mu-r-card-xs)] border ${
                  active ? 'border-[var(--mu-green)] bg-[var(--mu-green-tint)]' : 'border-[var(--mu-border)] bg-[var(--mu-surface)]'
                }`}
              >
                <span className="flex-1 text-left text-sm font-semibold text-[var(--mu-ink)]">{t(s.key)}</span>
                {active && <Check size={16} weight="bold" className="text-[var(--mu-green)]" />}
              </Touch>
            );
          })}
        </div>
      </MobileSheet>

      <MobileSheet
        open={sheet === 'filter'}
        onClose={() => setSheet(null)}
        title={t('filter.filters')}
        footer={
          <div className="flex gap-2">
            <Touch
              onClick={() => {
                onReset();
                setSheet(null);
              }}
              className="flex-1 py-3 rounded-[var(--mu-r-chip)] border border-[var(--mu-border-strong)] text-sm font-bold text-[var(--mu-ink)]"
            >
              {t('filter.reset')}
            </Touch>
            <Touch
              onClick={() => setSheet(null)}
              className="flex-[1.6] py-3 rounded-[var(--mu-r-chip)] bg-[var(--mu-green)] text-sm font-bold text-[var(--mu-cream)]"
            >
              {t('filter.apply')}
            </Touch>
          </div>
        }
      >
        <div className="space-y-2">
          {PRICE_BANDS.map((band) => {
            const active = maxPrice === band.max;
            return (
              <Touch
                key={band.label}
                onClick={() => onMaxPriceChange(active ? undefined : band.max)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-[var(--mu-r-card-xs)] border ${
                  active ? 'border-[var(--mu-green)] bg-[var(--mu-green-tint)]' : 'border-[var(--mu-border)] bg-[var(--mu-surface)]'
                }`}
              >
                <span className="flex-1 text-left text-sm font-semibold text-[var(--mu-ink)]">{band.label}</span>
                {active && <Check size={16} weight="bold" className="text-[var(--mu-green)]" />}
              </Touch>
            );
          })}
        </div>
      </MobileSheet>
    </div>
  );
}
