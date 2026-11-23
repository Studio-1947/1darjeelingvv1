import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chip, Chips, cx } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';

export type SortOrder = 'recommended' | 'price_asc' | 'price_desc' | 'name_asc';

export interface CategoryFilterBarProps {
  categoryType?: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedLocation: string;
  onLocationChange: (loc: string) => void;
  sortOrder: SortOrder;
  onSortChange: (sort: SortOrder) => void;
  maxPrice?: number;
  onMaxPriceChange?: (price: number | undefined) => void;
  selectedCab?: string;
  onCabChange?: (cab: string) => void;
  entryFilter?: string;
  onEntryFilterChange?: (entry: string) => void;
  onReset: () => void;
  totalCount: number;
  /** Something besides the panel's own filters is switched on (Near me, guests): lights the dot. */
  extraActive?: boolean;
  /** "My location" and its distances: shown first in the panel, beside the place picker. */
  nearSlot?: React.ReactNode;
  /** Why "My location" did not work (permission off, no position), shown under it. */
  nearError?: string;
  /** Extra rows (guests) shown after the distance rows. */
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

/** The words the empty search field types out, one after another (prototype v7 typewriter). */
const TW_WORDS: [string, string][] = [
  ['category.tw_0', 'Homestays'],
  ['category.tw_1', 'Drivers'],
  ['category.tw_2', 'Offbeat Places'],
  ['category.tw_3', 'Tour Guides'],
  ['category.tw_4', 'Cafes & Restaurants'],
  ['category.tw_5', 'Local Shops'],
];

/** Types a word, waits, deletes it, types the next. Still (first word) when motion is reduced. */
function useTypewriter(words: string[]) {
  const [text, setText] = useState(words[0] || '');
  const key = words.join('|');
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setText(words[0] || '');
      return undefined;
    }
    let i = 0, pos = 0, del = false, timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const w = words[i % words.length] || '';
      if (!del) {
        pos += 1; setText(w.slice(0, pos));
        if (pos >= w.length) { del = true; timer = setTimeout(tick, 1400); return; }
        timer = setTimeout(tick, 85); return;
      }
      pos -= 1; setText(w.slice(0, Math.max(0, pos)));
      if (pos <= 0) { del = false; i += 1; timer = setTimeout(tick, 320); return; }
      timer = setTimeout(tick, 40);
    };
    setText('');
    timer = setTimeout(tick, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return text;
}

