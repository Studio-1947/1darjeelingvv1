import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchFavoriteIds, addFavorite, removeFavorite } from '@/lib/favorites';

interface FavoritesValue {
  /** Set of listing ids the current user has saved. */
  ids: Set<string>;
  isFavorite: (listingId: string) => boolean;
  /** Add/remove a listing from favorites. Assumes the user is logged in - callers gate on that. */
  toggle: (listingId: string) => Promise<void>;
  refresh: () => void;
  loading: boolean;
}

const FavoritesCtx = createContext<FavoritesValue | null>(null);

/**
 * Holds the current user's set of saved listing ids so every save button on a page can reflect
 * its state from one fetch, and toggles it optimistically (reverting on error). Cleared on logout.
 * Mount inside AuthProvider - it keys off the authenticated user.
 */
export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  // A ref mirror so `toggle` can read the latest set without being torn down/recreated on every
  // change (and without a stale closure) - updaters stay pure, which keeps StrictMode double-invoke safe.
  const idsRef = useRef(ids);
  useEffect(() => { idsRef.current = ids; }, [ids]);

  const refresh = useCallback(async () => {
    if (!user) { setIds(new Set()); return; }
    setLoading(true);
    try {
      setIds(new Set(await fetchFavoriteIds()));
    } catch {
      // Leave whatever we have; a failed refresh shouldn't wipe the UI's current state.
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggle = useCallback(async (listingId: string) => {
    const currentlyFav = idsRef.current.has(listingId);
    setIds(prev => {
      const next = new Set(prev);
      if (currentlyFav) next.delete(listingId); else next.add(listingId);
      return next;
    });
    try {
      if (currentlyFav) await removeFavorite(listingId);
      else await addFavorite(listingId);
    } catch (e) {
      // Revert the optimistic change on failure and let the caller decide whether to surface it.
      setIds(prev => {
        const next = new Set(prev);
        if (currentlyFav) next.add(listingId); else next.delete(listingId);
        return next;
      });
      throw e;
    }
  }, []);

  const value = useMemo<FavoritesValue>(() => ({
    ids,
    isFavorite: (listingId: string) => ids.has(listingId),
    toggle,
    refresh,
    loading,
  }), [ids, toggle, refresh, loading]);

  return <FavoritesCtx.Provider value={value}>{children}</FavoritesCtx.Provider>;
}

export const useFavorites = (): FavoritesValue => {
  const ctx = useContext(FavoritesCtx);
  if (!ctx) throw new Error('useFavorites must be used within a FavoritesProvider');
  return ctx;
};
