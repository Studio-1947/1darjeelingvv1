import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { fetchFavorites, SavedListing } from '@/lib/favorites';
import ListingCard from '@/components/ListingCard';

/**
 * The current user's saved listings. Auth-gated: a logged-out visitor is sent to sign in and
 * returned here. Reuses ListingCard, since the API returns items shaped like /listings.
 */
export default function Saved() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<SavedListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return; // wait until we know whether there's a session
    if (!user) {
      nav('/login?next=/saved', { replace: true });
      return;
    }
    setLoading(true);
    fetchFavorites().then(setItems).finally(() => setLoading(false));
  }, [user, authLoading, nav]);

  if (authLoading || (user && loading)) {
    return <div className="mx-auto max-w-6xl px-4 md:px-6 py-8 text-ink-soft">{t('common.loading')}</div>;
  }
  if (!user) return null; // redirecting

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-8">
      <div className="mb-6">
        <div className="text-[11px] font-bold uppercase tracking-widest text-flag flex items-center gap-1.5">
          <Heart size={14} /> Saved
        </div>
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">
          Your saved places
        </h1>
        <p className="mt-1 text-sm text-ink-soft">{items.length} saved</p>
      </div>

      {items.length === 0 ? (
        <div className="mist-panel p-8 md:p-10 text-center">
          <Heart size={28} className="mx-auto text-ink-soft/50" />
          <p className="mt-3 text-ink-soft">Nothing saved yet. Tap the heart on any place to save it here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {items.map((it) => <ListingCard key={it.id} item={it} />)}
        </div>
      )}
    </div>
  );
}
