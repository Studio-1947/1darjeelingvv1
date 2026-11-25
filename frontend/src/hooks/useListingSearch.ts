import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

/** How long typing must pause before the search is asked. */
export const SEARCH_DEBOUNCE_MS = 300;
/** How long an answer is reused for the same words (typing back, reopening the sheet). */
const SEARCH_FRESH_MS = 30_000;

/**
 * Worth asking the server: two letters, or one in a script where one letter can be a word
 * (Devanagari, Bengali). A single Latin letter matches nearly everything and costs a full search.
 */
export function searchable(term: string): boolean {
  // A letter or digit outside Latin; a lone symbol (₹, ’) reads as nothing on the server.
  return term.length >= 2 || (/[^\u0000-ɏ]/.test(term) && /[\p{L}\p{N}]/u.test(term));
}

/** The value, once it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export type ListingSearch = { q: string; items: any[]; search: any | null; next_offset: number | null; total?: number };

/**
 * The smart search (GET /listings?q=, server lib/searchIndex.ts) as the traveller types:
 * asked once typing pauses, only for words worth asking, the previous request cancelled when the
 * words change, the same words answered from the cache for a while, and the last answer kept on
 * screen while the next one loads (`data.q` says which words it is for).
 */
export function useListingSearch(text: string, params: Record<string, unknown> = {}) {
  const term = useDebounced(text.trim(), SEARCH_DEBOUNCE_MS);
  const enabled = searchable(term);
  const query = useQuery<ListingSearch>({
    queryKey: ['listing-search', term, params],
    queryFn: ({ signal }) => api.get('/listings', { params: { q: term, ...params }, signal })
      .then((r) => ({ ...r.data, q: term, next_offset: r.data.next_offset ?? null })),
    enabled,
    staleTime: SEARCH_FRESH_MS,
    // The last answer while the next loads, but only for the same category and day: another
    // category's results never show under this one.
    placeholderData: (prev, prevQuery) => (prevQuery && JSON.stringify(prevQuery.queryKey[2]) === JSON.stringify(params) ? prev : undefined),
    retry: 1,
  });
  const typed = text.trim();
  return {
    /** The words the server is asked about (the typed words, once typing pauses). */
    term,
    /** Whether the typed words go to the server at all (see `searchable`). */
    enabled: searchable(typed),
    /** The latest answer, possibly for earlier words while the next loads: compare `data.q`. */
    // Nothing for words too short to ask about ("ab" back to "a"): the page's own match shows.
    data: enabled && searchable(typed) ? query.data : undefined,
    /** The answer on screen is for exactly the words typed now. */
    fresh: !!query.data && query.data.q === typed && !query.isPlaceholderData,
    failed: query.isError && !query.isFetching,
    retry: () => { query.refetch(); },
  };
}
