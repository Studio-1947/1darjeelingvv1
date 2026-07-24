import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, Share2, Map, Check, Sparkles, X, Copy, ExternalLink } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { fetchFavorites, SavedListing } from '@/lib/favorites';
import api from '@/lib/api';
import ListingCard from '@/components/ListingCard';

/**
 * Wishlist / Saved places with shareable Trip Plan itinerary feature.
 */
export default function Saved() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();

  const [items, setItems] = useState<SavedListing[]>([]);
  const [loading, setLoading] = useState(true);

  // Share modal state
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tripTitle, setTripTitle] = useState(() => t('saved.default_trip_name'));

  const sharedPlanParam = searchParams.get('plan');

  useEffect(() => {
    if (sharedPlanParam) {
      // Shared plan view mode
      setLoading(true);
      const ids = sharedPlanParam.split(',').filter(Boolean);
      Promise.all(ids.map((id) => api.get(`/listings/${id}`).then((r) => r.data.item).catch(() => null)))
        .then((res) => setItems(res.filter(Boolean)))
        .finally(() => setLoading(false));
      return;
    }

    if (authLoading) return;
    if (!user) {
      nav('/login?next=/saved', { replace: true });
      return;
    }
    setLoading(true);
    fetchFavorites().then(setItems).finally(() => setLoading(false));
  }, [user, authLoading, nav, sharedPlanParam]);

  const getShareableUrl = () => {
    const ids = items.map((i) => i.id).join(',');
    const origin = window.location.origin;
    return `${origin}/saved?plan=${encodeURIComponent(ids)}`;
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(getShareableUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsAppShare = () => {
    const url = getShareableUrl();
    const text = `${t('saved.wa_message')}\n\n${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (authLoading || (user && loading && !sharedPlanParam)) {
    return <div className="mx-auto max-w-6xl px-4 md:px-6 py-8 text-ink-soft">{t('common.loading')}</div>;
  }
  if (!user && !sharedPlanParam) return null;

  // Group items by category for trip plan view
  const homestays = items.filter((i) => i.type === 'homestay');
  const drivers = items.filter((i) => i.type === 'driver');
  const spotsAndCafes = items.filter((i) => i.type !== 'homestay' && i.type !== 'driver');

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-8 pb-24 lg:pb-12">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-flag flex items-center gap-1.5">
            <Heart size={14} /> {sharedPlanParam ? t('saved.shared_label') : t('saved.label')}
          </div>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">
            {sharedPlanParam ? t('saved.shared_title') : t('saved.title')}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">{t('saved.count', { count: items.length })}</p>
        </div>

        {items.length > 0 && (
          <button
            onClick={() => setShowPlanModal(true)}
            data-testid="plan-trip-cta"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-pine text-white font-bold text-sm btn-hover shadow-sm"
          >
            <Sparkles size={16} /> {t('saved.plan_cta')}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mist-panel p-8 md:p-10 text-center">
          <Heart size={28} className="mx-auto text-ink-soft/50" />
          <p className="mt-3 text-ink-soft">{t('saved.empty')}</p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {items.map((it) => <ListingCard key={it.id} item={it} />)}
          </div>
        </div>
      )}

      {/* Shareable Trip Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm grid place-items-center p-4">
          <div className="bg-white rounded-3xl border border-[var(--line)] max-w-lg w-full p-6 md:p-8 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowPlanModal(false)}
              className="absolute top-5 right-5 text-ink-soft hover:text-ink p-1 rounded-full hover:bg-mist transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-2 text-pine font-extrabold text-xs uppercase tracking-wider mb-1">
              <Map size={16} /> {t('saved.modal_label')}
            </div>
            <h2 className="font-display font-extrabold text-2xl text-ink">{t('saved.modal_title')}</h2>
            <p className="text-sm text-ink-soft mt-1">
              {t('saved.modal_note')}
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-soft uppercase mb-1">{t('saved.trip_name')}</label>
                <input
                  type="text"
                  value={tripTitle}
                  onChange={(e) => setTripTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white text-sm font-semibold text-ink outline-none"
                />
              </div>

              {/* Summary breakdown */}
              <div className="mist-panel p-4 space-y-2 text-xs font-semibold text-ink">
                {homestays.length > 0 && <div>🏡 {t('saved.stays')}: {homestays.map(h => h.title).join(', ')}</div>}
                {drivers.length > 0 && <div>🚗 {t('saved.drivers')}: {drivers.map(d => d.title).join(', ')}</div>}
                {spotsAndCafes.length > 0 && <div>📍 {t('saved.spots_cafes')}: {spotsAndCafes.map(s => s.title).join(', ')}</div>}
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-soft uppercase mb-1">{t('saved.share_link')}</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    type="text"
                    value={getShareableUrl()}
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-mist text-xs text-ink font-mono outline-none truncate"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-ink text-white font-bold text-xs btn-hover whitespace-nowrap"
                  >
                    {copied ? <Check size={14} className="text-pine" /> : <Copy size={14} />}
                    {copied ? t('saved.copied') : t('saved.copy')}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  onClick={handleWhatsAppShare}
                  className="flex-1 py-3 rounded-full bg-[#25D366] text-white font-bold text-sm btn-hover inline-flex items-center justify-center gap-2 shadow-sm"
                >
                  <Share2 size={16} /> {t('saved.share_whatsapp')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
