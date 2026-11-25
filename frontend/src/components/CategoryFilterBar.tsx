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
  /** A voice search ended: the words it searched for ('' when nothing was heard, null when cancelled). */
  onVoiceDone?: (text: string | null) => void;
  /** A voice search started listening. */
  onVoiceStart?: () => void;
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

type Rec = {
  start: () => void; stop: () => void; abort: () => void;
  lang: string; interimResults: boolean; maxAlternatives: number;
  onresult: ((ev: any) => void) | null; onend: (() => void) | null; onerror: ((ev: any) => void) | null;
  onsoundstart: (() => void) | null; onspeechstart: (() => void) | null;
};
const VOICE_LANG: Record<string, string> = { en: 'en-IN', hi: 'hi-IN', ne: 'ne-NP', bn: 'bn-IN' };

/** Why a voice search ended without words: shown under the search row with a way to try again. */
export type VoiceError = 'unsupported' | 'blocked' | 'nomic' | 'nospeech' | 'network';

/**
 * Voice search through the browser's own speech recognition (Chrome, Safari).
 * `hearing` turns on once the mic picks up sound, so the recording panel can show it is live.
 * `onDone` gets the final words ('' when nothing was heard, null when cancelled).
 */
function useVoice(onText: (text: string) => void, onDone?: (text: string | null) => void, onStart?: () => void) {
  const { i18n } = useTranslation();
  const rec = useRef<Rec | null>(null);
  const [listening, setListening] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState<VoiceError | null>(null);
  // Leaving the page mid-recording: stop quietly, nothing after unmount.
  useEffect(() => () => {
    const r = rec.current;
    if (!r) return;
    r.onresult = null; r.onerror = null; r.onend = null; r.onsoundstart = null; r.onspeechstart = null;
    try { r.abort(); } catch { /* already stopped */ }
  }, []);

  // What the search box held before listening, put back if the traveller cancels.
  const before = useRef('');
  const start = (current = '') => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    setError(null);
    if (!SR) { setError('unsupported'); return; }
    if (rec.current) return;
    before.current = current;
    onStart?.();
    const r: Rec = new SR();
    let words = '';
    let failed: VoiceError | null = null;
    r.lang = VOICE_LANG[(i18n.language || 'en').slice(0, 2)] || 'en-IN';
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onsoundstart = () => setHearing(true);
    r.onspeechstart = () => setHearing(true);
    r.onresult = (ev: any) => {
      words = Array.from(ev.results as ArrayLike<any>).map((x: any) => x[0].transcript).join(' ').trim();
      setHeard(words);
      onText(words);
    };
    r.onerror = (ev: any) => {
      const code = ev?.error;
      if (code === 'aborted') return;
      failed = code === 'not-allowed' || code === 'service-not-allowed' ? 'blocked'
        : code === 'audio-capture' ? 'nomic'
          : code === 'network' ? 'network'
            : 'nospeech';
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      setHearing(false);
      if (failed && !words) setError(failed);
      else if (!words) setError('nospeech');
      onDone?.(words);
    };
    rec.current = r;
    setHeard('');
    setHearing(false);
    setListening(true);
    try { r.start(); } catch { rec.current = null; setListening(false); setError('nospeech'); }
  };
  /** Stop and keep what was said so far. */
  const stop = () => { try { rec.current?.stop(); } catch { /* ignore */ } };
  /** Stop and throw the words away. */
  const cancel = () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    r.onresult = null; r.onerror = null; r.onend = null;
    try { r.abort(); } catch { /* ignore */ }
    setListening(false);
    setHearing(false);
    setHeard('');
    onText(before.current);
    onDone?.(null);
  };
  const toggle = (current = '') => (rec.current ? stop() : start(current));
  return { listening, hearing, heard, error, clearError: () => setError(null), start, stop, cancel, toggle };
}
export { useVoice };
export type Voice = ReturnType<typeof useVoice>;

/**
 * The voice search's recording panel while the mic is on, and the line that says why it stopped
 * without words. Shared by the category bar and the search sheet (components/SearchSheet.tsx).
 * Focus follows the recording: onto Stop when the panel opens, back to the mic when it closes
 * (the button that had it is gone), unless focus has already moved on elsewhere.
 */
