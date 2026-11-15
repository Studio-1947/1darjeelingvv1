import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, ShareNetwork as Share2, Path, Check, X, Copy, WhatsappLogo } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import { fetchFavorites, SavedListing } from '@/lib/favorites';
import api from '@/lib/api';
import ListingCard from '@/components/ListingCard';
import TripPlannerModal from '@/components/TripPlannerModal';
import { useSeo } from '@/components/Seo';
import { Box, Button, ButtonLink, IconButton, PageHead, TextField } from '@/components/ag';

/**
 * Saved (prototype V.saved): the places you kept, two to a row, with Plan a trip and a shareable
 * trip plan link. /saved?plan=id,id shows a shared plan to anyone.
 */
export default function Saved() {
  const { t } = useTranslation();
  useSeo({ title: t('saved.title'), noindex: true });
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();

  const [items, setItems] = useState<SavedListing[]>([]);
  const [loading, setLoading] = useState(true);

  // Share sheet state
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showItineraryModal, setShowItineraryModal] = useState(false);
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

  const head = (
    <PageHead eyebrow={sharedPlanParam ? t('saved.shared_label') : t('ui.saved.eyebrow', 'Your favourites')}
      title={sharedPlanParam ? t('saved.shared_title') : t('nav.saved')}
      sub={items.length > 0 ? t('saved.count', { count: items.length }) : undefined} />
  );

  if (authLoading || (user && loading && !sharedPlanParam)) {
    return <div className="ag-wrap"><div className="ag-main">{head}<p className="ag-small">{t('common.loading')}</p></div></div>;
  }
  if (!user && !sharedPlanParam) return null;

  // Group items by category for the share sheet
  const homestays = items.filter((i) => i.type === 'homestay');
  const drivers = items.filter((i) => i.type === 'driver');
  const spotsAndCafes = items.filter((i) => i.type !== 'homestay' && i.type !== 'driver');

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        {head}

        {items.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" go icon={<Path />} onClick={() => setShowItineraryModal(true)} data-testid="build-itinerary-cta">
              {t('ui.saved.plan', 'Plan a trip')}
            </Button>
            <Button icon={<Share2 />} onClick={() => setShowPlanModal(true)} data-testid="plan-trip-cta">
              {t('saved.plan_cta')}
            </Button>
          </div>
        )}

        {items.length === 0 ? (
          <Box data-testid="saved-empty">
            <span className="ag-micon"><Heart /></span>
            <div>
              <h2>{t('saved.empty')}</h2>
              <p className="ag-small">{t('ui.saved.empty_hint', 'Tap the heart on any place, homestay or driver to keep it here.')}</p>
            </div>
            <ButtonLink to="/explore" go className="self-start">{t('ui.trips.find', 'Find a place')}</ButtonLink>
          </Box>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {items.map((it) => <ListingCard key={it.id} item={it} />)}
          </div>
        )}
      </div>

      {/* Shareable trip plan sheet */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="share-plan-title">
          <div className="absolute inset-0 bg-black/55" onClick={() => setShowPlanModal(false)} />
          <div className="relative z-10 w-full max-w-[720px] sm:max-w-lg max-h-[90dvh] overflow-y-auto rounded-t-[22px] sm:rounded-[22px] bg-[var(--surface)] p-4 pb-6 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="ag-eyebrow">{t('saved.modal_label')}</span>
                <h2 id="share-plan-title" className="font-medium text-2xl text-[var(--ink7)]">{t('saved.modal_title')}</h2>
                <p className="ag-small">{t('saved.modal_note')}</p>
              </div>
              <IconButton label={t('common.close')} onClick={() => setShowPlanModal(false)}><X /></IconButton>
            </div>

            <TextField label={t('saved.trip_name')} value={tripTitle} onChange={(e) => setTripTitle(e.target.value)} />

            <Box flat className="!gap-1 text-sm text-[var(--ink7)]">
              {homestays.length > 0 && <p><b className="font-medium text-[var(--ink-strong)]">{t('saved.stays')}:</b> {homestays.map((h) => h.title).join(', ')}</p>}
              {drivers.length > 0 && <p><b className="font-medium text-[var(--ink-strong)]">{t('saved.drivers')}:</b> {drivers.map((d) => d.title).join(', ')}</p>}
              {spotsAndCafes.length > 0 && <p><b className="font-medium text-[var(--ink-strong)]">{t('saved.spots_cafes')}:</b> {spotsAndCafes.map((s) => s.title).join(', ')}</p>}
            </Box>

            <div className="flex items-end gap-2">
              <TextField label={t('saved.share_link')} readOnly value={getShareableUrl()} className="flex-1 min-w-0" />
              <Button onClick={handleCopyLink} icon={copied ? <Check /> : <Copy />}>{copied ? t('saved.copied') : t('saved.copy')}</Button>
            </div>

            <Button variant="primary" block center icon={<WhatsappLogo />} onClick={handleWhatsAppShare}>{t('saved.share_whatsapp')}</Button>
          </div>
        </div>
      )}

      <TripPlannerModal
        open={showItineraryModal}
        onClose={() => setShowItineraryModal(false)}
        savedTitles={items.map((i) => i.title)}
      />
    </div>
  );
}
