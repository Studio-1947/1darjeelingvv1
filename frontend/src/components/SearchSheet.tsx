import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleNotch as Loader2 } from '@phosphor-icons/react';
import Sheet, { SheetHead } from '@/components/listing-detail/Sheet';
import { Box, Button, ButtonLink, Chip, Chips, MenuIcon, SecHead, cx } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import { ListRow } from '@/components/home/cards';
import { ListRowSkeleton, repeat } from '@/components/skeletons';
import { VoicePanel, useVoice } from '@/components/CategoryFilterBar';
import { BAND_ICON, BookingStatus } from '@/components/provider/dashboard/BookingCard';
import { useAuth } from '@/context/AuthContext';
import { formatTripDates } from '@/lib/dates';
import { isBookingNote, noteTarget } from '@/lib/notificationLink';
import { noteText } from '@/lib/serverText';
import { timeAgo } from '@/lib/timeAgo';
import api from '@/lib/api';
import { useListingSearch } from '@/hooks/useListingSearch';

/* ---------- recent searches (this device only) ---------- */

const RECENT_MAX = 6;
const recentKey = (host: boolean) => (host ? 'aangan:recent-search-host' : 'aangan:recent-search');
function readRecent(host: boolean): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(recentKey(host)) || '[]');
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch { return []; }
}
function writeRecent(host: boolean, list: string[]) {
  try { localStorage.setItem(recentKey(host), JSON.stringify(list.slice(0, RECENT_MAX))); } catch { /* private mode */ }
}

/** Lower-case and without accents or punctuation, so "Rabi's" finds "rabis homestay". */
const fold = (v: unknown) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, '');
const hit = (q: string, ...fields: unknown[]) => {
  const words = fold(q).split(/\s+/).filter(Boolean);
  const hay = fields.map(fold).join(' ');
  return words.length > 0 && words.every((w) => hay.includes(w));
};

/**
 * Search from any page: the header's search button opens it. A traveller searches every category
 * (the same smart search as /search, which Enter opens for the full list); a business searches its
 * own bookings, listings and notifications. Typed or spoken (the category bar's voice search).
 */
