import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MagnifyingGlass as Search, MapPin, SlidersHorizontal, ArrowsDownUp as ArrowUpDown, X, ArrowCounterClockwise as RotateCcw, Car, House as HomeIcon, Ticket, Check } from '@phosphor-icons/react';

export interface CategoryFilterBarProps {
  categoryType?: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedLocation: string;
  onLocationChange: (loc: string) => void;
  sortOrder: 'recommended' | 'price_asc' | 'price_desc' | 'name_asc';
  onSortChange: (sort: 'recommended' | 'price_asc' | 'price_desc' | 'name_asc') => void;
  maxPrice?: number;
  onMaxPriceChange?: (price: number | undefined) => void;
  selectedCab?: string;
  onCabChange?: (cab: string) => void;
  entryFilter?: string;
  onEntryFilterChange?: (entry: string) => void;
  onReset: () => void;
  totalCount: number;
}

const REGION_HUBS = [
  'All Locations',
  'Darjeeling',
  'Ghum',
  'Kurseong',
  'Kalimpong',
  'Mirik',
  'Siliguri',
  'Bagdogra',
  'Sittong',
  'Lamahatta',
  'Takdah',
  'Lepchajagat',
];

export default function CategoryFilterBar({
  categoryType,
  searchQuery,
  onSearchChange,
  selectedLocation,
  onLocationChange,
  sortOrder,
  onSortChange,
  maxPrice,
  onMaxPriceChange,
  selectedCab,
  onCabChange,
  entryFilter = 'all',
  onEntryFilterChange,
  onReset,
  totalCount,
}: CategoryFilterBarProps) {
  const { t } = useTranslation();
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  // Escape closes the phone filter sheet, like every other dialog on the site.
  useEffect(() => {
    if (!showMobileFilters) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowMobileFilters(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showMobileFilters]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedLocation !== 'All Locations' ||
    sortOrder !== 'recommended' ||
    (maxPrice !== undefined && maxPrice > 0) ||
    (selectedCab && selectedCab !== 'all') ||
    entryFilter !== 'all';

  return (
    <div className="mb-6 space-y-3" data-testid="category-filter-bar">
      {/* Primary Glass Filter Toolbar */}
      <div className="bg-white/80 dark:bg-black/60 backdrop-blur-xl border border-[var(--line)] rounded-2xl p-2.5 sm:p-3 shadow-md flex flex-wrap sm:flex-nowrap items-center gap-2">
        {/* Search Input Box */}
        <div className="relative flex-1 min-w-[180px] flex items-center bg-mist/60 border border-[var(--line)] rounded-xl px-3 min-h-11 transition-colors focus-within:border-pine">
          <Search size={16} className="text-ink-soft flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('filter.search_placeholder', 'Search by name, landmark or keyword...')}
            data-testid="category-search-input"
            className="w-full self-stretch bg-transparent outline-none ml-2 text-xs sm:text-sm font-medium text-ink placeholder:text-ink-soft"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="text-ink-soft hover:text-ink p-1 rounded-full"
              aria-label={t('ui.categoryFilterBar.clear_search')}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Location Dropdown */}
        <div className="hidden sm:flex items-center gap-1.5 bg-mist/60 border border-[var(--line)] rounded-xl px-3 py-2 text-xs font-semibold text-ink">
          <MapPin size={15} className="text-pine flex-shrink-0" />
          <select
            value={selectedLocation}
            onChange={(e) => onLocationChange(e.target.value)}
            data-testid="category-location-select"
            className="bg-transparent outline-none cursor-pointer text-ink font-semibold"
          >
            {REGION_HUBS.map((loc) => (
              <option key={loc} value={loc} className="bg-white dark:bg-ink text-ink">
                {loc === 'All Locations' ? t('filter.all_locations', 'All Hubs & Locations') : loc}
              </option>
            ))}
          </select>
        </div>

        {/* Sort Order Selector */}
        <div className="hidden sm:flex items-center gap-1.5 bg-mist/60 border border-[var(--line)] rounded-xl px-3 py-2 text-xs font-semibold text-ink">
          <ArrowUpDown size={15} className="text-flag flex-shrink-0" />
          <select
            value={sortOrder}
            onChange={(e) => onSortChange(e.target.value as any)}
            data-testid="category-sort-select"
            className="bg-transparent outline-none cursor-pointer text-ink font-semibold"
          >
            <option value="recommended" className="bg-white dark:bg-ink text-ink">
              {t('filter.sort_recommended', 'Featured / Popular')}
            </option>
            <option value="price_asc" className="bg-white dark:bg-ink text-ink">
              {t('filter.sort_price_asc', 'Price: Low to High')}
            </option>
            <option value="price_desc" className="bg-white dark:bg-ink text-ink">
              {t('filter.sort_price_desc', 'Price: High to Low')}
            </option>
            <option value="name_asc" className="bg-white dark:bg-ink text-ink">
              {t('filter.sort_name_asc', 'Name: A – Z')}
            </option>
          </select>
        </div>

        {/* Mobile Filter Toggle Button */}
        <button
          type="button"
          onClick={() => setShowMobileFilters(true)}
          data-testid="category-mobile-filter-btn"
          className="sm:hidden flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-mist border border-[var(--line)] text-ink text-xs font-bold"
        >
          <SlidersHorizontal size={15} className="text-pine" />
          <span>{t('filter.filters', 'Filters')}</span>
          {hasActiveFilters && (
            <span className="w-2 h-2 rounded-full bg-flag inline-block" />
          )}
        </button>

        {/* Reset Button (Desktop) */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            data-testid="category-reset-btn"
            className="hidden sm:flex items-center gap-1 px-3 py-2 rounded-xl bg-mist hover:bg-mist/80 border border-[var(--line)] text-ink-soft hover:text-ink text-xs font-bold transition-colors"
          >
            <RotateCcw size={13} />
            <span>{t('filter.reset', 'Reset')}</span>
          </button>
        )}
      </div>

      {/* Category Specific Sub-filter Quick Chips (Homestays / Drivers / Spots): one row that scrolls */}
      <div className="space-y-2 text-xs">
        {/* Homestays Tariff Quick Filters */}
        {/* Board: stays and drivers filter by price. A driver's rate is per trip or day. */}
        {(categoryType === 'homestay' || categoryType === 'driver') && onMaxPriceChange && (
          <div className="flex w-full items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1" data-testid="filter-price-row">
            <span className="hidden sm:flex flex-shrink-0 whitespace-nowrap text-[11px] font-extrabold uppercase tracking-wider text-ink-soft mr-1 items-center gap-1">
              <HomeIcon size={12} /> {t('ui.categoryFilterBar.max_rate')}
            </span>
            {(categoryType === 'driver' ? [
              { val: undefined },
              { val: 1000 },
              { val: 2500 },
              { val: 5000 },
            ] : [
              { val: undefined },
              { val: 1500 },
              { val: 3000 },
              { val: 5000 },
            ]).map((opt) => {
              const p = {
                ...opt,
                label: opt.val === undefined
                  ? t('ui.categoryFilterBar.any_rate')
                  : t('ui.categoryFilterBar.under_amount', { amount: opt.val.toLocaleString('en-IN') }),
              };
              const active = maxPrice === p.val;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onMaxPriceChange(p.val)}
                  data-testid={`filter-price-${p.val || 'any'}`}
                  className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-full border transition-colors cursor-pointer font-semibold ${
                    active
                      ? 'bg-pine text-white border-pine shadow-sm'
                      : 'bg-white text-ink border-[var(--line)] hover:border-pine/40'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Drivers Vehicle Type Quick Filters */}
        {categoryType === 'driver' && onCabChange && (
          <div className="flex w-full items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1">
            <span className="hidden sm:flex flex-shrink-0 whitespace-nowrap text-[11px] font-extrabold uppercase tracking-wider text-ink-soft mr-1 items-center gap-1">
              <Car size={12} /> {t('ui.categoryFilterBar.cab_type')}
            </span>
            {[
              { label: t('ui.categoryFilterBar.cab_all'), val: 'all' },
              { label: t('ui.categoryFilterBar.cab_hatchback'), val: 'hatchback' },
              { label: t('ui.categoryFilterBar.cab_suv'), val: 'suv' },
            ].map((c) => {
              const active = (selectedCab || 'all') === c.val;
              return (
                <button
                  key={c.val}
                  type="button"
                  onClick={() => onCabChange(c.val)}
                  data-testid={`filter-cab-${c.val}`}
                  className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-full border transition-colors cursor-pointer font-semibold ${
                    active
                      ? 'bg-pine text-white border-pine shadow-sm'
                      : 'bg-white text-ink border-[var(--line)] hover:border-pine/40'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Spots Entry Fee Quick Filters */}
        {categoryType === 'spot' && onEntryFilterChange && (
          <div className="flex w-full items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 -mx-1 px-1">
            <span className="hidden sm:flex flex-shrink-0 whitespace-nowrap text-[11px] font-extrabold uppercase tracking-wider text-ink-soft mr-1 items-center gap-1">
              <Ticket size={12} /> {t('ui.categoryFilterBar.entry')}
            </span>
            {[
              { label: t('ui.categoryFilterBar.entry_all'), val: 'all' },
              { label: t('ui.categoryFilterBar.entry_free'), val: 'free' },
              { label: t('ui.categoryFilterBar.entry_paid'), val: 'paid' },
            ].map((e) => {
              const active = entryFilter === e.val;
              return (
                <button
                  key={e.val}
                  type="button"
                  onClick={() => onEntryFilterChange(e.val)}
                  data-testid={`filter-entry-${e.val}`}
                  className={`flex-shrink-0 whitespace-nowrap px-3.5 py-2 rounded-full border transition-colors cursor-pointer font-semibold ${
                    active
                      ? 'bg-pine text-white border-pine shadow-sm'
                      : 'bg-white text-ink border-[var(--line)] hover:border-pine/40'
                  }`}
                >
                  {e.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Active Filter Badges */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-bold text-ink-soft uppercase tracking-wider mr-1">
            {t('ui.categoryFilterBar.active_filters')}
          </span>
          {searchQuery && (
            <ActiveChip label={t('ui.categoryFilterBar.chip_query', { query: searchQuery })} onRemove={() => onSearchChange('')} />
          )}

          {selectedLocation !== 'All Locations' && (
            <ActiveChip label={t('ui.categoryFilterBar.chip_hub', { hub: selectedLocation })} onRemove={() => onLocationChange('All Locations')} />
          )}

          {maxPrice && (
            <ActiveChip label={t('ui.categoryFilterBar.chip_max', { amount: maxPrice })} onRemove={() => onMaxPriceChange?.(undefined)} />
          )}

          {selectedCab && selectedCab !== 'all' && (
            <ActiveChip label={t('ui.categoryFilterBar.chip_cab', { cab: selectedCab })} onRemove={() => onCabChange?.('all')} />
          )}

          {entryFilter !== 'all' && (
            <ActiveChip label={t('ui.categoryFilterBar.chip_entry', { entry: entryFilter })} onRemove={() => onEntryFilterChange?.('all')} />
          )}

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center min-h-11 px-1.5 text-xs font-bold text-flag hover:underline cursor-pointer"
          >
            {t('ui.categoryFilterBar.clear_all')}
          </button>
        </div>
      )}

      {/* Mobile Filter Modal Sheet */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end sm:hidden" role="dialog" aria-modal="true" aria-label={t('ui.categoryFilterBar.filter_sort_title')}>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMobileFilters(false)}
          />
          <div className="relative z-10 bg-white dark:bg-[#14201A] border-t border-[var(--line)] rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
              <h3 className="font-display font-extrabold text-lg text-ink">{t('ui.categoryFilterBar.filter_sort_title')}</h3>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="p-1 rounded-full bg-mist text-ink"
                aria-label={t('ui.categoryFilterBar.close_filters')}
              >
                <X size={18} />
              </button>
            </div>

            {/* Mobile Location Selector */}
            <div>
              <label className="block text-xs font-bold text-ink-soft uppercase tracking-wider mb-1">
                {t('ui.categoryFilterBar.location_hub')}
              </label>
              <select
                value={selectedLocation}
                onChange={(e) => onLocationChange(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[var(--line)] bg-mist text-ink font-semibold text-sm outline-none"
              >
                {REGION_HUBS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc === 'All Locations' ? t('ui.categoryFilterBar.all_locations') : loc}
                  </option>
                ))}
              </select>
            </div>

            {/* Mobile Sort Order */}
            <div>
              <label className="block text-xs font-bold text-ink-soft uppercase tracking-wider mb-1">
                {t('ui.categoryFilterBar.sort_order')}
              </label>
              <select
                value={sortOrder}
                onChange={(e) => onSortChange(e.target.value as any)}
                className="w-full p-2.5 rounded-xl border border-[var(--line)] bg-mist text-ink font-semibold text-sm outline-none"
              >
                <option value="recommended">{t('filter.sort_recommended')}</option>
                <option value="price_asc">{t('filter.sort_price_asc')}</option>
                <option value="price_desc">{t('filter.sort_price_desc')}</option>
                <option value="name_asc">{t('filter.sort_name_asc')}</option>
              </select>
            </div>

            {/* Apply & Reset Buttons */}
            <div className="pt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setShowMobileFilters(false);
                }}
                className="flex-1 py-3 rounded-full border border-[var(--line)] text-ink font-extrabold text-sm text-center"
              >
                {t('filter.reset')}
              </button>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="flex-1 py-3 rounded-full bg-pine text-white font-extrabold text-sm text-center shadow-md"
              >
                {t('ui.categoryFilterBar.apply_filters')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* An active filter. The whole chip is the button that removes it: on its own the ✕ was a 12px
   target. On phones the button rules in index.css make it 40px tall like every other chip. */
function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={t('ui.categoryFilterBar.remove_filter', { label })}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-mist text-ink text-xs font-semibold border border-[var(--line)] hover:text-flag"
    >
      {label}
      <X size={12} aria-hidden="true" />
    </button>
  );
}
