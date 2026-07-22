import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { CheckCircle2, Clock, Wallet, CalendarCheck, Users, LayoutList, Phone, MessageCircle, ArrowRight, ExternalLink, X, Upload, Plus, Trash2, Edit, Pencil } from 'lucide-react';
import ListingFormModal from '@/components/ListingFormModal';
import { StatCard } from '@/components/provider/dashboard/widgets';
import BookingCard from '@/components/provider/dashboard/BookingCard';
import EditListingModal from '@/components/provider/dashboard/EditListingModal';
import KycSection from '@/components/provider/dashboard/KycSection';
import VerifiedBadge from '@/components/provider/VerifiedBadge';
import ProfileCompletionBar from '@/components/provider/ProfileCompletionBar';
import { getMyProfile } from '@/lib/kyc';
import type { KycProfile } from '@/lib/kyc';

/** Provider home: booking stats, the bookings list, and business profile. */
export default function ProviderDashboard() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [provider, setProvider] = useState(null);
  const [stats, setStats] = useState({ total: 0, confirmed: 0, pending: 0, revenue: 0 });
  const [bookings, setBookings] = useState([]);
  const [listings, setListings] = useState([]);
  const [tab, setTab] = useState('bookings');
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [listingModal, setListingModal] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [kycProfile, setKycProfile] = useState<KycProfile | null>(null);

  const loadDashboard = React.useCallback(async () => {
    try {
      const [p, b, kyc] = await Promise.all([
        api.get('/providers/me'),
        api.get('/bookings/provider'),
        // The provider may not have an active profile yet (or the request may simply fail) —
        // that must never take down the rest of the dashboard, so it's caught independently
        // and just leaves the "Complete your profile" card and header badge unrendered.
        getMyProfile().catch(() => null),
      ]);
      setProvider(p.data.provider);
      setStats(b.data.stats || {});
      setBookings(b.data.items || []);
      setListings(b.data.listings || []);
      setKycProfile(kyc);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav('/login'); return; }
    (async () => {
      try {
        await loadDashboard();
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading, nav, loadDashboard]);

  // Tracks whether the component is still mounted, so a KYC refresh that resolves after
  // unmount (e.g. the user navigated away while it was in flight) never calls setState.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // A lightweight, independent refresh of just the KYC profile — used to catch up the header
  // badge and completion card when something changed outside this tab (an admin approving a
  // document elsewhere) without re-fetching bookings/listings. Must never break the rest of
  // the dashboard if it fails, so failures are swallowed silently.
  const refreshKycProfile = useCallback(async () => {
    try {
      const kyc = await getMyProfile();
      if (mountedRef.current) setKycProfile(kyc);
    } catch {
      // Best-effort only — the badge simply stays as it was.
    }
  }, []);

  // Re-check on: the tab/window regaining focus or becoming visible again (covers an admin
  // approving a document while this page was open in the background), and on switching into
  // the Business Profile tab (the one place the KYC status is actually shown in detail).
  useEffect(() => {
    if (!provider) return;
    const onFocus = () => { refreshKycProfile(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') refreshKycProfile(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [provider, refreshKycProfile]);

  useEffect(() => {
    if (tab === 'profile') refreshKycProfile();
  }, [tab, refreshKycProfile]);

  const handleSaveListing = async (values: any) => {
    if (listingModal.editing) {
      await api.patch(`/listings/${listingModal.editing.id}`, values);
    } else {
      await api.post('/listings', values);
    }
    await loadDashboard();
  };

  const handleDeleteListing = async (listingId: string) => {
    if (!window.confirm('Delete this listing? This cannot be undone.')) return;
    await api.delete(`/listings/${listingId}`);
    await loadDashboard();
  };

  const handleCancelBooking = async (bookingId: string) => {
    await api.patch(`/bookings/${bookingId}/cancel`);
    await loadDashboard();
  };

  if (authLoading || loading) return <div className="p-10 text-center text-ink-soft">{t('common.loading')}</div>;

  if (!provider) {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center">
        <h1 className="font-display font-extrabold text-3xl text-ink">No business yet</h1>
        <p className="text-ink-soft mt-2">Onboard your business to start receiving bookings.</p>
        <button onClick={() => nav('/provider/onboard')} data-testid="onboard-cta"
          className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-flag text-white font-bold btn-hover">
          {t('provider.onboard_title')} <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  const active = provider.status === 'active';

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-10">
      {/* Header block */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-flag">{t('provider.dashboard_title')}</div>
          <h1 className="mt-1 font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">{provider.business_name}</h1>
          <p className="text-sm text-ink-soft mt-1 capitalize">{provider.business_type} · {provider.location}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              localStorage.setItem(`unlocked_traveller_${user.id}`, 'true');
              nav('/dashboard');
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-pine border border-pine/30 rounded-full px-3.5 py-1.5 hover:bg-pine/5 transition-colors"
          >
            Switch to Traveller
          </button>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-xs ${active ? 'bg-pine/10 text-pine' : 'bg-gold/20 text-[#8a6b04]'}`}
            data-testid="provider-status">
            {active ? <CheckCircle2 size={14} /> : <Clock size={14} />} {active ? t('provider.active') : t('provider.pending')}
          </span>
          {kycProfile?.kyc_status === 'verified' && <VerifiedBadge size="md" />}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Total bookings" value={stats.total} icon={LayoutList} tone="pine" />
        <StatCard label="Confirmed" value={stats.confirmed} sub={`${stats.pending} pending`} icon={CalendarCheck} tone="flag" />
        <StatCard label="Revenue" value={`₹${stats.revenue.toLocaleString('en-IN')}`} sub="from confirmed bookings" icon={Wallet} tone="gold" />
        {listings.length > 0 ? (
          <button
            onClick={() => setSelectedListing(listings[0])}
            className="text-left w-full rounded-2xl p-4 md:p-5 text-white bg-gradient-to-br from-ink to-[#374a41] hover:shadow-lg transition-all duration-200 flex flex-col justify-between"
            data-testid="edit-listing-stat-card"
          >
            <div className="flex items-center gap-2 opacity-90">
              <Edit size={16} />
              <span className="text-[11px] uppercase tracking-widest font-bold">Edit your listing</span>
            </div>
            <div className="mt-3 font-display font-extrabold text-lg md:text-xl leading-tight flex items-center justify-between w-full">
              <span>Configure Stay</span>
              <ArrowRight size={18} className="opacity-90" />
            </div>
          </button>
        ) : (
          <StatCard label="Listings live" value={0} icon={Users} tone="ink" />
        )}
      </div>

      {/* Complete your profile */}
      {kycProfile && kycProfile.completion_percent < 100 && (() => {
        // Items the provider can still act on (never uploaded, or bounced back). A document
        // sitting in `in_review` is neither of these — it contributes nothing to
        // completion_percent yet, but there's nothing left for the provider to do either, so
        // it must never be counted as "remaining" (that reads as an actionable checklist item
        // when there's nothing to click).
        const actionableCount = kycProfile.checklist.filter(c => c.state === 'missing' || c.state === 'rejected').length;
        const hasActionable = actionableCount > 0;
        return (
          <div className="mt-8 mist-panel p-5 md:p-6" data-testid="kyc-progress-card">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="font-display font-extrabold text-lg text-ink">
                  {hasActionable ? t('kyc.completeYourProfile') : t('kyc.underReviewTitle')}
                </h2>
                <p className="text-xs text-ink-soft mt-1">
                  {hasActionable
                    ? t('kyc.remainingItems', { count: actionableCount })
                    : t('kyc.underReviewMessage')}
                </p>
                <div className="mt-3 max-w-md">
                  <ProfileCompletionBar percent={kycProfile.completion_percent} />
                </div>
              </div>
              <button
                onClick={() => setTab('profile')}
                data-testid="kyc-complete-profile-cta"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-flag text-white font-bold text-xs btn-hover whitespace-nowrap self-start md:self-auto"
              >
                {hasActionable ? t('kyc.completeProfileCta') : t('kyc.viewStatusCta')} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="mt-8 flex items-center gap-2 border-b border-[var(--line)]">
        {[
          { k: 'bookings', label: 'Bookings' },
          { k: 'listings', label: 'Listings' },
          { k: 'profile', label: 'Business profile' },
        ].map(({ k, label }) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
            className={`px-4 py-2.5 font-bold text-sm ${tab === k ? 'text-flag border-b-2 border-flag -mb-px' : 'text-ink-soft hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Bookings */}
      {tab === 'bookings' && (
        <div className="mt-6">
          {bookings.length === 0 ? (
            <div className="mist-panel p-8 md:p-10 text-center">
              <p className="text-ink-soft">No bookings yet. Share your listing links to get your first booking.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {bookings.map((b) => <BookingCard key={b.id} b={b} onCancel={handleCancelBooking} />)}
            </div>
          )}
        </div>
      )}

      {/* Listings */}
      {tab === 'listings' && (
        <div className="mt-6">
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setListingModal({ open: true, editing: null })}
              data-testid="add-listing-cta"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-flag text-white font-bold text-xs btn-hover"
            >
              <Plus size={14} /> Add listing
            </button>
          </div>
          {listings.length === 0 ? (
            <div className="mist-panel p-8 text-center text-ink-soft">You have no active listings.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {listings.map((l) => (
                <div key={l.id} className="bg-white rounded-2xl border border-[var(--line)] overflow-hidden">
                  <div className="aspect-[4/3] bg-mist overflow-hidden">
                    {l.image && <img src={l.image} alt={l.title} className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-4">
                    <div className="font-display font-bold text-ink line-clamp-1">{l.title}</div>
                    <div className="text-xs text-ink-soft mt-0.5 capitalize">{l.type} · {l.location}</div>
                    {l.price > 0 && <div className="mt-2 font-extrabold text-pine">₹{l.price}</div>}
                    <div className="mt-3 flex items-center gap-3">
                      <Link to={`/listing/${l.id}`} data-testid={`view-listing-${l.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-pine">
                        View <ExternalLink size={11} />
                      </Link>
                      <button onClick={() => setSelectedListing(l)} data-testid={`edit-listing-${l.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink">
                        <Pencil size={11} /> Edit
                      </button>
                      <button onClick={() => handleDeleteListing(l.id)} data-testid={`delete-listing-${l.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-flag hover:text-[#8a1e1e]">
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Profile */}
      {tab === 'profile' && (
        <div className="mt-6">
          <div className="mist-panel p-5 md:p-6 mb-6">
            <KycSection onProfileChange={setKycProfile} />
          </div>
          <div className="mist-panel p-5 md:p-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="text-xs uppercase tracking-widest text-ink-soft">Business</div>
                <div className="mt-1 font-display font-extrabold text-2xl text-ink">{provider.business_name}</div>
                <div className="text-sm text-ink-soft capitalize">{provider.business_type} · {provider.location}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-ink-soft">Contact</div>
                <div className="mt-1 font-display font-extrabold text-2xl text-ink">{provider.contact_phone}</div>
              </div>
            </div>
            <div className="mt-6">
              <div className="text-xs uppercase tracking-widest text-ink-soft">Description</div>
              <p className="mt-1 text-ink leading-relaxed">{provider.description}</p>
            </div>
          </div>
        </div>
      )}

      {selectedListing && (
        <EditListingModal
          listing={selectedListing}
          onClose={() => setSelectedListing(null)}
          onSave={loadDashboard}
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