export function VoicePanel({ voice, micRef, current }: { voice: Voice; micRef: React.RefObject<HTMLButtonElement>; current: string }) {
  const { t } = useTranslation();
  const stopRef = useRef<HTMLButtonElement>(null);
  const wasListening = useRef(false);
  useEffect(() => {
    if (voice.listening) stopRef.current?.focus();
    else if (wasListening.current) {
      const at = document.activeElement;
      if (!at || at === document.body) micRef.current?.focus();
    }
    wasListening.current = voice.listening;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.listening]);
  const dismissError = () => { voice.clearError(); micRef.current?.focus(); };
  const voiceErr: Record<VoiceError, string> = {
    unsupported: t('category.novoice', 'Voice search needs Chrome or Safari with a microphone.'),
    blocked: t('category.voice_blocked', 'The microphone is off for aangan. Allow it in your browser settings and try again.'),
    nomic: t('category.voice_nomic', 'No microphone found on this device.'),
    nospeech: t('category.voice_nospeech', 'We didn’t hear anything. Tap the mic and speak again.'),
    network: t('category.voice_network', 'Voice search needs the internet. Check your connection and try again.'),
  };

  if (voice.listening) {
    return (
      <div
        className={cx('ag-box ag-category-rec', voice.hearing && 'live')}
        data-testid="voice-recording"
        // Escape cancels, as Cancel does; kept to the panel so it never closes anything else.
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); voice.cancel(); } }}
      >
        <span className="recmic" aria-hidden="true"><Icon name="mic" /></span>
        <span className="recwave" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map((i) => <i key={i} />)}</span>
        <p className="rectext" data-testid="voice-heard">
          {voice.heard ? `“${voice.heard}”` : t('category.voice_ready', 'Speak now')}
        </p>
        <p className="ag-small m-0" role="status">{t('category.listening', 'Listening… say a place, a homestay or a dish')}</p>
        <div className="recact">
          <button type="button" className="ag-btn text" onClick={voice.cancel} data-testid="voice-cancel">
            {t('common.cancel', 'Cancel')}
          </button>
          <button ref={stopRef} type="button" className="ag-btn primary" onClick={voice.stop} data-testid="voice-stop">
            {voice.heard && <Icon name="search" />}
            <span>{voice.heard ? t('category.search_btn', 'Search') : t('category.voice_stop', 'Stop')}</span>
          </button>
        </div>
      </div>
    );
  }
  if (!voice.error) return null;
  return (
    <div className="ag-category-recerr" data-testid="voice-error">
      <p className="ag-err m-0" role="alert">{voiceErr[voice.error]}</p>
      {voice.error !== 'unsupported' && voice.error !== 'nomic' && (
        <button type="button" className="ag-btn text" onClick={() => voice.start(current)} data-testid="voice-retry">
          <Icon name="mic" /> <span>{t('common.retry', 'Try again')}</span>
        </button>
      )}
      <button type="button" className="clear" onClick={dismissError} aria-label={t('common.close', 'Close')}>
        <Icon name="x" />
      </button>
    </div>
  );
}

/** What the search page can ask of the bar: listen again after a voice search found nothing, or type instead. */
export interface CategoryFilterBarHandle {
  startVoice: () => void;
  focusSearch: () => void;
}

/**
 * A category list's search and filters, the prototype's way: the search pill with its filter and
 * voice buttons beside it, and the filter panel that the filter button opens under them.
 */
const CategoryFilterBar = React.forwardRef<CategoryFilterBarHandle, CategoryFilterBarProps>(function CategoryFilterBar({
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
  onVoiceStart,
  onVoiceDone,
  children,
}, ref) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const word = useTypewriter(TW_WORDS.map(([k, d]) => t(k, d)));
  const voice = useVoice(onSearchChange, onVoiceDone, onVoiceStart);
  const inputRef = useRef<HTMLInputElement>(null);
  const micRef = useRef<HTMLButtonElement>(null);
  React.useImperativeHandle(ref, () => ({
    startVoice: () => voice.start(searchQuery),
    focusSearch: () => { voice.clearError(); inputRef.current?.focus(); inputRef.current?.select(); },
  }));

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
              ref={inputRef}
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
            ref={micRef}
            type="button"
            className={cx('vbtn', voice.listening && 'on')}
            aria-pressed={voice.listening}
            aria-label={t('category.voice', 'Voice search')}
            title={t('category.voice', 'Voice search')}
            onClick={() => voice.toggle(searchQuery)}
            data-testid="category-voice"
          >
            <Icon name="mic" />
          </button>
        </span>
      </div>

      <VoicePanel voice={voice} micRef={micRef} current={searchQuery} />

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
});

export default CategoryFilterBar;
