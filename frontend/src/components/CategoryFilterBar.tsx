import React from 'react';
import { useTranslation } from 'react-i18next';
import { MagnifyingGlass as Search, X } from '@phosphor-icons/react';
import { Button, Chip, Chips, SelectField } from '@/components/ag';

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
  /** Extra chips (Near me) shown in the same block, under the search row. */
  children?: React.ReactNode;
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

/**
 * A category list's search and filters, in the prototype's order: the 56px search pill, place and
 * sort, then one row of chips per filter (price, cab type, entry), then what is switched on.
 * Same at every width: one column, nothing hidden behind a phone-only sheet.
 */
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
  children,
}: CategoryFilterBarProps) {
  const { t } = useTranslation();

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedLocation !== 'All Locations' ||
    sortOrder !== 'recommended' ||
    (maxPrice !== undefined && maxPrice > 0) ||
    (selectedCab && selectedCab !== 'all') ||
    entryFilter !== 'all';

  // Board: stays and drivers filter by price. A driver's rate is per trip or day.
  const priceCaps = categoryType === 'driver' ? [undefined, 1000, 2500, 5000] : [undefined, 1500, 3000, 5000];

  return (
    <div className="flex flex-col gap-3" data-testid="category-filter-bar">
      <label className="flex h-14 items-center gap-2.5 rounded-full border border-[var(--outline)] bg-white pl-5 pr-2 focus-within:border-[var(--r)] focus-within:outline focus-within:outline-2 focus-within:outline-[var(--r-tint)]">
        <Search size={20} weight="bold" className="flex-none text-[var(--r)]" aria-hidden="true" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('filter.search_placeholder', 'Search by name, landmark or keyword...')}
          aria-label={t('category.search')}
          data-testid="category-search-input"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-[var(--ink-strong)] outline-none placeholder:text-[var(--ink-faint)] [&::-webkit-search-cancel-button]:hidden"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="grid h-10 w-10 flex-none place-items-center rounded-full text-[var(--ink-muted)]"
            aria-label={t('ui.categoryFilterBar.clear_search')}
          >
            <X size={16} />
          </button>
        )}
      </label>

      <div className="grid grid-cols-2 gap-2">
        <SelectField
          aria-label={t('ui.categoryFilterBar.location_hub')}
          value={selectedLocation}
          onChange={(e) => onLocationChange(e.target.value)}
          data-testid="category-location-select"
          className="min-w-0"
        >
          {REGION_HUBS.map((loc) => (
            <option key={loc} value={loc}>
              {loc === 'All Locations' ? t('ui.categoryFilterBar.all_locations') : loc}
            </option>
          ))}
        </SelectField>
        <SelectField
          aria-label={t('ui.categoryFilterBar.sort_order')}
          value={sortOrder}
          onChange={(e) => onSortChange(e.target.value as CategoryFilterBarProps['sortOrder'])}
          data-testid="category-sort-select"
          className="min-w-0"
        >
          <option value="recommended">{t('filter.sort_recommended', 'Featured / Popular')}</option>
          <option value="price_asc">{t('filter.sort_price_asc', 'Price: Low to High')}</option>
          <option value="price_desc">{t('filter.sort_price_desc', 'Price: High to Low')}</option>
          <option value="name_asc">{t('filter.sort_name_asc', 'Name: A – Z')}</option>
        </SelectField>
      </div>

      {children}

      {(categoryType === 'homestay' || categoryType === 'driver') && onMaxPriceChange && (
        <Chips scroll data-testid="filter-price-row" role="group" aria-label={t('ui.categoryFilterBar.max_rate')}>
          {priceCaps.map((val) => (
            <Chip key={String(val)} on={maxPrice === val} onClick={() => onMaxPriceChange(val)} data-testid={`filter-price-${val || 'any'}`}>
              {val === undefined
                ? t('ui.categoryFilterBar.any_rate')
                : t('ui.categoryFilterBar.under_amount', { amount: val.toLocaleString('en-IN') })}
            </Chip>
          ))}
        </Chips>
      )}

      {categoryType === 'driver' && onCabChange && (
        <Chips scroll role="group" aria-label={t('ui.categoryFilterBar.cab_type')}>
          {[
            { label: t('ui.categoryFilterBar.cab_all'), val: 'all' },
            { label: t('ui.categoryFilterBar.cab_hatchback'), val: 'hatchback' },
            { label: t('ui.categoryFilterBar.cab_suv'), val: 'suv' },
          ].map((c) => (
            <Chip key={c.val} on={(selectedCab || 'all') === c.val} onClick={() => onCabChange(c.val)} data-testid={`filter-cab-${c.val}`}>
              {c.label}
            </Chip>
          ))}
        </Chips>
      )}

      {categoryType === 'spot' && onEntryFilterChange && (
        <Chips scroll role="group" aria-label={t('ui.categoryFilterBar.entry')}>
          {[
            { label: t('ui.categoryFilterBar.entry_all'), val: 'all' },
            { label: t('ui.categoryFilterBar.entry_free'), val: 'free' },
            { label: t('ui.categoryFilterBar.entry_paid'), val: 'paid' },
          ].map((e) => (
            <Chip key={e.val} on={entryFilter === e.val} onClick={() => onEntryFilterChange(e.val)} data-testid={`filter-entry-${e.val}`}>
              {e.label}
            </Chip>
          ))}
        </Chips>
      )}

      {/* What is switched on. The whole chip is the button that removes it. */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('ui.categoryFilterBar.active_filters')}>
          {searchQuery && (
            <ActiveChip label={t('ui.categoryFilterBar.chip_query', { query: searchQuery })} onRemove={() => onSearchChange('')} />
          )}
          {selectedLocation !== 'All Locations' && (
            <ActiveChip label={t('ui.categoryFilterBar.chip_hub', { hub: selectedLocation })} onRemove={() => onLocationChange('All Locations')} />
          )}
          {maxPrice ? (
            <ActiveChip label={t('ui.categoryFilterBar.chip_max', { amount: maxPrice })} onRemove={() => onMaxPriceChange?.(undefined)} />
          ) : null}
          {selectedCab && selectedCab !== 'all' && (
            <ActiveChip label={t('ui.categoryFilterBar.chip_cab', { cab: selectedCab })} onRemove={() => onCabChange?.('all')} />
          )}
          {entryFilter !== 'all' && (
            <ActiveChip label={t('ui.categoryFilterBar.chip_entry', { entry: entryFilter })} onRemove={() => onEntryFilterChange?.('all')} />
          )}
          <Button variant="text" size="sm" onClick={onReset} data-testid="category-reset-btn">
            {t('ui.categoryFilterBar.clear_all')}
          </Button>
        </div>
      )}
    </div>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <Chip on onClick={onRemove} aria-label={t('ui.categoryFilterBar.remove_filter', { label })}>
      {label}
      <X size={14} aria-hidden="true" />
    </Chip>
  );
}