type Rec = { start: () => void; stop: () => void; lang: string; interimResults: boolean; maxAlternatives: number; onresult: ((ev: any) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const VOICE_LANG: Record<string, string> = { en: 'en-IN', hi: 'hi-IN', ne: 'ne-NP', bn: 'bn-IN' };

/** Voice search through the browser's own speech recognition (Chrome, Safari). */
function useVoice(onText: (text: string) => void) {
  const { i18n } = useTranslation();
  const rec = useRef<Rec | null>(null);
  const [listening, setListening] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  useEffect(() => () => { try { rec.current?.stop(); } catch { /* already stopped */ } }, []);
  useEffect(() => {
    if (!unsupported) return undefined;
    const timer = setTimeout(() => setUnsupported(false), 2500);
    return () => clearTimeout(timer);
  }, [unsupported]);
  const toggle = () => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { setUnsupported(true); return; }
    if (rec.current) { try { rec.current.stop(); } catch { /* ignore */ } rec.current = null; setListening(false); return; }
    const r: Rec = new SR();
    r.lang = VOICE_LANG[(i18n.language || 'en').slice(0, 2)] || 'en-IN';
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (ev: any) => onText(Array.from(ev.results as ArrayLike<any>).map((x: any) => x[0].transcript).join(' ').trim());
    r.onend = () => { rec.current = null; setListening(false); };
    r.onerror = r.onend;
    rec.current = r;
    setListening(true);
    try { r.start(); } catch { r.onend?.(); }
  };
  return { listening, unsupported, toggle };
}

/**
 * A category list's search and filters, the prototype's way: the search pill with its filter and
 * voice buttons beside it, and the filter panel that the filter button opens under them.
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
  totalCount,
  extraActive,
  nearSlot,
  nearError,
  children,
}: CategoryFilterBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const word = useTypewriter(TW_WORDS.map(([k, d]) => t(k, d)));
  const voice = useVoice(onSearchChange);

  const filtersOn =
    selectedLocation !== 'All Locations' ||
    sortOrder !== 'recommended' ||
    (maxPrice !== undefined && maxPrice > 0) ||
    (!!selectedCab && selectedCab !== 'all') ||
    entryFilter !== 'all' ||
    !!extraActive;

  // Board: stays and drivers filter by price. A driver's rate is per trip or day.
  const priceCaps = categoryType === 'driver' ? [undefined, 1000, 2500, 5000] : [undefined, 1500, 3000, 5000];

  return (
    <div className="ag-category-filter" data-testid="category-filter-bar">
      <div className="ag-category-searchrow">
        <label className="ag-category-search">
          <Icon name="search" />
          <span className="qbox">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label={t('category.search')}
              enterKeyHint="search"
              data-testid="category-search-input"
            />
            {!searchQuery && <span className="qph" aria-hidden="true">{word}</span>}
          </span>
          {searchQuery && (
            <button type="button" className="clear" onClick={() => onSearchChange('')} aria-label={t('ui.categoryFilterBar.clear_search')}>
              <Icon name="x" />
            </button>
          )}
        </label>
        <span className="ag-category-sact">
          <button
            type="button"
            className="fbtn"
            aria-pressed={open}
            aria-expanded={open}
            aria-controls="category-filter-panel"
            aria-label={t('category.filter', 'Filter')}
            title={t('category.filter', 'Filter')}
            onClick={() => setOpen((v) => !v)}
            data-testid="category-filter-open"
          >
            <Icon name="filter" />
            {filtersOn && <span className="fdot" aria-hidden="true" />}
          </button>
          <button
            type="button"
            className={cx('vbtn', voice.listening && 'on')}
            aria-pressed={voice.listening}
            aria-label={t('category.voice', 'Voice search')}
            title={t('category.voice', 'Voice search')}
            onClick={voice.toggle}
            data-testid="category-voice"
          >
            <Icon name="mic" />
          </button>
        </span>
      </div>
      {(voice.listening || voice.unsupported) && (
        <p className="ag-small ag-category-listen" role="status">
          {voice.listening
            ? t('category.listening', 'Listening… say a place, a homestay or a dish')
            : t('category.novoice', 'Voice search needs Chrome or Safari with a microphone.')}
        </p>
      )}

      {open && (
        <div className="ag-box ag-category-fpanel" id="category-filter-panel" data-testid="category-filter-panel">
          <div className="two">
            {nearSlot}
            <select
              className="ag-category-sel"
              aria-label={t('ui.categoryFilterBar.location_hub')}
              value={selectedLocation}
              onChange={(e) => onLocationChange(e.target.value)}
              data-testid="category-location-select"
            >
              {REGION_HUBS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc === 'All Locations' ? t('category.any_place', 'Any place') : loc}
                </option>
              ))}
            </select>
          </div>
          {nearError && <p className="ag-err m-0" role="alert" data-testid="near-me-error">{nearError}</p>}

          {children}

          {(categoryType === 'homestay' || categoryType === 'driver') && onMaxPriceChange && (
            <div className="ag-category-frow">
              <span>{t('ui.categoryFilterBar.max_rate').replace(/:\s*$/, '')}</span>
              <Chips scroll data-testid="filter-price-row" role="group" aria-label={t('ui.categoryFilterBar.max_rate')}>
                {priceCaps.map((val) => (
                  <Chip key={String(val)} on={maxPrice === val} onClick={() => onMaxPriceChange(val)} data-testid={`filter-price-${val || 'any'}`}>
                    {val === undefined
                      ? t('ui.categoryFilterBar.any_rate')
                      : t('ui.categoryFilterBar.under_amount', { amount: val.toLocaleString('en-IN') })}
                  </Chip>
                ))}
              </Chips>
            </div>
          )}

          {categoryType === 'driver' && onCabChange && (
            <div className="ag-category-frow">
              <span>{t('ui.categoryFilterBar.cab_type').replace(/:\s*$/, '')}</span>
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
            </div>
          )}

          {categoryType === 'spot' && onEntryFilterChange && (
            <div className="ag-category-frow">
              <span>{t('ui.categoryFilterBar.entry').replace(/:\s*$/, '')}</span>
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
            </div>
          )}

          <select
            className="ag-category-sel"
            aria-label={t('ui.categoryFilterBar.sort_order')}
            value={sortOrder}
            onChange={(e) => onSortChange(e.target.value as SortOrder)}
            data-testid="category-sort-select"
          >
            <option value="recommended">{t('filter.sort_recommended', 'Featured / Popular')}</option>
            <option value="price_asc">{t('category.cheap', 'Cheapest first')}</option>
            <option value="price_desc">{t('filter.sort_price_desc', 'Price: High to Low')}</option>
            <option value="name_asc">{t('filter.sort_name_asc', 'Name: A – Z')}</option>
          </select>

          <div className="ag-category-fgo">
            <button type="button" className="ag-btn primary ag-category-fsearch" onClick={() => setOpen(false)} data-testid="category-filter-apply">
              <Icon name="search" />
              <span>{t('category.search_btn', 'Search')}</span>
              <span className="fcount">{totalCount}</span>
            </button>
            {filtersOn && (
              <button type="button" className="ag-btn text ag-category-reset" onClick={onReset} data-testid="category-reset-btn">
                {t('category.clear', 'Clear filters')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