export default function SearchSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { isHostMode } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>(() => readRecent(isHostMode));
  useEffect(() => { setRecent(readRecent(isHostMode)); }, [isHostMode]);
  // The words the last voice search heard while they are still the search (see Category.tsx).
  const [voiceQuery, setVoiceQuery] = useState('');
  const voiceBefore = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);
  const micRef = useRef<HTMLButtonElement>(null);
  const voice = useVoice(
    (v) => setQ(v),
    // Cancelled (null): the search went back to what it was, and so does this.
    (text) => {
      if (text === null) setVoiceQuery(voiceBefore.current);
      else { setVoiceQuery(text.trim()); remember(text); }
    },
    () => { voiceBefore.current = voiceQuery; setVoiceQuery(''); },
  );
  // A business's own bookings, listings and notifications: read once per opening, filtered as it types.
  const host = useHostData(isHostMode);

  const remember = (term: string) => {
    const v = term.trim();
    if (!v) return;
    const next = [v, ...recent.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, RECENT_MAX);
    setRecent(next);
    writeRecent(isHostMode, next);
  };
  const clearRecent = () => { setRecent([]); writeRecent(isHostMode, []); };
  const change = (v: string) => { setQ(v); if (voiceQuery && v.trim() !== voiceQuery) setVoiceQuery(''); };
  const term = q.trim();
  const heardByVoice = !!voiceQuery && voiceQuery === term;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term) return;
    remember(term);
    // A business's results are all here; a traveller's full list is /search.
    if (!isHostMode) { onClose(); nav(`/search?q=${encodeURIComponent(term)}`); }
    else inputRef.current?.blur();
  };

  const noMatch = (
    heardByVoice ? (
      <Box className="ag-category-empty" data-testid="voice-no-results">
        <span className="ag-category-novoice" aria-hidden="true"><Icon name="mic" /></span>
        <p className="m-0">{t('category.voice_none', 'No results for “{{query}}”.', { query: voiceQuery })}</p>
        <p className="ag-small m-0">{t('category.voice_ask', 'Did we hear you right? Say it again, or type it instead.')}</p>
        <div className="ag-row justify-center">
          <Button onClick={() => voice.start(q)} icon={<Icon name="mic" />} data-testid="voice-again">
            {t('category.voice_again', 'Speak again')}
          </Button>
          <Button onClick={() => { setVoiceQuery(''); inputRef.current?.focus(); inputRef.current?.select(); }} icon={<Icon name="search" />} data-testid="voice-type">
            {t('category.voice_type', 'Type instead')}
          </Button>
        </div>
      </Box>
    ) : (
      <Box className="ag-category-empty" data-testid="search-sheet-empty">
        <p className="m-0">{isHostMode
          ? t('search.host_none', 'Nothing in your bookings, listings or notifications matches “{{query}}”.', { query: term })
          : t('category.none', 'Nothing found. Try another place or word.')}</p>
      </Box>
    )
  );

  return (
    <Sheet onClose={onClose} labelledBy="search-sheet-h" testid="search-sheet" closeTestid="search-sheet-close" className="ag-search-sheet">
      <SheetHead id="search-sheet-h" title={isHostMode ? t('search.host_title', 'Search your business') : t('category.search')} />
      <form role="search" className="ag-category-searchrow" onSubmit={submit}
        // Escape while the mic is on stops the recording, not the whole sheet.
        onKeyDown={(e) => { if (e.key === 'Escape' && voice.listening) { e.stopPropagation(); voice.cancel(); } }}>
        <label className="ag-category-search">
          <Icon name="search" />
          <span className="qbox">
            <input
              ref={inputRef}
              data-autofocus
              type="search"
              value={q}
              onChange={(e) => change(e.target.value)}
              placeholder={isHostMode
                ? t('search.host_ph', 'Guest, booking, listing or date')
                : t('search.placeholder', 'Search  place, shop or event')}
              aria-label={isHostMode ? t('search.host_title', 'Search your business') : t('category.search')}
              enterKeyHint="search"
              data-testid="search-sheet-input"
            />
          </span>
          {q && (
            <button type="button" className="clear" onClick={() => { change(''); inputRef.current?.focus(); }} aria-label={t('ui.categoryFilterBar.clear_search')}>
              <Icon name="x" />
            </button>
          )}
        </label>
        <span className="ag-category-sact">
          <button
            ref={micRef}
            type="button"
            className={cx('vbtn', voice.listening && 'on')}
            aria-pressed={voice.listening}
            aria-label={t('category.voice', 'Voice search')}
            title={t('category.voice', 'Voice search')}
            onClick={() => voice.toggle(q)}
            data-testid="search-sheet-voice"
          >
            <Icon name="mic" />
          </button>
        </span>
      </form>
      <VoicePanel voice={voice} micRef={micRef} current={q} />

      {!term && !voice.listening && (
        recent.length > 0 ? (
          <section className="flex flex-col gap-2" aria-labelledby="search-recent-h" data-testid="search-recent">
            <SecHead id="search-recent-h" title={t('search.recent', 'Recent searches')}
              action={<Button variant="text" size="sm" onClick={clearRecent} data-testid="search-recent-clear">{t('category.rs_clear', 'Clear')}</Button>} className="!mb-0" />
            <Chips scroll>
              {recent.map((r) => (
                <Chip key={r} onClick={() => { change(r); inputRef.current?.focus(); }} data-testid="search-recent-item">
                  <Icon name="search" className="!h-3.5 !w-3.5" /> {r}
                </Chip>
              ))}
            </Chips>
          </section>
        ) : (
          <p className="ag-small m-0">{isHostMode
            ? t('search.host_hint', 'Find a booking by the guest’s name, the listing or the date, a listing by its name, or a notification.')
            : t('search.hint', 'Search homestays, drivers, places, cafes and shops, all at once.')}</p>
        )
      )}

      {term && !voice.listening && (isHostMode
        ? <HostResults q={term} host={host} noMatch={noMatch} onPick={() => { remember(term); onClose(); }} />
        : <TravellerResults q={term} noMatch={noMatch} onPick={() => { remember(term); onClose(); }} />)}
    </Sheet>
  );
}

/* ---------- a traveller: every category, through the smart search ---------- */

