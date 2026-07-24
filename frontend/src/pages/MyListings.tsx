import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { 
  Store, Plus, Trash2, Pencil, ExternalLink, ArrowRight, CheckCircle2, 
  Clock, LayoutList, Loader2, Sparkles, Building2, MapPin, Tag
} from 'lucide-react';
import ListingFormModal from '@/components/ListingFormModal';
import EditListingModal from '@/components/provider/dashboard/EditListingModal';

export default function MyListings() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  
  const [provider, setProvider] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'pending'>('all');
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

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-ink-soft">
        <Loader2 size={24} className="animate-spin mx-auto mb-2 text-flag" />
        {t('common.loading')}
      </div>
    );
  }

  // Non-logged-in user
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-pine/10 text-pine grid place-items-center mx-auto mb-4">
          <Store size={28} />
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-ink">Service Provider Listings</h1>
        <p className="text-ink-soft max-w-md mx-auto mt-2 text-sm">
          Log in as a homestay host, driver, cafe, or local shop owner to manage your business listings on 1 Darjeeling.
        </p>
        <button
          onClick={() => nav('/login?next=/my-listings')}
          className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-pine text-white font-bold text-sm btn-hover shadow-md"
        >
          Log In to Manage Listings
        </button>
      </div>
    );
  }

  // Logged-in user, but not onboarded as a provider yet
  if (!provider) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-flag/10 text-flag grid place-items-center mx-auto mb-4">
          <Building2 size={28} />
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-ink">List Your Business on 1 Darjeeling</h1>
        <p className="text-ink-soft max-w-md mx-auto mt-2 text-sm leading-relaxed">
          Are you a local homestay owner, taxi driver, cafe owner, or local artisan in Darjeeling? Reach thousands of visitors with direct zero-commission bookings.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <Link
            to="/provider/onboard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-flag text-white font-bold text-sm btn-hover shadow-md"
          >
            {t('provider.onboard_title')} <ArrowRight size={16} />
          </Link>
          <Link
            to="/my-trips"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-[var(--line)] text-ink font-semibold text-sm btn-hover"
          >
            View My Personal Trips
          </Link>
        </div>
      </div>
    );
  }

  const activeCount = provider.status === 'active' ? listings.length : 0;
  const isBusinessActive = provider.status === 'active';

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-10 pb-24 lg:pb-12">
      {/* Header Block */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-flag flex items-center gap-1.5">
            <Store size={13} /> {provider.business_name}
          </div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl md:text-4xl text-ink mt-1">
            My Listings
          </h1>
          <p className="text-xs sm:text-sm text-ink-soft mt-1">
            Manage your public business listings, room rates, driver profiles, and offerings.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-bold text-xs ${
              isBusinessActive ? 'bg-pine/10 text-pine' : 'bg-gold/20 text-[#8a6b04]'
            }`}
          >
            {isBusinessActive ? <CheckCircle2 size={14} /> : <Clock size={14} />}
            {isBusinessActive ? t('provider.active') : t('provider.pending')}
          </span>

          <button
            onClick={() => setListingModal({ open: true, editing: null })}
            data-testid="add-listing-cta"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-flag text-white font-bold text-xs sm:text-sm btn-hover shadow-sm"
          >
            <Plus size={15} /> Add New Listing
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-8">
        <div className="rounded-2xl p-4 bg-gradient-to-br from-pine to-pine-dark text-white shadow-sm">
          <div className="text-[11px] uppercase tracking-widest font-bold opacity-90">Total Listings</div>
          <div className="mt-1 font-display font-extrabold text-2xl sm:text-3xl leading-none">
            {listings.length}
          </div>
        </div>
        <div className="rounded-2xl p-4 bg-gradient-to-br from-flag to-[#8a1e1e] text-white shadow-sm">
          <div className="text-[11px] uppercase tracking-widest font-bold opacity-90">Live Listings</div>
          <div className="mt-1 font-display font-extrabold text-2xl sm:text-3xl leading-none">
            {activeCount}
          </div>
        </div>
        <div className="rounded-2xl p-4 bg-gradient-to-br from-gold to-[#c69108] text-white shadow-sm col-span-2 md:col-span-1">
          <div className="text-[11px] uppercase tracking-widest font-bold opacity-90">Business Type</div>
          <div className="mt-1 font-display font-bold text-lg sm:text-xl capitalize leading-tight">
            {provider.business_type}
          </div>
        </div>
      </div>

      {/* Listings section */}
      {listings.length === 0 ? (
        <div className="mist-panel p-8 md:p-12 text-center rounded-3xl">
          <div className="w-12 h-12 rounded-full bg-mist text-ink-soft grid place-items-center mx-auto mb-3">
            <LayoutList size={24} />
          </div>
          <h3 className="font-display font-bold text-lg text-ink">No active listings yet</h3>
          <p className="text-xs sm:text-sm text-ink-soft max-w-md mx-auto mt-1">
            Add your homestay rooms, driver profile, or cafe menu details to start showcasing your services to Darjeeling travellers.
          </p>
          <button
            onClick={() => setListingModal({ open: true, editing: null })}
            className="mt-6 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-flag text-white font-bold text-xs sm:text-sm btn-hover"
          >
            <Plus size={16} /> Add Your First Listing
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {listings.map((l) => (
            <div
              key={l.id}
              data-testid={`my-listing-card-${l.id}`}
              className="bg-white rounded-2xl border border-[var(--line)] overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                <div className="aspect-[4/3] bg-mist overflow-hidden relative">
                  {l.image ? (
                    <img src={l.image} alt={l.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-ink-soft">
                      <Store size={32} />
                    </div>
                  )}
                  <div className="absolute top-2.5 left-2.5">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-white/90 backdrop-blur-sm text-ink shadow-sm">
                      {l.type}
                    </span>
                  </div>
                </div>

                <div className="p-4">
                  <h3 className="font-display font-bold text-ink text-base line-clamp-1">{l.title}</h3>
                  <div className="text-xs text-ink-soft mt-0.5 flex items-center gap-1">
                    <MapPin size={11} className="text-pine flex-shrink-0" />
                    <span className="truncate">{l.location}</span>
                  </div>

                  {l.price > 0 && (
                    <div className="mt-2 font-extrabold text-pine text-base">
                      ₹{l.price.toLocaleString('en-IN')}{' '}
                      <span className="text-[11px] font-normal text-ink-soft">starting</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 pt-0 border-t border-[var(--line)]/50 mt-2">
                <div className="mt-3 flex items-center justify-between gap-2">
                  <Link
                    to={`/listing/${l.id}`}
                    data-testid={`view-listing-${l.id}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-pine hover:underline"
                  >
                    View <ExternalLink size={11} />
                  </Link>

                  <button
                    onClick={() => setSelectedListing(l)}
                    data-testid={`edit-listing-${l.id}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-ink-soft hover:text-ink"
                  >
                    <Pencil size={11} /> Edit
                  </button>

                  <button
                    onClick={() => handleDeleteListing(l.id)}
                    data-testid={`delete-listing-${l.id}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-flag hover:text-[#8a1e1e]"
                  >
                    <Trash2 size={11} /> Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
