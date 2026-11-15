import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { missingLabel } from '@/lib/serverText';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { MapPin, CheckCircle, Clock, Wallet, CalendarCheck, Users, Plus, Trash, Pencil, Star, Car, PaperPlaneTilt, Storefront, Briefcase, User } from '@phosphor-icons/react';
import ListingFormModal from '@/components/ListingFormModal';
import ListingJourney from '@/components/provider/dashboard/ListingJourney';
import { Insight } from '@/components/provider/dashboard/Insight';
import BookingCard from '@/components/provider/dashboard/BookingCard';
import EditListingModal from '@/components/provider/dashboard/EditListingModal';
import KycSection from '@/components/provider/dashboard/KycSection';
import VerificationTracker from '@/components/provider/dashboard/VerificationTracker';
import HostPlanCard from '@/components/provider/dashboard/HostPlanCard';
import InviteHostLink from '@/components/provider/InviteHostLink';
import { DeliveryRequestsPanel, HostPageCard, HostReviewsCard } from '@/components/provider/dashboard/HostExtras';
import { isFinished, isOngoing, isUpcoming, sumGuests } from '@/lib/tripMessages';
import VerifiedBadge from '@/components/provider/VerifiedBadge';
import ProfileCompletionBar from '@/components/provider/ProfileCompletionBar';
import { getMyProfile } from '@/lib/kyc';
import type { KycProfile } from '@/lib/kyc';
import { useSeo } from '@/components/Seo';
import PointsRules, { hostPointsRows } from '@/components/PointsRules';
import { Box, Button, ButtonLink, Chip, Chips, PageHead, Seg, Status, TextArea, cx } from '@/components/ag';

type Tab = 'bookings' | 'listings' | 'profile';

/**
 * The page tabs, drawn as the /7 segmented control. Plain buttons (not ARIA tabs) with
 * aria-pressed, so "Bookings" stays reachable as a button by name.
 */