function TravellerResults({ q, noMatch, onPick }: { q: string; noMatch: React.ReactNode; onPick: () => void }) {
  const { t } = useTranslation();
  // The same search as the category pages (hooks/useListingSearch): debounced, cancelled when the
  // words change, cached, the last answer kept while the next loads.
  const sq = useListingSearch(q, { limit: 8 });
  const d = sq.data;
  const state = d ? { q: d.q, items: d.items || [], fallback: !!d.search?.fallback, kind: d.search?.type as string | undefined } : null;

  // One Latin letter: too little to search on. Say what to do rather than search everything.
  if (!sq.enabled) return <p className="ag-small m-0">{t('search.more_letters', 'Type one more letter to search.')}</p>;
  if (sq.failed) return <LoadFailed onRetry={sq.retry} />;
  if (!state) return <div className="flex flex-col gap-2.5" aria-busy="true">{repeat(3, (i) => <ListRowSkeleton key={i} />)}</div>;
  const stale = !sq.fresh;
  // Never "nothing found" for words still loading: the skeleton until their answer.
  if (state.items.length === 0) return stale ? <div className="flex flex-col gap-2.5" aria-busy="true">{repeat(3, (i) => <ListRowSkeleton key={i} />)}</div> : <>{noMatch}</>;
  const all = `/search?q=${encodeURIComponent(q)}`;
  return (
    <section className={cx('flex flex-col gap-2.5', stale && 'opacity-60 transition-opacity')} aria-busy={stale}
      aria-label={t('search.results', 'Results')} data-testid="search-sheet-results">
      {state.fallback && (
        <>
          {noMatch}
          <SecHead title={t('search.no_exact_other', 'No exact match. Other {{kind}}:', { kind: t(`categories.${state.kind || 'shop'}`).toLocaleLowerCase() })} className="!mb-0" />
        </>
      )}
      {state.items.map((it) => (
        <div key={it.id} onClickCapture={onPick}>
          <ListRow it={it} href={`/listing/${it.id}`} testId={`search-sheet-hit-${it.id}`} />
        </div>
      ))}
      <ButtonLink to={all} go icon={<Icon name="search" />} onClick={onPick} className="self-center" data-testid="search-sheet-all">
        {t('search.see_all', 'See all results')}
      </ButtonLink>
    </section>
  );
}

/* ---------- a business: its own bookings, listings and notifications ---------- */

const GROUP_MAX = 5;

type HostData = { data: { bookings: any[]; listings: any[]; notes: any[] } | null; failed: boolean; retry: () => void };

