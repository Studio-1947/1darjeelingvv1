import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  MapPin,
  SlidersHorizontal,
  ArrowUpDown,
  X,
  RotateCcw,
  Car,
  Home as HomeIcon,
  Ticket,
  Check,
} from 'lucide-react';

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
        <div className="relative flex-1 min-w-[200px] flex items-center bg-mist/60 border border-[var(--line)] rounded-xl px-3 py-2 transition-colors focus-within:border-pine">
          <Search size={16} className="text-ink-soft flex-shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('filter.search_placeholder', 'Search by name, landmark or keyword...')}
            data-testid="category-search-input"
            className="w-full bg-transparent outline-none ml-2 text-xs sm:text-sm font-medium text-ink placeholder:text-ink-soft"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="text-ink-soft hover:text-ink p-1 rounded-full"
              aria-label="Clear search"
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

      {/* Category Specific Sub-filter Quick Chips (Homestays / Drivers / Spots) */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* Homestays Tariff Quick Filters */}
        {categoryType === 'homestay' && onMaxPriceChange && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-ink-soft mr-1 flex items-center gap-1">
              <HomeIcon size={12} /> Max Rate:
            </span>
            {[
              { label: 'Any Rate', val: undefined },
              { label: 'Under ₹1,500', val: 1500 },
              { label: 'Under ₹3,000', val: 3000 },
              { label: 'Under ₹5,000', val: 5000 },
            ].map((p) => {
              const active = maxPrice === p.val;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onMaxPriceChange(p.val)}
                  data-testid={`filter-price-${p.val || 'any'}`}
                  className={`px-3 py-1.5 rounded-full border transition-all cursor-pointer font-semibold ${
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
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-ink-soft mr-1 flex items-center gap-1">
              <Car size={12} /> Cab Type:
            </span>
            {[
              { label: 'All Cabs', val: 'all' },
              { label: 'Hatchback / Sedan', val: 'hatchback' },
              { label: 'Mountain SUV', val: 'suv' },
            ].map((c) => {
              const active = (selectedCab || 'all') === c.val;
              return (
                <button
                  key={c.val}
                  type="button"
                  onClick={() => onCabChange(c.val)}
                  data-testid={`filter-cab-${c.val}`}
                  className={`px-3 py-1.5 rounded-full border transition-all cursor-pointer font-semibold ${
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
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-ink-soft mr-1 flex items-center gap-1">
              <Ticket size={12} /> Entry:
            </span>
            {[
              { label: 'All Spots', val: 'all' },
              { label: 'Free Entry', val: 'free' },
              { label: 'Ticketed / Paid', val: 'paid' },
            ].map((e) => {
              const active = entryFilter === e.val;
              return (
                <button
                  key={e.val}
                  type="button"
                  onClick={() => onEntryFilterChange(e.val)}
                  data-testid={`filter-entry-${e.val}`}
                  className={`px-3 py-1.5 rounded-full border transition-all cursor-pointer font-semibold ${
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
            Active Filters:
          </span>
          {searchQuery && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-mist text-ink text-xs font-semibold border border-[var(--line)]">
              Query: "{searchQuery}"
              <button type="button" onClick={() => onSearchChange('')} className="hover:text-flag">
                <X size={12} />
              </button>
            </span>
          )}

          {selectedLocation !== 'All Locations' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-mist text-ink text-xs font-semibold border border-[var(--line)]">
              Hub: {selectedLocation}
              <button type="button" onClick={() => onLocationChange('All Locations')} className="hover:text-flag">
                <X size={12} />
              </button>
            </span>
          )}

          {maxPrice && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-mist text-ink text-xs font-semibold border border-[var(--line)]">
              Max ₹{maxPrice}
              <button type="button" onClick={() => onMaxPriceChange?.(undefined)} className="hover:text-flag">
                <X size={12} />
              </button>
            </span>
          )}

          {selectedCab && selectedCab !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-mist text-ink text-xs font-semibold border border-[var(--line)]">
              Cab: {selectedCab}
              <button type="button" onClick={() => onCabChange?.('all')} className="hover:text-flag">
                <X size={12} />
              </button>
            </span>
          )}

          {entryFilter !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-mist text-ink text-xs font-semibold border border-[var(--line)]">
              Entry: {entryFilter}
              <button type="button" onClick={() => onEntryFilterChange?.('all')} className="hover:text-flag">
                <X size={12} />
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={onReset}
            className="text-xs font-bold text-flag hover:underline ml-1 cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Mobile Filter Modal Sheet */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowMobileFilters(false)}
          />
          <div className="relative z-10 bg-white dark:bg-[#14201A] border-t border-[var(--line)] rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
              <h3 className="font-display font-extrabold text-lg text-ink">Filter & Sort Listings</h3>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="p-1 rounded-full bg-mist text-ink"
              >
                <X size={18} />
              </button>
            </div>

            {/* Mobile Location Selector */}
            <div>
              <label className="block text-xs font-bold text-ink-soft uppercase tracking-wider mb-1">
                Location Hub
              </label>
              <select
                value={selectedLocation}
                onChange={(e) => onLocationChange(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[var(--line)] bg-mist text-ink font-semibold text-sm outline-none"
              >
                {REGION_HUBS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            {/* Mobile Sort Order */}
            <div>
              <label className="block text-xs font-bold text-ink-soft uppercase tracking-wider mb-1">
                Sort Order
              </label>
              <select
                value={sortOrder}
                onChange={(e) => onSortChange(e.target.value as any)}
                className="w-full p-2.5 rounded-xl border border-[var(--line)] bg-mist text-ink font-semibold text-sm outline-none"
              >
                <option value="recommended">Featured / Popular</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="name_asc">Name: A – Z</option>
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
                Reset
              </button>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="flex-1 py-3 rounded-full bg-pine text-white font-extrabold text-sm text-center shadow-md"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
