import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Storefront, Plus, Trash, Pencil, CheckCircle, Clock, ListBullets, CircleNotch as Loader2, MapPin } from '@phosphor-icons/react';
import ListingFormModal from '@/components/ListingFormModal';
import EditListingModal from '@/components/provider/dashboard/EditListingModal';
import HostPlanCard from '@/components/provider/dashboard/HostPlanCard';
import { useSeo } from '@/components/Seo';
import { Insight } from '@/components/provider/dashboard/Insight';
import { Box, Button, ButtonLink, MenuIcon, PageHead, Status } from '@/components/ag';

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

  const activeCount = provider.status === 'active' ? listings.length : 0;
  const isBusinessActive = provider.status === 'active';

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        <PageHead eyebrow={provider.business_name} title={t('ui.myListings.title')} sub={t('ui.myListings.subtitle')}>
          <div className="ag-row mt-2">
            <Status tone={isBusinessActive ? 'ok' : 'pending'}>
              {isBusinessActive ? <CheckCircle size={14} weight="fill" aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
              {isBusinessActive ? t('provider.active') : t('provider.pending')}
            </Status>
          </div>
        </PageHead>

        <Button variant="primary" icon={<Plus />} go className="self-start" onClick={() => setListingModal({ open: true, editing: null })} data-testid="add-listing-cta">
          {t('ui.myListings.add_new')}
        </Button>

        <HostPlanCard provider={provider} user={user} onRenewed={refreshProviderAccess} />

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <Insight icon={ListBullets} label={t('ui.myListings.total')} value={listings.length} />
          <Insight icon={CheckCircle} label={t('ui.myListings.live')} value={activeCount} />
          <Insight icon={Storefront} label={t('ui.myListings.business_type')} value={t(`categories.${provider.business_type}`, { defaultValue: provider.business_type })} />
        </div>

        {listings.length === 0 ? (
          <Box>
            <MenuIcon><ListBullets /></MenuIcon>
            <div>
              <h2>{t('ui.myListings.empty_title')}</h2>
              <p className="ag-small">{t('ui.myListings.empty_body')}</p>
            </div>
            <Button icon={<Plus />} className="self-start" onClick={() => setListingModal({ open: true, editing: null })}>{t('ui.myListings.add_first')}</Button>
          </Box>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {listings.map((l) => (
              <article key={l.id} data-testid={`my-listing-card-${l.id}`} className="ag-card">
                <div className="relative">
                  {l.image ? <img src={l.image} alt="" className="img" /> : <div className="img !grid place-items-center text-[var(--r)]"><Storefront size={32} aria-hidden="true" /></div>}
                  <Status tone="info" className="absolute left-2.5 top-2.5 !bg-[var(--surface)]">{t(`categories.${l.type}`, { defaultValue: l.type })}</Status>
                </div>
                <div className="body">
                  <span className="name line-clamp-1">{l.title}</span>
                  <span className="meta flex items-center gap-1"><MapPin size={14} className="flex-none text-[var(--r)]" aria-hidden="true" /><span className="truncate">{l.location}</span></span>
                  {l.price > 0 && (
                    <span className="ag-price">₹{l.price.toLocaleString('en-IN')} <span className="unit">{t('ui.myListings.starting')}</span></span>
                  )}
                  <div className="ag-row mt-2">
                    <ButtonLink to={`/listing/${l.id}`} size="sm" data-testid={`view-listing-${l.id}`}>{t('common.view')}</ButtonLink>
                    <Button size="sm" icon={<Pencil />} onClick={() => setSelectedListing(l)} data-testid={`edit-listing-${l.id}`}>{t('common.edit')}</Button>
                    <Button size="sm" variant="stop" icon={<Trash />} onClick={() => handleDeleteListing(l.id)} data-testid={`delete-listing-${l.id}`}>{t('common.delete')}</Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
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
