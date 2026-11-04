import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { MapPin, CheckCircle as CheckCircle2, Clock, Wallet, CalendarCheck, Users, Phone, ArrowRight, ArrowSquareOut as ExternalLink, X, Upload, Plus, Trash as Trash2, Pencil, Star, Car, PaperPlaneTilt } from '@phosphor-icons/react';
import ListingFormModal from '@/components/ListingFormModal';
import ListingJourney from '@/components/provider/dashboard/ListingJourney';
import { Insight } from '@/components/provider/dashboard/Insight';
import BookingCard from '@/components/provider/dashboard/BookingCard';
import EditListingModal from '@/components/provider/dashboard/EditListingModal';
import KycSection from '@/components/provider/dashboard/KycSection';
import VerificationTracker from '@/components/provider/dashboard/VerificationTracker';
import HostPlanCard from '@/components/provider/dashboard/HostPlanCard';
import { DeliveryRequestsPanel, HostPageCard, HostReviewsCard } from '@/components/provider/dashboard/HostExtras';
import { isFinished, isOngoing, isUpcoming, sumGuests } from '@/lib/tripMessages';
import VerifiedBadge from '@/components/provider/VerifiedBadge';
import ProfileCompletionBar from '@/components/provider/ProfileCompletionBar';
import { getMyProfile } from '@/lib/kyc';
import type { KycProfile } from '@/lib/kyc';

import AvatarUploader from '@/components/provider/AvatarUploader';
import { uploadImage } from '@/lib/uploadImage';
import { useSeo } from '@/components/Seo';
import PointsRules, { hostPointsRows } from '@/components/PointsRules';

// The edit-listing tile names what the provider is actually configuring. Only
// a homestay has a "stay"; a driver's listing is a profile of themselves, their
// vehicle and routes, and a cafe/shop is the venue itself. Homestay is the
// unlisted default, so an unknown type falls back to it.
const CONFIGURE_LABEL_KEY: Record<string, string> = {
  driver: 'pd.configure_profile',
  guide: 'pd.configure_profile',
  cafe: 'pd.configure_cafe',
  shop: 'pd.configure_shop',
};

