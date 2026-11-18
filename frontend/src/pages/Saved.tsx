import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, X, Copy, WhatsappLogo } from '@phosphor-icons/react';
import { Icon } from '@/components/ag/Icon';
import { useAuth } from '@/context/AuthContext';
import { fetchFavorites, SavedListing } from '@/lib/favorites';
import api from '@/lib/api';
import ListingCard from '@/components/ListingCard';
import TripPlannerModal from '@/components/TripPlannerModal';
import { useSeo } from '@/components/Seo';
import { Box, Button, ButtonLink, Chip, Chips, IconButton, PageHead, TextField } from '@/components/ag';

/** Prototype order of the saved groups: places to see, stays, rides, guides, food, shops, events. */
const TYPE_ORDER = ['spot', 'biodiversity', 'homestay', 'driver', 'guide', 'cafe', 'shop', 'event'];

/**
 * Saved (prototype V.saved): the places you kept, two to a row, with Plan a trip and a shareable
 * trip plan link. /saved?plan=id,id shows a shared plan to anyone.
 */
export default function Saved() {
  const { t } = useTranslation();
  useSeo({ title: t('saved.title'), noindex: true });
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();

  const [items, setItems] = useState<SavedListing[]>([]);
  const [kind, setKind] = useState('');
  const typeLabel = (k: string) => t(`nav.${({ spot: 'spots', homestay: 'homestays', driver: 'drivers', guide: 'guides', cafe: 'cafes', shop: 'shops', event: 'events', biodiversity: 'biodiversity' } as Record<string, string>)[k] || k}`, k);
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
    if (!user) { setLoading(false); return; }
    setLoading(true);
    fetchFavorites().then(setItems).finally(() => setLoading(false));
  }, [user, authLoading, sharedPlanParam]);

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
      title={sharedPlanParam ? t('saved.shared_title') : t('nav.saved')} />
  );

  if (authLoading || (user && loading && !sharedPlanParam)) {
    return <div className="ag-wrap"><div className="ag-main">{head}<p className="ag-small">{t('common.loading')}</p></div></div>;
  }
  // Signed out: the prototype's empty box, asking them to log in.
  if (!user && !sharedPlanParam) {
    return (
      <div className="ag-wrap">
        <div className="ag-main">
          {head}
          <Box className="ag-account-empty" data-testid="saved-guest">
            <Icon name="heart" />
            <p>{t('ui.saved.guest', 'Log in to keep the places you like here.')}</p>
            <p className="ag-small">{t('ui.saved.empty_hint', 'Tap the heart on any place, homestay or driver to keep it here.')}</p>
            <ButtonLink to="/login?next=/saved" go data-testid="saved-login">{t('nav.login')}</ButtonLink>
          </Box>
        </div>
      </div>
    );
  }

  // Category pills (prototype svpills): Everything, then each kind of place you saved.
  const kinds = TYPE_ORDER.filter((k) => items.some((i) => i.type === k))
    .concat([...new Set(items.map((i) => i.type))].filter((k) => !TYPE_ORDER.includes(k)));
  const pick = kinds.includes(kind) ? kind : '';
  const groups = kinds.filter((k) => !pick || k === pick);

  // Group items by category for the share sheet
  const homestays = items.filter((i) => i.type === 'homestay');
  const drivers = items.filter((i) => i.type === 'driver');
  const spotsAndCafes = items.filter((i) => i.type !== 'homestay' && i.type !== 'driver');

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        {head}

        {items.length > 0 && kinds.length > 1 && (
          <Chips scroll className="ag-account-pills" role="group" aria-label={t('ui.saved.filter', 'Show saved')} data-testid="saved-pills">
            <Chip on={!pick} onClick={() => setKind('')}>{t('ui.trips.all', 'Everything')} <span className="n">{items.length}</span></Chip>
            {kinds.map((k) => (
              <Chip key={k} on={pick === k} onClick={() => setKind(k)} data-testid={`saved-pill-${k}`}>
                {typeLabel(k)} <span className="n">{items.filter((i) => i.type === k).length}</span>
              </Chip>
            ))}
          </Chips>
        )}

        {items.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button go size="sm" icon={<Icon name="t_trip" />} onClick={() => setShowItineraryModal(true)} data-testid="build-itinerary-cta">
              {t('ui.saved.plan', 'Plan a trip')}
            </Button>
            <Button size="sm" icon={<Icon name="share" />} onClick={() => setShowPlanModal(true)} data-testid="plan-trip-cta">
              {t('saved.plan_cta')}
            </Button>
          </div>
        )}

        {items.length === 0 ? (
          <Box className="ag-account-empty" data-testid="saved-empty">
            <Icon name="heart" />
            <p>{t('saved.empty')}</p>
            <p className="ag-small">{t('ui.saved.empty_hint', 'Tap the heart on any place, homestay or driver to keep it here.')}</p>
            <ButtonLink to="/explore" go>{t('ui.trips.find', 'Find a place')}</ButtonLink>
          </Box>
        ) : (
          groups.map((k) => {
            const list = items.filter((i) => i.type === k);
            return (
              <section key={k} className="ag-account-savesec" data-testid={`saved-group-${k}`}>
                {!pick && kinds.length > 1 && <h2>{typeLabel(k)} <span className="ag-small">{list.length}</span></h2>}
                <div className="grid grid-cols-2 gap-2.5">
                  {list.map((it) => <ListingCard key={it.id} item={it} />)}
                </div>
              </section>
            );
          })
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
