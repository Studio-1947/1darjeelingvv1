import { useEffect, useRef } from 'react';
import { API_BASE } from '@/lib/api';

/**
 * The search log (server routes/searchEvents.ts), as the Privacy Policy describes it (1.5, 6):
 * the words of a traveller's search once its results have settled on screen, how many there were,
 * and the result opened. Anonymous: a random code for this browser visit (sessionStorage, gone when
 * the tab closes), never the account. Phone numbers and email addresses are removed first.
 * Nothing is sent when the browser asks not to be tracked (Do Not Track, Global Privacy Control).
 *
 * The same search and open go to Google Analytics as its standard `search` and `select_item`
 * events, on the live site only (public/gtag-init.js defines gtag there).
 */

/** How long results must stay on screen to count as the search (not a word on the way). */
const SETTLE_MS = 1500;
const VISIT_KEY = 'aangan:search-visit';

export function trackingRefused(): boolean {
  if (typeof navigator === 'undefined') return true;
  const n = navigator as any;
  const w = typeof window !== 'undefined' ? (window as any) : {};
  return n.doNotTrack === '1' || w.doNotTrack === '1' || n.globalPrivacyControl === true;
}

/** Same rule as the server (lib/searchEvents.ts scrubQuery): no email addresses, no 5+ digit numbers. */
export function scrubQuery(q: string): string {
  return String(q || '')
    .replace(/[^\s@]+@[^\s@]+/g, ' ')
    .replace(/\+?\d(?:[\s.-]?\d){4,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function visit(): string {
  try {
    let v = sessionStorage.getItem(VISIT_KEY);
    if (!v) {
      v = (crypto.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
      sessionStorage.setItem(VISIT_KEY, v);
    }
    return v;
  } catch {
    return '';
  }
}

function ga(event: string, params: Record<string, unknown>) {
  const gtag = (window as any).gtag;
  if (typeof gtag === 'function') gtag('event', event, params);
}

export type SearchLogInput = {
  q: string;
  type?: string | null;
  surface: 'category' | 'sheet';
  source: 'typed' | 'voice';
  results: number;
  fallback?: boolean;
};

/**
 * Sent without the sign-in token or any other header the app adds (plain fetch, not the api
 * client): the log is anonymous, so nothing about the account goes with it. keepalive lets the
 * record of an opened result finish while the page moves to the listing.
 */
async function post(path: string, body: unknown, method = 'POST'): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method, keepalive: true, credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.status === 204 ? null : res.json();
}

/** Searches already sent this visit, so reopening the sheet does not count the same search again. */
const sentThisVisit = new Map<string, Promise<string | null>>();

async function send(input: SearchLogInput): Promise<string | null> {
  const q = scrubQuery(input.q);
  const session = visit();
  if (!q || !session) return null;
  ga('search', { search_term: q });
  try {
    const data = await post('/search-events', { ...input, q, session, type: input.type || undefined });
    return data?.id || null;
  } catch {
    return null; // Never in the way of searching.
  }
}

/**
 * Logs a search once its results have settled (`ready` true for the same words and counts for
 * SETTLE_MS), once per words per page. `opened(id, rank)` records the result a traveller opened,
 * logging the search first if it had not settled yet. Does nothing when `input` is null (no
 * search, a business searching its own data) or the browser refuses tracking.
 */
export function useSearchLog(input: SearchLogInput | null, ready: boolean) {
  const current = useRef<{ key: string; input: SearchLogInput } | null>(null);
  const key = input ? `${input.surface}|${input.type || ''}|${scrubQuery(input.q).toLowerCase()}` : '';
  current.current = input && ready ? { key, input } : null;

  const log = (k: string, i: SearchLogInput) => {
    let p = sentThisVisit.get(k);
    if (!p) { p = send(i); sentThisVisit.set(k, p); }
    return p;
  };

  useEffect(() => {
    if (!input || !ready || trackingRefused() || !scrubQuery(input.q)) return undefined;
    const snapshot = input;
    const timer = setTimeout(() => { void log(key, snapshot); }, SETTLE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, input?.results, input?.fallback, input?.source]);

  return {
    opened(listingId: string, rank: number) {
      const at = current.current;
      if (!at || trackingRefused()) return;
      ga('select_item', { item_list_name: 'search', items: [{ item_id: listingId, index: rank }] });
      void log(at.key, at.input).then((id) => {
        if (id) post(`/search-events/${id}/opened`, { session: visit(), listing_id: listingId, rank }, 'PATCH').catch(() => {});
      });
    },
  };
}