/** Read once when the sheet opens in host mode (and again on Try again); every keystroke filters it. */
function useHostData(on: boolean): HostData {
  const [data, setData] = useState<HostData['data']>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    let cancelled = false;
    setFailed(false);
    Promise.all([
      api.get('/bookings/provider'),
      api.get('/notifications').catch(() => ({ data: { items: [] } })),
    ])
      .then(([b, n]) => { if (!cancelled) setData({ bookings: b.data.items || [], listings: b.data.listings || [], notes: n.data.items || [] }); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [on, attempt]);
  return { data, failed, retry: () => setAttempt((n) => n + 1) };
}

function HostResults({ q, host, noMatch, onPick }: { q: string; host: HostData; noMatch: React.ReactNode; onPick: () => void }) {
  const { t, i18n } = useTranslation();
  const { isHostMode } = useAuth();
  const nav = useNavigate();
  const { data, failed } = host;

  const found = useMemo(() => {
    if (!data) return null;
    const typeOf = (b: any) => b.listing_type || b.listing?.type || data.listings.find((l) => l.id === b.listing_id)?.type || 'homestay';
    const bookings = data.bookings.filter((b) => hit(q,
      b.customer?.name, b.id, b.listing?.title || b.listing_title, b.room_name, b.route_name, b.status,
      b.check_in, b.check_in && formatTripDates(b.check_in, b.check_out, i18n.language),
      t(`ob.wz.t_${typeOf(b)}`, { defaultValue: typeOf(b) })));
    const listings = data.listings.filter((l) => hit(q, l.title, l.location, l.type, t(`ob.wz.t_${l.type}`, { defaultValue: l.type })));
    const notes = data.notes.filter((n) => { const x = noteText(t, n); return hit(q, x.title, x.body); });
    return { bookings, listings, notes, typeOf };
  }, [data, q, t, i18n.language]);

  if (failed) return <LoadFailed onRetry={host.retry} />;
  if (!found) {
    return <p className="ag-small inline-flex items-center gap-2"><Loader2 size={18} className="animate-spin text-[var(--r)]" aria-hidden="true" /> {t('common.loading')}</p>;
  }
  if (!found.bookings.length && !found.listings.length && !found.notes.length) return <>{noMatch}</>;

  const go = (to: string) => { onPick(); nav(to); };
  const openNote = (n: any) => {
    if (n.unread) {
      api.patch(`/notifications/${n.id}/read`).then(() => window.dispatchEvent(new Event('aangan:notifications'))).catch(() => {});
    }
    const target = noteTarget(n, isHostMode);
    if (target?.kind === 'route') go(target.to);
    else if (target?.kind === 'external') { onPick(); window.open(target.href, '_blank', 'noopener,noreferrer'); }
    else go('/notifications');
  };
  const more = (n: number) => n > GROUP_MAX && <p className="ag-small m-0 px-3 pb-2">{t('search.more_n', '+{{count}} more. Add a word to narrow it.', { count: n - GROUP_MAX })}</p>;

  return (
    <div className="flex flex-col gap-4" data-testid="search-sheet-results">
      {found.bookings.length > 0 && (
        <section aria-labelledby="search-h-bookings">
          <SecHead id="search-h-bookings" title={`${t('host.bookings', 'Bookings')} · ${found.bookings.length}`} className="!mb-2" />
          <Box className="ag-account-menu">
            <ul className="ag-menu">
              {found.bookings.slice(0, GROUP_MAX).map((b) => (
                <li key={b.id} className="!p-0">
                  <button type="button" onClick={() => go(`/provider/dashboard?s=bookings&b=${encodeURIComponent(b.id)}`)} data-testid={`search-booking-${b.id}`}
                    className="w-full flex items-start gap-3.5 py-3 px-3 text-left bg-transparent border-0 cursor-pointer">
                    <MenuIcon><Icon name={BAND_ICON[found.typeOf(b)] || 't_trip'} /></MenuIcon>
                    <span className="ag-mlab">
                      <span className="text-[var(--ink-strong)]">{b.customer?.name || t('pd.guest_fallback')} · {b.listing?.title || b.listing_title}</span>
                      <span className="ag-small">
                        {b.check_in ? formatTripDates(b.check_in, b.check_out, i18n.language) : new Date(b.created_at).toLocaleDateString(i18n.language || 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </span>
                    <span className="mt-0.5 flex-none"><BookingStatus b={b} /></span>
                  </button>
                </li>
              ))}
            </ul>
            {more(found.bookings.length)}
          </Box>
        </section>
      )}
      {found.listings.length > 0 && (
        <section aria-labelledby="search-h-listings">
          <SecHead id="search-h-listings" title={`${t('search.host_listings', 'Your listings')} · ${found.listings.length}`} className="!mb-2" />
          <Box className="ag-account-menu">
            <ul className="ag-menu">
              {found.listings.slice(0, GROUP_MAX).map((l) => (
                <li key={l.id} className="!p-0">
                  <button type="button" onClick={() => go(`/provider/listings/${l.id}`)} data-testid={`search-listing-${l.id}`}
                    className="w-full flex items-start gap-3.5 py-3 px-3 text-left bg-transparent border-0 cursor-pointer">
                    <MenuIcon><Icon name={BAND_ICON[l.type] || 'home'} /></MenuIcon>
                    <span className="ag-mlab">
                      <span className="text-[var(--ink-strong)]">{l.title}</span>
                      <span className="ag-small">{[t(`ob.wz.t_${l.type}`, { defaultValue: l.type }), l.location].filter(Boolean).join(' · ')}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {more(found.listings.length)}
          </Box>
        </section>
      )}
      {found.notes.length > 0 && (
        <section aria-labelledby="search-h-notes">
          <SecHead id="search-h-notes" title={`${t('notes.title')} · ${found.notes.length}`} className="!mb-2" />
          <Box className="ag-account-menu">
            <ul className="ag-menu">
              {found.notes.slice(0, GROUP_MAX).map((n) => {
                const text = noteText(t, n);
                return (
                  <li key={n.id} className="!p-0">
                    <button type="button" onClick={() => openNote(n)} data-testid={`search-note-${n.id}`}
                      className="w-full flex items-start gap-3.5 py-3 px-3 text-left bg-transparent border-0 cursor-pointer">
                      <MenuIcon><Icon name={n.kind === 'announcement' ? 'news' : isBookingNote(n.kind) ? 't_trip' : 'bell'} /></MenuIcon>
                      <span className="ag-mlab">
                        <span className={`text-[var(--ink-strong)] ${n.unread ? 'font-medium' : 'font-normal'}`}>{text.title}</span>
                        {text.body && <span className="ag-small line-clamp-2">{text.body}</span>}
                        <span className="text-xs text-[var(--ink-faint)]">{timeAgo(n.created_at, i18n.language, t)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {more(found.notes.length)}
          </Box>
        </section>
      )}
    </div>
  );
}

/** The search could not be asked (offline, server down): say so, and offer to ask again. */
function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="ag-category-recerr" data-testid="search-sheet-error">
      <p className="ag-err m-0" role="alert">{t('search.failed', 'Could not search right now. Check your connection.')}</p>
      <Button variant="text" onClick={onRetry} data-testid="search-sheet-retry">{t('common.retry', 'Try again')}</Button>
    </div>
  );
}