function PageTabs({ value, onChange, options, label }: { value: Tab; onChange: (v: Tab) => void; options: Array<{ value: Tab; label: string }>; label: string }) {
  return (
    <div className="ag-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} data-testid={`tab-${o.value}`} onClick={() => onChange(o.value)}
          className={cx(value === o.value && '!bg-[var(--surface)] !text-[var(--r)] shadow-sm')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

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
  const [provider, setProvider] = useState<any>(null);
  const [stats, setStats] = useState<any>({ total: 0, confirmed: 0, pending: 0, accepted: 0, revenue: 0 });
  const [bookings, setBookings] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('bookings');
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
      // No business yet: the rest would only answer "not found" (and fill the console with 404s).
      const p = await api.get('/providers/me');
      if (!p.data?.provider) { setProvider(null); return; }
      const [b, kyc, summary, feedbackResult] = await Promise.all([
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
  // the Documents tab (the one place the KYC status is actually shown in detail).
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

  // Business / Tourist: the tourist side is the traveller's own account page.
  const toTraveller = () => {
    setMode('tourist');
    nav('/dashboard');
  };

  if (authLoading || loading) {
    return <div className="ag-wrap"><div className="ag-main"><p className="ag-small">{t('common.loading')}</p></div></div>;
  }

  if (!provider) {
    return (
      <div className="ag-wrap">
        <div className="ag-main">
          <PageHead eyebrow={t('provider.dashboard_title')} title={t('pd.no_business_title')} sub={t('pd.no_business_note')} />
          <Button variant="primary" go className="self-start" onClick={() => nav('/provider/onboard')} data-testid="onboard-cta">
            {t('provider.onboard_title')}
          </Button>
        </div>
      </div>
    );
  }

  const active = provider.status === 'active';
  const type = provider.business_type;
  const isDriver = type === 'driver';
  const isGuide = type === 'guide';
  const accent = isGuide ? 'blue' : isDriver ? 'rose' : 'green';
  const activeListing = listings.find((listing: any) => listing.id === activeListingId) || null;
  const scopedBookings = activeListing ? bookings.filter((booking: any) => booking.listing_id === activeListing.id) : bookings;
  const scopedConfirmed = scopedBookings.filter((booking: any) => booking.status === 'confirmed');
  // Per booking from the server (rate x guests x nights for a homestay), as stats.revenue counts it.
  const scopedRevenue = scopedConfirmed.reduce((sum: number, booking: any) => sum + (Number(booking.amount) || 0), 0);
  // Board, per host type: finished, ongoing (happening today), upcoming, and the guests in each.
  const finishedList = scopedBookings.filter((b: any) => isFinished(b));
  const ongoingList = scopedBookings.filter((b: any) => isOngoing(b));
  const upcomingList = scopedBookings.filter((b: any) => isUpcoming(b));
  const completed = finishedList.length;
  // Host Aangan Points come from the server (lib/hostStats.ts).
  const points = hostStats?.points ?? 0;
  const live = active && !provider.approval_pending;
  const missing: { key: string; label: string; min?: number; have?: number }[] = provider.profile_missing || [];

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        <PageHead eyebrow={t('provider.dashboard_title')} title={provider.business_name}
          sub={`${t(`categories.${type}`, { defaultValue: type })} · ${provider.location}`}>
          <div className="ag-row mt-2">
            {/* Paid but not yet approved reads "Pending review", as in the app; listings are still private. */}
            <Status tone={live ? 'ok' : 'pending'} data-testid="provider-status">
              {live ? <CheckCircle size={14} weight="fill" aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
              {!active ? t('provider.pending') : provider.approval_pending ? t('provider.pending_review') : t('provider.active')}
            </Status>
            {kycProfile?.kyc_status === 'verified' && <VerifiedBadge size="md" />}
          </div>
        </PageHead>

        <Seg label={t('pd.mode', 'Mode')} value="business" onChange={(v) => { if (v === 'tourist') toTraveller(); }}
          options={[
            { value: 'business', label: t('nav.mode_business'), icon: <Briefcase size={18} aria-hidden="true" /> },
            { value: 'tourist', label: t('pd.mode_tourist', 'Tourist'), icon: <User size={18} aria-hidden="true" /> },
          ]} />

        {/* Verification tracker first: for a host waiting on approval it is the one thing to act on.
            Plan paid, documents sent, team reviewing, live. Same as the app. */}
        {provider.approval_pending && kycProfile && (
          <VerificationTracker verification={kycProfile.verification} paid={active} freeStart={active && !!provider.grace} profileMissing={missing} businessType={type} onOpenProfile={() => nav('/provider/profile')} phone={user?.phone}
            onOpen={() => setTab('profile')} />
        )}

        {/* The board's dashboard figures for each host type. */}
        <Box as="section" data-testid={`dashboard-${accent}`}>
          <div>
            <span className="ag-eyebrow">{isDriver ? t('ui.providerDashboard.driver_operations') : isGuide ? t('ui.providerDashboard.guide_activity') : t('ui.providerDashboard.business_overview')}</span>
            <h2>{activeListing ? activeListing.title : isDriver ? t('ui.providerDashboard.driver_heading') : isGuide ? t('ui.providerDashboard.guide_heading') : t('ui.providerDashboard.business_heading')}</h2>
          </div>
          {listings.length > 1 && (
            <Chips scroll aria-label={t('ui.providerDashboard.choose_listing')}>
              <Chip on={!activeListingId} onClick={() => setActiveListingId(null)}>{t('ui.providerDashboard.all_listings')}</Chip>
              {listings.map((listing: any) => (
                <Chip key={listing.id} on={activeListingId === listing.id} onClick={() => setActiveListingId(listing.id)}>{listing.title}</Chip>
              ))}
            </Chips>
          )}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" data-testid="host-figures">
            <Insight icon={isDriver ? Car : CalendarCheck} label={isDriver ? t('ui.providerDashboard.completed_rides') : isGuide ? t('ui.providerDashboard.covered_trips') : t('ui.providerDashboard.completed_stays')} value={completed} />
            {isGuide ? (
              <>
                <Insight icon={Users} label={t('ui.providerDashboard.covered_guests')} value={sumGuests(finishedList)} />
                <Insight icon={Clock} label={t('ui.providerDashboard.upcoming_guests')} value={sumGuests(upcomingList)} />
                <Insight icon={Clock} label={t('ui.providerDashboard.ongoing_guests')} value={sumGuests(ongoingList)} />
              </>
            ) : (
              <>
                <Insight icon={Clock} label={t('ui.providerDashboard.ongoing')} value={ongoingList.length} />
                <Insight icon={Users} label={isDriver ? t('ui.providerDashboard.passengers_covered') : t('ui.providerDashboard.guests_served')} value={sumGuests(finishedList)} />
              </>
            )}
            {isDriver && (
              <>
                <Insight icon={MapPin} label={t('ui.providerDashboard.km_covered')} value={activeListing ? '–' : (hostStats?.km_covered ?? 0).toLocaleString('en-IN')} />
                <Insight icon={MapPin} label={t('ui.providerDashboard.locations_covered')} value={activeListing ? '–' : (hostStats?.locations_covered?.length ?? 0)} />
              </>
            )}
            <Insight icon={Wallet} label={isGuide ? t('ui.providerDashboard.confirmed_value') : t('ui.providerDashboard.confirmed_booking_value')} value={`₹${(activeListing ? scopedRevenue : stats.revenue || 0).toLocaleString('en-IN')}`} />
            <Insight icon={Star} label={t('ui.providerDashboard.aangan_points')} value={points} />
          </div>
          {isDriver && !activeListing && hostStats?.locations_covered?.length > 0 && (
            <p className="ag-small" data-testid="host-locations">{t('ui.providerDashboard.places_covered', { places: hostStats.locations_covered.join(', ') })}</p>
          )}
          {isDriver && !activeListing && hostStats?.unknown_route_trips > 0 && (
            <p className="ag-small">{t('ui.providerDashboard.unknown_route_trips', { count: hostStats.unknown_route_trips })}</p>
          )}
          <PointsRules rows={hostPointsRows(hostStats?.points_rules, hostStats?.points_breakdown)} testId="host-points-rules" />
        </Box>

        {/* The membership card: the yearly host plan, with reviews. One card, not two. */}
        <HostPlanCard provider={provider} user={user} reviews={{ count: hostStats?.review_count || 0, average: hostStats?.average_rating || null }}
          onRenewed={async () => { await refresh(); await loadDashboard(); }} />

        <HostPageCard provider={provider} />
        <HostReviewsCard stats={hostStats} />
        <DeliveryRequestsPanel visible={['cafe', 'shop', 'homestay'].includes(type)} />
        <InviteHostLink />

        {/* The business profile (pages/ProviderProfile.tsx), with what is still needed for approval. */}
        <Box as="section" tone={missing.length ? 'blush' : undefined} data-testid="dashboard-profile-card">
          <div>
            <h2>{missing.length ? t('hostProfile.complete_title') : t('hostProfile.title')}</h2>
            {missing.length ? (
              <ul className="mt-1 grid gap-0.5 text-sm text-[var(--ink-strong)]">
                {missing.map((m) => <li key={m.key}>• {missingLabel(t, m, type)}</li>)}
              </ul>
            ) : (
              <p className="ag-small">{t('hostProfile.subtitle')}</p>
            )}
          </div>
          <ButtonLink to="/provider/profile" go size="sm" className="self-start">{t('hostProfile.complete_cta')}</ButtonLink>
        </Box>

        {/* Complete your profile (hosts who were live before approval was required) */}
        {!provider.approval_pending && kycProfile && kycProfile.completion_percent < 100 && (() => {
          // Items the provider can still act on (never uploaded, or bounced back). A document
          // sitting in `in_review` is neither of these - it contributes nothing to
          // completion_percent yet, but there's nothing left for the provider to do either, so
          // it must never be counted as "remaining".
          const actionableCount = kycProfile.checklist.filter(c => c.state === 'missing' || c.state === 'rejected').length;
          const hasActionable = actionableCount > 0;
          return (
            <Box as="section" data-testid="kyc-progress-card">
              <div>
                <h2>{hasActionable ? t('kyc.completeYourProfile') : t('kyc.underReviewTitle')}</h2>
                <p className="ag-small">{hasActionable ? t('kyc.remainingItems', { count: actionableCount }) : t('kyc.underReviewMessage')}</p>
              </div>
              <ProfileCompletionBar percent={kycProfile.completion_percent} />
              <Button size="sm" go className="self-start" onClick={() => setTab('profile')} data-testid="kyc-complete-profile-cta">
                {hasActionable ? t('kyc.completeProfileCta') : t('kyc.viewStatusCta')}
              </Button>
            </Box>
          );
        })()}

        <PageTabs value={tab} onChange={setTab} label={t('provider.dashboard_title')}
          options={[
            { value: 'bookings', label: t('pd.tab_bookings') },
            { value: 'listings', label: t('pd.tab_listings') },
            { value: 'profile', label: t('pd.tab_profile') },
          ]} />

        {tab === 'bookings' && (
          scopedBookings.length === 0 ? (
            <Box><p className="ag-small">{t('pd.no_bookings')}</p></Box>
          ) : (
            <div className="grid gap-3">
              {scopedBookings.map((b) => <BookingCard key={b.id} b={b} onCancel={handleCancelBooking} onAccept={handleAcceptBooking} host={{ name: provider.extras?.host_name || user?.name || provider.business_name, business: provider.business_name, phone: provider.contact_phone, location: provider.location }} />)}
            </div>
          )
        )}

        {tab === 'listings' && (
          <>
            <div className="ag-row">
              <ButtonLink to="/feed" size="sm" icon={<Pencil />} data-testid="post-update-cta">{t('pd.post_update')}</ButtonLink>
              <Button size="sm" icon={<Plus />} onClick={() => setListingModal({ open: true, editing: null })} data-testid="add-listing-cta">{t('pd.add_listing')}</Button>
            </div>
            {listings.length < 3 && (
              <ListingJourney count={listings.length} onAdd={() => setListingModal({ open: true, editing: null })} />
            )}
            {listings.length > 0 && (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {listings.map((l) => (
                  <article key={l.id} className="ag-card">
                    {l.image ? <img src={l.image} alt="" className="img" /> : <div className="img !grid place-items-center text-[var(--r)]"><Storefront size={32} aria-hidden="true" /></div>}
                    <div className="body">
                      <span className="name line-clamp-1">{l.title}</span>
                      <span className="meta">{t(`categories.${l.type}`, { defaultValue: l.type })} · {l.location}</span>
                      {l.price > 0 && <span className="ag-price">₹{Number(l.price).toLocaleString('en-IN')}</span>}
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
          </>
        )}

        {tab === 'profile' && (
          <>
            <KycSection onProfileChange={setKycProfile} />
            <Box as="section">
              <div>
                <span className="ag-eyebrow">{t('pd.business')}</span>
                <h2>{provider.business_name}</h2>
                <p className="ag-small">{t(`categories.${type}`, { defaultValue: type })} · {provider.location}</p>
              </div>
              <div>
                <span className="ag-eyebrow">{t('pd.contact')}</span>
                <p className="text-[var(--ink-strong)]">{provider.contact_phone}</p>
              </div>
              <div>
                <span className="ag-eyebrow">{t('pd.description')}</span>
                <p className="text-[var(--ink7)]">{provider.description || '—'}</p>
              </div>
            </Box>
          </>
        )}

        {/* Feedback for the aangan team (board: host dashboard "Feedback"), closed until asked for. */}
        <div data-testid="host-feedback">
          {feedbackOpen ? (
            <form className="ag-box" onSubmit={sendFeedback}>
              <h2>{t('pd.feedback_title')}</h2>
              <TextArea value={feedbackMessage} onChange={(event) => setFeedbackMessage(event.target.value)} minLength={10} maxLength={2000} required
                placeholder={t('pd.feedback_ph')} aria-label={t('pd.feedback_title')} />
              <div className="ag-row">
                <Button type="submit" size="sm" disabled={sendingFeedback} icon={<PaperPlaneTilt />}>
                  {sendingFeedback ? t('pd.feedback_sending') : t('pd.feedback_send')}
                </Button>
                <Button variant="text" onClick={() => setFeedbackOpen(false)}>{t('owners.cancel')}</Button>
              </div>
              {feedback[0] && <p className="ag-small">{t('pd.feedback_latest', { status: feedback[0].status })}</p>}
            </form>
          ) : (
            <Button variant="text" onClick={() => setFeedbackOpen(true)} data-testid="host-feedback-open">{t('pd.feedback_open')}</Button>
          )}
        </div>
        <Button go className="self-start" onClick={toTraveller}>{t('pd.switch_traveller')}</Button>
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
