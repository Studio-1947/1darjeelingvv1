import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { CircleNotch as Loader2 } from '@phosphor-icons/react';
import { Icon } from '@/components/ag/Icon';
import ListingJourney from '@/components/provider/dashboard/ListingJourney';
import InviteHostLink from '@/components/provider/InviteHostLink';
import ListingFormModal from '@/components/ListingFormModal';
import EditListingModal from '@/components/provider/dashboard/EditListingModal';
import HostPlanCard from '@/components/provider/dashboard/HostPlanCard';
import { useSeo } from '@/components/Seo';
import { Box, Button, ButtonLink, PageHead, Status } from '@/components/ag';

export default function MyListings() {
  const { t } = useTranslation();
  useSeo({ title: t('nav.my_listings'), noindex: true });
  const { user, loading: authLoading, refresh } = useAuth();
  const nav = useNavigate();
  
  const [provider, setProvider] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [listingModal, setListingModal] = useState<{ open: boolean; editing: any | null }>({
    open: false,
    editing: null,
  });

  const loadData = useCallback(async () => {
    try {
      const [pRes, bRes] = await Promise.all([
        api.get('/providers/me').catch(() => null),
        api.get('/bookings/provider').catch(() => null),
      ]);
      
      if (pRes?.data?.provider) {
        setProvider(pRes.data.provider);
      }
      if (bRes?.data?.listings) {
        setListings(bRes.data.listings || []);
      }
    } catch (e) {
      console.error('Failed to load provider listings:', e);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        await loadData();
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading, loadData]);

  const handleSaveListing = async (values: any) => {
    if (listingModal.editing) {
      await api.patch(`/listings/${listingModal.editing.id}`, values);
    } else {
      await api.post('/listings', values);
    }
    await loadData();
  };

  const handleDeleteListing = async (listingId: string) => {
    if (!window.confirm(t('pd.delete_confirm') || 'Delete this listing? This cannot be undone.')) return;
    await api.delete(`/listings/${listingId}`);
    await loadData();
  };

  const refreshProviderAccess = async () => {
    await refresh();
    await loadData();
  };

  if (authLoading || loading) {
    return (
      <div className="ag-wrap">
        <div className="ag-main">
          <p className="ag-small flex items-center gap-2"><Loader2 size={20} className="animate-spin text-[var(--r)]" aria-hidden="true" />{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Non-logged-in user
  if (!user) {
    return (
      <div className="ag-wrap">
        <div className="ag-main">
          <PageHead eyebrow={t('provider.dashboard_title')} title={t('ui.myListings.guest_title')} sub={t('ui.myListings.guest_body')} />
          <Button variant="primary" go className="self-start" onClick={() => nav('/login?next=/my-listings')}>{t('ui.myListings.guest_cta')}</Button>
        </div>
      </div>
    );
  }

  // Logged-in user, but not onboarded as a provider yet
  if (!provider) {
    return (
      <div className="ag-wrap">
        <div className="ag-main">
          <PageHead eyebrow={t('provider.dashboard_title')} title={t('ui.myListings.onboard_title')} sub={t('ui.myListings.onboard_body')} />
          <div className="ag-row">
            <ButtonLink to="/provider/onboard" variant="primary" go>{t('provider.onboard_title')}</ButtonLink>
            <ButtonLink to="/my-trips" go>{t('ui.myListings.view_trips')}</ButtonLink>
          </div>
        </div>
      </div>
    );
  }

  const isDriver = provider.business_type === 'driver';
  const live = provider.status === 'active';

  // The prototype's Listings screen (provider.js): two actions, the journey, one box per listing,
  // then the membership card and the invite link that used to sit on the dashboard.
  return (
    <div className="ag-wrap">
      <div className="ag-main">
        <h1 className="ag-host-tabh">{t('host.your_listings', 'Your listings')}</h1>
        <div className="ag-host-two">
          <ButtonLink to="/feed" go data-testid="post-update-cta">{t('pd.post_update')}</ButtonLink>
          <Button icon={<Icon name={isDriver ? 'car' : 'home'} />} onClick={() => nav('/provider/onboard?add=1')} data-testid="add-listing-cta">
            {isDriver ? t('host.add_vehicle', 'Add a vehicle') : t('host.add_property', 'Add a property')}
          </Button>
        </div>

        <ListingJourney count={listings.length} />

        {listings.map((l) => (
          <Box key={l.id} as="article" className="ag-host-lbox" data-testid={`my-listing-card-${l.id}`}>
            <div className="top">
              <h2 className="line-clamp-2">{l.title}</h2>
              {l.price > 0 && <span className="ag-price">₹{Number(l.price).toLocaleString('en-IN')}</span>}
            </div>
            <p className="ag-small m-0">{t(`ob.wz.t_${l.type}`, { defaultValue: l.type })} · {l.location}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Status tone={live && l.extras?.available !== false ? 'ok' : 'pending'}>
                {!live ? t('provider.pending') : l.extras?.available === false ? t('host.paused', 'Not taking bookings') : t('host.live', 'Live on aangan')}
              </Status>
            </div>
            <div className="acts">
              <ButtonLink to={`/listing/${l.id}`} variant="text" data-testid={`view-listing-${l.id}`}>{t('common.view')}</ButtonLink>
              <Button variant="text" onClick={() => setSelectedListing(l)} data-testid={`edit-listing-${l.id}`}>{t('common.edit')}</Button>
              <Button variant="text" className="ag-host-del" onClick={() => handleDeleteListing(l.id)} data-testid={`delete-listing-${l.id}`}>{t('common.delete')}</Button>
            </div>
          </Box>
        ))}

        <HostPlanCard provider={provider} user={user} onRenewed={refreshProviderAccess} />
        <InviteHostLink />
      </div>

      {selectedListing && (
        <EditListingModal
          listing={selectedListing}
          onClose={() => setSelectedListing(null)}
          onSave={loadData}
        />
      )}

      <ListingFormModal
        open={listingModal.open}
        initial={listingModal.editing || undefined}
        onClose={() => setListingModal({ open: false, editing: null })}
        onSubmit={handleSaveListing}
      />
    </div>
  );
}