/** Provider home: booking stats, the bookings list, and business profile. */
export default function ProviderDashboard() {
  const { t } = useTranslation();
  useSeo({ title: t('provider.dashboard_title'), noindex: true });
  const { user, loading: authLoading, setMode, refresh } = useAuth();
  const nav = useNavigate();

  // The business side's home: arriving here (after onboarding, from the feed, from a link)
  // puts a host on the business side so the header and tabs match the page.
  useEffect(() => {
    if (user?.role === 'provider') setMode('provider');
  }, [user, setMode]);
  const [provider, setProvider] = useState(null);
  const [stats, setStats] = useState({ total: 0, confirmed: 0, pending: 0, accepted: 0, revenue: 0 });
  const [bookings, setBookings] = useState([]);
  const [listings, setListings] = useState([]);
  const [tab, setTab] = useState('bookings');
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [activeListingId, setActiveListingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [listingModal, setListingModal] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });
  const [kycProfile, setKycProfile] = useState<KycProfile | null>(null);
  const [hostStats, setHostStats] = useState<any>(null);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);

  const loadDashboard = React.useCallback(async () => {
    try {
      const [p, b, kyc, summary, feedbackResult] = await Promise.all([
        api.get('/providers/me'),
        api.get('/bookings/provider'),
        // The provider may not have an active profile yet (or the request may simply fail) -
        // that must never take down the rest of the dashboard, so it's caught independently
        // and just leaves the "Complete your profile" card and header badge unrendered.
        getMyProfile().catch(() => null),
        api.get('/providers/me/stats').catch(() => ({ data: null })),
        api.get('/host-feedback').catch(() => ({ data: { items: [] } })),
      ]);
      setProvider(p.data.provider);
      setStats(b.data.stats || {});
      setBookings(b.data.items || []);
      setListings(b.data.listings || []);
      setKycProfile(kyc);
      setHostStats(summary.data);
      setFeedback(feedbackResult.data.items || []);
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

  // A lightweight, independent refresh of just the KYC profile - used to catch up the header
  // badge and completion card when something changed outside this tab (an admin approving a
  // document elsewhere) without re-fetching bookings/listings. Must never break the rest of
  // the dashboard if it fails, so failures are swallowed silently.
  const refreshKycProfile = useCallback(async () => {
    try {
      const kyc = await getMyProfile();
      if (mountedRef.current) setKycProfile(kyc);
    } catch {
      // Best-effort only - the badge simply stays as it was.
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
    if (!window.confirm(t('pd.delete_confirm'))) return;
    await api.delete(`/listings/${listingId}`);
    await loadDashboard();
  };

  const handleCancelBooking = async (bookingId: string) => {
    await api.patch(`/bookings/${bookingId}/cancel`);
    await loadDashboard();
  };

  // Board: the host accepts a request; the guest then confirms it from My Trips.
  const handleAcceptBooking = async (bookingId: string) => {
    await api.patch(`/bookings/${bookingId}/confirm`);
    await loadDashboard();
  };

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const sendFeedback = async (event: React.FormEvent) => {
    event.preventDefault();
    if (feedbackMessage.trim().length < 10) return;
    setSendingFeedback(true);
    try {
      const { data } = await api.post('/host-feedback', { message: feedbackMessage });
      setFeedback((items) => [data.feedback, ...items]);
      setFeedbackMessage('');
    } finally { setSendingFeedback(false); }
  };

  if (authLoading || loading) return <div className="p-10 text-center text-ink-soft">{t('common.loading')}</div>;

  if (!provider) {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center">
        <h1 className="font-display font-extrabold text-3xl text-ink">{t('pd.no_business_title')}</h1>
        <p className="text-ink-soft mt-2">{t('pd.no_business_note')}</p>
        <button onClick={() => nav('/provider/onboard')} data-testid="onboard-cta"
          className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-pine text-white font-bold btn-hover">
          {t('provider.onboard_title')} <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  const active = provider.status === 'active';
  const type = provider.business_type;
  const isDriver = type === 'driver';
  const isGuide = type === 'guide';
  const accent = isGuide ? 'blue' : isDriver ? 'rose' : 'green';
  const accentClasses = isGuide
    ? 'from-sky-600 to-blue-800 text-blue-700 bg-blue-50 border-blue-100'
    : isDriver ? 'from-rose-500 to-pink-700 text-rose-700 bg-rose-50 border-rose-100'
      : 'from-emerald-600 to-green-800 text-emerald-700 bg-emerald-50 border-emerald-100';
  const activeListing = listings.find((listing: any) => listing.id === activeListingId) || null;
  const scopedBookings = activeListing ? bookings.filter((booking: any) => booking.listing_id === activeListing.id) : bookings;
  const scopedConfirmed = scopedBookings.filter((booking: any) => booking.status === 'confirmed');
  const scopedRevenue = scopedConfirmed.reduce((sum: number, booking: any) => sum + (booking.listing?.price || activeListing?.price || 0) * (booking.guests || 1), 0);
  // Board, per host type: finished, ongoing (happening today), upcoming, and the guests in each.
  const finishedList = scopedBookings.filter((b: any) => isFinished(b));
  const ongoingList = scopedBookings.filter((b: any) => isOngoing(b));
  const upcomingList = scopedBookings.filter((b: any) => isUpcoming(b));
  const completed = finishedList.length;
  // Host Aangan Points come from the server (lib/hostStats.ts).
  const points = hostStats?.points ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-10">
      {/* Header block */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-flag">{t('provider.dashboard_title')}</div>
          <h1 className="mt-1 font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">{provider.business_name}</h1>
          <p className="text-sm text-ink-soft mt-1">{t(`categories.${provider.business_type}`, { defaultValue: provider.business_type })} · {provider.location}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => {
              setMode('tourist');
              nav('/dashboard');
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-pine border border-pine/30 rounded-full px-3.5 py-1.5 hover:bg-pine/5 transition-colors"
          >
            {t('pd.switch_traveller')}
          </button>
          {/* Paid but not yet approved reads "Pending review", as in the app; listings are still private. */}
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-xs ${active && !provider.approval_pending ? 'bg-pine/10 text-pine' : 'bg-gold/20 text-[#8a6b04]'}`}
            data-testid="provider-status">
            {active && !provider.approval_pending ? <CheckCircle2 size={14} /> : <Clock size={14} />}{' '}
            {!active ? t('provider.pending') : provider.approval_pending ? t('provider.pending_review') : t('provider.active')}
          </span>
          {kycProfile?.kyc_status === 'verified' && <VerifiedBadge size="md" />}
        </div>
      </div>

      {/* Verification tracker first: for a host waiting on approval it is the one thing to act on.
          Plan paid, documents sent, team reviewing, live. Same as the app. */}
      {provider.approval_pending && kycProfile && (
        <div className="mb-6 [&>div]:mt-0">
          <VerificationTracker verification={kycProfile.verification} paid={active} phone={user?.phone}
            onOpen={() => setTab('profile')} />
        </div>
      )}

      <section className={`mb-6 rounded-3xl border p-5 md:p-7 ${accentClasses.split(' ').slice(3).join(' ')}`} data-testid={`dashboard-${accent}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className={`text-xs font-extrabold uppercase tracking-[0.16em] ${accentClasses.split(' ')[2]}`}>{isDriver ? 'Driver operations' : isGuide ? 'Guide activity' : 'Business overview'}</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold text-ink">{activeListing ? activeListing.title : isDriver ? 'Every ride, in one place.' : isGuide ? 'Your next guest experience.' : 'Your business, at a glance.'}</h2>
          </div>
          <div className={`rounded-2xl bg-gradient-to-br ${accentClasses.split(' ').slice(0, 2).join(' ')} px-4 py-3 text-white shadow-sm`}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/75">Aangan points</div>
            <div className="mt-1 flex items-center gap-1 text-2xl font-extrabold"><Star weight="fill" size={20} /> {points}</div>
            <PointsRules tone="dark" rows={hostPointsRows(hostStats?.points_rules, hostStats?.points_breakdown)} testId="host-points-rules" />
          </div>
        </div>
        {/* The board's dashboard sticky for each host type. */}
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3" data-testid="host-figures">
          <Insight icon={isDriver ? Car : CalendarCheck} label={isDriver ? 'Completed rides' : isGuide ? 'Covered trips' : 'Bookings'} value={completed} accent={accent} />
          {isGuide ? (
            <>
              <Insight icon={Users} label="Covered guests" value={sumGuests(finishedList)} accent={accent} />
              <Insight icon={Clock} label="Upcoming guests" value={sumGuests(upcomingList)} accent={accent} />
              <Insight icon={Clock} label="Ongoing guests" value={sumGuests(ongoingList)} accent={accent} />
            </>
          ) : (
            <>
              <Insight icon={Clock} label="Ongoing" value={ongoingList.length} accent={accent} />
              <Insight icon={Users} label={isDriver ? 'Passengers covered' : 'Guests served'} value={sumGuests(finishedList)} accent={accent} />
            </>
          )}
          {isDriver && (
            <>
              <Insight icon={MapPin} label="Km covered" value={activeListing ? '–' : (hostStats?.km_covered ?? 0).toLocaleString('en-IN')} accent={accent} />
              <Insight icon={MapPin} label="Locations covered" value={activeListing ? '–' : (hostStats?.locations_covered?.length ?? 0)} accent={accent} />
            </>
          )}
          <Insight icon={Wallet} label={isGuide ? 'Amount earned' : 'Booking value'} value={`₹${(activeListing ? scopedRevenue : stats.revenue || 0).toLocaleString('en-IN')}`} accent={accent} />
        </div>
        {isDriver && !activeListing && hostStats?.locations_covered?.length > 0 && (
          <p className="mt-3 text-xs text-ink-soft" data-testid="host-locations">Places covered: {hostStats.locations_covered.join(', ')}</p>
        )}
        {isDriver && !activeListing && hostStats?.unknown_route_trips > 0 && (
          <p className="mt-1 text-[11px] text-ink-soft">{hostStats.unknown_route_trips} finished {hostStats.unknown_route_trips === 1 ? 'trip did' : 'trips did'} not say the route, so {hostStats.unknown_route_trips === 1 ? 'it is' : 'they are'} not in the km.</p>
        )}
        {listings.length > 1 && <div className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="Choose a listing to manage"><button onClick={() => setActiveListingId(null)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${!activeListingId ? 'bg-ink text-white' : 'bg-white text-ink border border-[var(--line)]'}`}>All listings</button>{listings.map((listing: any) => <button key={listing.id} onClick={() => setActiveListingId(listing.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${activeListingId === listing.id ? 'bg-ink text-white' : 'bg-white text-ink border border-[var(--line)]'}`}>{listing.title} · {listing.type}</button>)}</div>}
      </section>

      {/* The membership card: the yearly host plan, with reviews. One card, not two. */}
      <HostPlanCard provider={provider} user={user} reviews={{ count: hostStats?.review_count || 0, average: hostStats?.average_rating || null }}
        onRenewed={async () => { await refresh(); await loadDashboard(); }} />

      <HostPageCard provider={provider} />
      <HostReviewsCard stats={hostStats} />
      <DeliveryRequestsPanel visible={['cafe', 'shop', 'homestay'].includes(provider.business_type)} />

      {/* The business profile (pages/ProviderProfile.tsx), with what is still needed for approval. */}
      <Link
        to="/provider/profile"
        data-testid="dashboard-profile-card"
        className={`block rounded-2xl border p-5 btn-hover ${provider?.profile_missing?.length ? 'border-[#F0B90B] bg-[#FFF8E1]' : 'border-[var(--line)] bg-white'}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <p className="font-display font-extrabold text-lg text-ink">
              {provider?.profile_missing?.length ? t('hostProfile.complete_title') : t('hostProfile.title')}
            </p>
            {provider?.profile_missing?.length ? (
              <ul className="mt-1 text-sm text-ink space-y-0.5">
                {provider.profile_missing.map((m: { key: string; label: string }) => <li key={m.key}>• {m.label}</li>)}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-ink-soft">{t('hostProfile.subtitle')}</p>
            )}
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-pine whitespace-nowrap">
            {t('hostProfile.complete_cta')} <ArrowRight size={16} />
          </span>
        </div>
      </Link>

      {/* Complete your profile (hosts who were live before approval was required) */}
      {!provider.approval_pending && kycProfile && kycProfile.completion_percent < 100 && (() => {
        // Items the provider can still act on (never uploaded, or bounced back). A document
        // sitting in `in_review` is neither of these - it contributes nothing to
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
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-pine text-white font-bold text-xs btn-hover whitespace-nowrap self-start md:self-auto"
              >
                {hasActionable ? t('kyc.completeProfileCta') : t('kyc.viewStatusCta')} <ArrowRight size={14} />
              </button>
            </div>
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="mt-8 flex items-center gap-1 sm:gap-2 border-b border-[var(--line)] overflow-x-auto no-scrollbar">
        {[
          { k: 'bookings', label: t('pd.tab_bookings') },
          { k: 'listings', label: t('pd.tab_listings') },
          { k: 'profile', label: t('pd.tab_profile') },
        ].map(({ k, label }) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
            className={`shrink-0 whitespace-nowrap px-3 sm:px-4 py-2.5 font-bold text-sm ${tab === k ? 'text-flag border-b-2 border-flag -mb-px' : 'text-ink-soft hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Bookings */}
      {tab === 'bookings' && (
        <div className="mt-6">
          {scopedBookings.length === 0 ? (
            <div className="mist-panel p-8 md:p-10 text-center">
              <p className="text-ink-soft">{t('pd.no_bookings')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {scopedBookings.map((b) => <BookingCard key={b.id} b={b} onCancel={handleCancelBooking} onAccept={handleAcceptBooking} host={{ name: provider.extras?.host_name || user?.name || provider.business_name, business: provider.business_name, phone: provider.contact_phone, location: provider.location }} />)}
            </div>
          )}
        </div>
      )}

      {/* Listings */}
      {tab === 'listings' && (
        <div className="mt-6">
          <div className="flex justify-end gap-2 mb-4">
            <Link
              to="/feed"
              data-testid="post-update-cta"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[var(--line)] text-ink font-bold text-xs btn-hover"
            >
              <Pencil size={14} /> {t('pd.post_update')}
            </Link>
            <button
              onClick={() => setListingModal({ open: true, editing: null })}
              data-testid="add-listing-cta"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-pine text-white font-bold text-xs btn-hover"
            >
              <Plus size={14} /> {t('pd.add_listing')}
            </button>
          </div>
          {listings.length < 3 && (
            <ListingJourney count={listings.length} onAdd={() => setListingModal({ open: true, editing: null })} />
          )}
          {listings.length === 0 ? null : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {listings.map((l) => (
                <div key={l.id} className="bg-white rounded-2xl border border-[var(--line)] overflow-hidden">
                  <div className="aspect-[4/3] bg-mist overflow-hidden">
                    {l.image && <img src={l.image} alt={l.title} className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-4">
                    <div className="font-display font-bold text-ink line-clamp-1">{l.title}</div>
                    <div className="text-xs text-ink-soft mt-0.5">{t(`categories.${l.type}`, { defaultValue: l.type })} · {l.location}</div>
                    {l.price > 0 && <div className="mt-2 font-extrabold text-pine">₹{l.price}</div>}
                    <div className="mt-3 flex items-center gap-3">
                      <Link to={`/listing/${l.id}`} data-testid={`view-listing-${l.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-pine">
                        {t('common.view')} <ExternalLink size={11} />
                      </Link>
                      <button onClick={() => setSelectedListing(l)} data-testid={`edit-listing-${l.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink">
                        <Pencil size={11} /> {t('common.edit')}
                      </button>
                      <button onClick={() => handleDeleteListing(l.id)} data-testid={`delete-listing-${l.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-flag hover:text-[#8a1e1e]">
                        <Trash2 size={11} /> {t('common.delete')}
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
                <div className="text-xs uppercase tracking-widest text-ink-soft">{t('pd.business')}</div>
                <div className="mt-1 font-display font-extrabold text-2xl text-ink">{provider.business_name}</div>
                <div className="text-sm text-ink-soft">{t(`categories.${provider.business_type}`, { defaultValue: provider.business_type })} · {provider.location}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-ink-soft">{t('pd.contact')}</div>
                <div className="mt-1 font-display font-extrabold text-2xl text-ink">{provider.contact_phone}</div>
              </div>
            </div>
            <div className="mt-6">
              <div className="text-xs uppercase tracking-widest text-ink-soft">{t('pd.description')}</div>
              <p className="mt-1 text-ink leading-relaxed">{provider.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* Feedback for the aangan team (board: host dashboard "Feedback"), closed until asked for. */}
      <div className="mt-10 border-t border-[var(--line)] pt-6" data-testid="host-feedback">
        {!feedbackOpen ? (
          <button type="button" onClick={() => setFeedbackOpen(true)} data-testid="host-feedback-open"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-pine">
            {t('pd.feedback_open')} <ArrowRight size={14} />
          </button>
        ) : (
          <form onSubmit={sendFeedback} className="max-w-xl">
            <h2 className="font-display text-lg font-extrabold text-ink">{t('pd.feedback_title')}</h2>
            <textarea value={feedbackMessage} onChange={(event) => setFeedbackMessage(event.target.value)} minLength={10} maxLength={2000} required
              placeholder={t('pd.feedback_ph')} className="mt-3 min-h-24 w-full rounded-xl border border-[var(--line)] bg-white p-3 text-sm outline-none focus:border-pine" />
            <div className="mt-2 flex items-center gap-3">
              <button disabled={sendingFeedback} className="inline-flex items-center gap-1.5 rounded-full bg-pine px-5 text-sm font-bold text-white btn-hover disabled:opacity-60">
                {sendingFeedback ? t('pd.feedback_sending') : t('pd.feedback_send')} <PaperPlaneTilt size={14} />
              </button>
              <button type="button" onClick={() => setFeedbackOpen(false)} className="text-sm font-bold text-ink-soft">{t('owners.cancel')}</button>
            </div>
            {feedback[0] && <p className="mt-3 text-xs text-ink-soft">{t('pd.feedback_latest', { status: feedback[0].status })}</p>}
          </form>
        )}
      </div>

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

