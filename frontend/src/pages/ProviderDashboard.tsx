import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { missingLabel } from '@/lib/serverText';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import BookingCard, { BAND_ICON } from '@/components/provider/dashboard/BookingCard';
import EditListingModal from '@/components/provider/dashboard/EditListingModal';
import KycSection from '@/components/provider/dashboard/KycSection';
import VerificationTracker from '@/components/provider/dashboard/VerificationTracker';
import { HostPassLine } from '@/components/provider/dashboard/HostPlanCard';
import ListingFormModal from '@/components/ListingFormModal';
import { DeliveryRequestsPanel, HostReviewsCard } from '@/components/provider/dashboard/HostExtras';
import { isFinished, isOngoing, isUpcoming, sumGuests, waShare } from '@/lib/tripMessages';
import VerifiedBadge from '@/components/provider/VerifiedBadge';
import { getMyProfile } from '@/lib/kyc';
import type { KycProfile } from '@/lib/kyc';
import { useSeo } from '@/components/Seo';
import PointsRules, { hostPointsRows } from '@/components/PointsRules';
import { Box, Button, ButtonA, ButtonLink, Chip, Chips, MenuIcon, PageHead, SecHead, SeeAll, Status, TextArea } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import { themeVars, useMode } from '@/lib/theme';
import { isFreeHostType } from '@/lib/prices';

type View = 'main' | 'bookings' | 'documents';

const TGSEEN = 'ag-host-tgseen';
const HELP_WA = '919093277919';

/**
 * The business dashboard, as the prototype's simple dashboard (dash.js): who and where, the status,
 * "Your listings" cards (photo, type, price, the yearly pass, Website / Edit / Bookings /
 * Verification and a Taking bookings switch), "Business overview" figures, the business-wide
 * Taking bookings switch, the next step, WhatsApp help, then share and Switch to Traveller.
 * Bookings and Documents open as their own screens with "Back to overview" (S.bz.full).
 */
function ProviderDashboardPage() {
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
  // The Bookings and Documents screens live in the URL (?s=bookings), so the Bookings tab, Back and reloads land on them.
  const [params, setParams] = useSearchParams();
  const sParam = params.get('s');
  const view: View = sParam === 'bookings' || sParam === 'documents' ? sParam : 'main';
  const setView = (v: View) => setParams(v === 'main' ? {} : { s: v });
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [activeListingId, setActiveListingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [kycProfile, setKycProfile] = useState<KycProfile | null>(null);
  const [hostStats, setHostStats] = useState<any>(null);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [tgPop, setTgPop] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const loadDashboard = React.useCallback(async () => {
    try {
      // No business yet: the rest would only answer "not found" (and fill the console with 404s).
      const p = await api.get('/providers/me');
      if (!p.data?.provider) { setProvider(null); return; }
      const [b, kyc, summary, feedbackResult] = await Promise.all([
        api.get('/bookings/provider'),
        // The provider may not have an active profile yet (or the request may simply fail) -
        // that must never take down the rest of the dashboard.
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
    if (!user) { nav('/login?next=/provider/dashboard'); return; }
    (async () => {
      try {
        await loadDashboard();
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading, nav, loadDashboard]);

  // Tracks whether the component is still mounted, so a KYC refresh that resolves after
  // unmount never calls setState.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // A lightweight refresh of just the KYC profile (an admin approving a document elsewhere).
  // Best effort: failures are swallowed.
  const refreshKycProfile = useCallback(async () => {
    try {
      const kyc = await getMyProfile();
      if (mountedRef.current) setKycProfile(kyc);
    } catch {
      // The badge simply stays as it was.
    }
  }, []);

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
    if (view === 'documents') refreshKycProfile();
  }, [view, refreshKycProfile]);

  // A detail screen opens at its top, as the prototype's toTop().
  const open = (v: View) => { setView(v); window.scrollTo({ top: 0 }); };

  const handleAddListing = async (values: any) => {
    await api.post('/listings', values);
    await loadDashboard();
  };

  // Declining a request or cancelling a booking carries the host's reason (prototype cancel.js).
  const handleCancelBooking = async (bookingId: string, reason: string, note: string) => {
    // as: 'host' so the server reads this as the host's decline even on a booking the host made
    // themselves (trying the app), where the account is also the guest.
    await api.patch(`/bookings/${bookingId}/cancel`, { reason, note, as: 'host' });
    await loadDashboard();
  };

  // The guest never came: the booking closes and does not count as a completed trip.
  const handleNoShow = async (bookingId: string) => {
    await api.post(`/bookings/${bookingId}/no-show`);
    await loadDashboard();
  };

  // A guest asked to cancel a confirmed booking: accept (it is cancelled) or keep it.
  const handleCancelRequest = async (bookingId: string, answer: 'accept' | 'keep') => {
    await api.post(`/bookings/${bookingId}/cancel-request/${answer}`);
    await loadDashboard();
  };

  // Board: the host accepts a request; the guest then confirms it from My Trips.
  const handleAcceptBooking = async (bookingId: string) => {
    await api.patch(`/bookings/${bookingId}/confirm`);
    await loadDashboard();
  };

  // "Taking bookings" for the whole business: the profile's `available`, which the server copies
  // onto every listing and checks on each new request.
  const setBusinessTaking = async (on: boolean) => {
    setSwitching('business');
    try {
      await api.patch('/providers/me', { profile: { available: on } });
      await loadDashboard();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || t('ui.providerProfile.could_not_save'));
    } finally { setSwitching(null); }
  };

  // The same switch for one listing (its own extras.available). The first time, explain it.
  const setListingTaking = async (l: any, on: boolean) => {
    try { if (!localStorage.getItem(TGSEEN)) { setTgPop(true); localStorage.setItem(TGSEEN, '1'); } } catch { /* ignore */ }
    setSwitching(l.id);
    try {
      await api.patch(`/listings/${l.id}`, { extras: { ...(l.extras || {}), available: on } });
      await loadDashboard();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || t('ui.providerProfile.could_not_save'));
    } finally { setSwitching(null); }
  };

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
  const type: string = provider.business_type;
  const typeLabel = (ty: string) => t(`ob.wz.t_${ty}`, { defaultValue: t(`categories.${ty}`, { defaultValue: ty }) });
  const isDriver = type === 'driver';
  const isGuide = type === 'guide';
  // Like the prototype, a listing is public as soon as it is put up; the documents earn the
  // Verified tick (provider.approval_pending now means "not verified yet").
  const live = active;
  const missing: { key: string; label: string; min?: number; have?: number }[] = provider.profile_missing || [];
  const taking = provider.extras?.available !== false;
  const pageUrl = provider.page_path ? `${window.location.origin}${provider.page_path}` : '';
  const hostInfo = { name: provider.extras?.host_name || user?.name || provider.business_name, business: provider.business_name, phone: provider.contact_phone, location: provider.location };

  // Overview, as the prototype counts it: new requests, upcoming, completed, earned.
  const nNew = bookings.filter((b) => b.status === 'pending_payment').length;
  const nUp = bookings.filter((b) => (b.status === 'accepted' || b.status === 'confirmed') && !b.completed).length;
  const doneList = bookings.filter((b) => b.completed && b.status !== 'cancelled');
  const earned = doneList.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const nAsk = bookings.filter((b) => b.awaiting_host).length;

  // Documents the team still needs (a missing or bounced document gets the "!" on the cards).
  const kycItems = kycProfile?.checklist.filter((c) => c.kind === 'kyc') || [];
  const docsDue = kycItems.some((c) => c.required && (c.state === 'missing' || c.state === 'rejected'));
  // Before the list loads (or before the plan is paid), count what this type is asked for: homestays and
  // drivers send 3 papers, guides, cafés and shops 2 (backend lib/kycRequirements).
  const docsLabel = t('host.docs_n', 'Verification: {{count}} things', {
    count: kycItems.filter((c) => c.required).length || (type === 'homestay' || type === 'driver' ? 3 : 2),
  });

  const backBtn = (
    <Button className="ag-host-back" icon={<Icon name="back" />} onClick={() => open('main')} data-testid="host-back">
      {t('host.back', 'Back to overview')}
    </Button>
  );

  // Feedback for the aangan team (board: host dashboard "Feedback"), closed until asked for.
  const feedbackBlock = (
    <div data-testid="host-feedback">
      {feedbackOpen ? (
        <form className="ag-box" onSubmit={sendFeedback}>
          <h2>{t('pd.feedback_title')}</h2>
          <TextArea value={feedbackMessage} onChange={(event) => setFeedbackMessage(event.target.value)} minLength={10} maxLength={2000} required
            placeholder={t('pd.feedback_ph')} aria-label={t('pd.feedback_title')} />
          <div className="ag-row">
            <Button type="submit" size="sm" disabled={sendingFeedback}>
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
  );

  const editModal = selectedListing && (
    <EditListingModal listing={selectedListing} onClose={() => setSelectedListing(null)} onSave={loadDashboard} />
  );

  /* ---------- Bookings screen ---------- */
  if (view === 'bookings') {
    const activeListing = listings.find((l) => l.id === activeListingId) || null;
    const scoped = activeListing ? bookings.filter((b) => b.listing_id === activeListing.id) : bookings;
    const finishedList = scoped.filter((b) => isFinished(b));
    const ongoingList = scoped.filter((b) => isOngoing(b));
    const upcomingList = scoped.filter((b) => isUpcoming(b));
    const scopedRevenue = scoped.filter((b) => b.status === 'confirmed').reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    const fig = (label: string, value: React.ReactNode) => <div className="ag-host-stat"><b>{value}</b><span>{label}</span></div>;
    return (
      <div className="ag-wrap">
        <div className="ag-main">
          {backBtn}
          <h1 className="ag-host-tabh">{t('host.bookings', 'Bookings')}</h1>
          <p className="ag-small">{t('host.bookings_s', 'Requests from travellers for your listings. Answer within 48 hours.')}</p>
          {listings.length > 1 && (
            <Chips scroll aria-label={t('ui.providerDashboard.choose_listing')}>
              <Chip on={!activeListingId} onClick={() => setActiveListingId(null)}>{t('ui.providerDashboard.all_listings')}</Chip>
              {/* Type first (icon + "Homestay · Rabi"), sorted by type then name, so two listings with the host's name tell apart. */}
              {[...listings]
                .sort((a, b) => typeLabel(a.type).localeCompare(typeLabel(b.type)) || (a.title || '').localeCompare(b.title || ''))
                .map((l) => (
                  <Chip key={l.id} on={activeListingId === l.id} onClick={() => setActiveListingId(l.id)} data-testid={`bookings-listing-${l.id}`}>
                    <Icon name={BAND_ICON[l.type] || 'home'} />{typeLabel(l.type)} · {l.title}
                  </Chip>
                ))}
            </Chips>
          )}
          {scoped.length === 0 ? (
            <Box className="ag-host-empty">
              <Icon name="t_trip" />
              <p className="ag-small">{t('host.no_bookings', 'No bookings yet. Travellers who find your page can ask to book.')}</p>
              {provider.page_path && <ButtonLink to={provider.page_path} go>{t('host.my_site', 'My website')}</ButtonLink>}
            </Box>
          ) : (
            scoped.map((b) => <BookingCard key={b.id} b={b} onCancel={handleCancelBooking} onAccept={handleAcceptBooking} onCancelRequest={handleCancelRequest} onNoShow={handleNoShow} host={hostInfo} />)
          )}

          {/* The board's per-type figures and points, for this listing or all of them. */}
          <section className="ag-host-sec">
            <SecHead title={isDriver ? t('ui.providerDashboard.driver_operations') : isGuide ? t('ui.providerDashboard.guide_activity') : t('ui.providerDashboard.business_overview')} />
            <div className="ag-host-figs">
              {fig(isDriver ? t('ui.providerDashboard.completed_rides') : isGuide ? t('ui.providerDashboard.covered_trips') : t('ui.providerDashboard.completed_stays'), finishedList.length)}
              {isGuide ? (
                <>
                  {fig(t('ui.providerDashboard.covered_guests'), sumGuests(finishedList))}
                  {fig(t('ui.providerDashboard.upcoming_guests'), sumGuests(upcomingList))}
                  {fig(t('ui.providerDashboard.ongoing_guests'), sumGuests(ongoingList))}
                </>
              ) : (
                <>
                  {fig(t('ui.providerDashboard.ongoing'), ongoingList.length)}
                  {fig(isDriver ? t('ui.providerDashboard.passengers_covered') : t('ui.providerDashboard.guests_served'), sumGuests(finishedList))}
                </>
              )}
              {isDriver && fig(t('ui.providerDashboard.km_covered'), activeListing ? '–' : (hostStats?.km_covered ?? 0).toLocaleString('en-IN'))}
              {isDriver && fig(t('ui.providerDashboard.locations_covered'), activeListing ? '–' : (hostStats?.locations_covered?.length ?? 0))}
              {fig(isGuide ? t('ui.providerDashboard.confirmed_value') : t('ui.providerDashboard.confirmed_booking_value'), `₹${(activeListing ? scopedRevenue : stats.revenue || 0).toLocaleString('en-IN')}`)}
            </div>
            {/* Points get the same highlighted card as the traveller dashboard, with the rules inside it. */}
            <div className="ag-account-pts mt-2" data-testid="host-points">
              <span className="ag-small">{t('ui.providerDashboard.aangan_points')}</span>
              <b><Icon name="star" /> {(hostStats?.points ?? 0).toLocaleString('en-IN')}</b>
              <PointsRules rows={hostPointsRows(hostStats?.points_rules, hostStats?.points_breakdown)} tone="dark" testId="host-points-rules" />
            </div>
            {isDriver && !activeListing && hostStats?.locations_covered?.length > 0 && (
              <p className="ag-small mt-2" data-testid="host-locations">{t('ui.providerDashboard.places_covered', { places: hostStats.locations_covered.join(', ') })}</p>
            )}
            {isDriver && !activeListing && hostStats?.unknown_route_trips > 0 && (
              <p className="ag-small mt-2">{t('ui.providerDashboard.unknown_route_trips', { count: hostStats.unknown_route_trips })}</p>
            )}
          </section>
          {feedbackBlock}
        </div>
      </div>
    );
  }

  /* ---------- Documents screen ---------- */
  if (view === 'documents') {
    return (
      <div className="ag-wrap">
        <div className="ag-main">
          {backBtn}
          <h1 className="ag-host-tabh">{docsLabel}</h1>
          <p className="ag-small" data-testid="docs-intro">{t('host.docs_s', 'A photo of your ID and a photo of your place. That is all we need to check you.')}</p>
          <KycSection onProfileChange={setKycProfile} />
          <Box as="section" className="ag-host-kv">
            <span className="ag-eyebrow">{t('pd.business')}</span>
            <h2>{provider.business_name}</h2>
            <p className="ag-small">{typeLabel(type)} · {provider.location}</p>
            <span className="ag-eyebrow">{t('pd.contact')}</span>
            <p>{provider.contact_phone}</p>
            <span className="ag-eyebrow">{t('pd.description')}</span>
            <p>{provider.description || '—'}</p>
          </Box>
          {feedbackBlock}
        </div>
      </div>
    );
  }

  /* ---------- Overview ---------- */
  const share = async () => {
    if (!pageUrl) return;
    const text = t('ui.hostExtras.share_message', { name: provider.business_name, url: pageUrl });
    try {
      if (navigator.share) { await navigator.share({ title: provider.business_name, text, url: pageUrl }); return; }
    } catch { return; }
    window.open(waShare(text), '_blank', 'noopener');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(pageUrl); toast.success(t('ui.hostExtras.link_copied')); } catch { /* ignore */ }
  };

  // The next step: live, the live host whose profile still has gaps, or the verification steps.
  let nextStep: React.ReactNode = null;
  if (provider.approval_pending && kycProfile) {
    nextStep = (
      <VerificationTracker verification={kycProfile.verification} paid={active} freeStart={active && (!!provider.grace || isFreeHostType(type))} profileMissing={missing} businessType={type}
        onOpenProfile={() => nav('/provider/profile')} phone={user?.phone} onOpen={() => open('documents')} />
    );
  } else if (missing.length) {
    nextStep = (
      <Box as="section" className="ag-host-next" data-testid="dashboard-profile-card">
        <span className="ag-eyebrow">{t('host.next', 'Next step')}</span>
        <b>{t('host.finish', 'Finish your profile')}</b>
        <ul className="ag-host-facts">
          {missing.map((m) => <li key={m.key}><Icon name="plus" />{missingLabel(t, m, type)}</li>)}
        </ul>
        <div className="ag-host-two"><ButtonLink to="/provider/profile" go>{t('host.finish', 'Finish your profile')}</ButtonLink></div>
      </Box>
    );
  } else if (kycProfile && kycProfile.completion_percent < 100) {
    // Hosts who were live before approval was required: what is left, or that it is with the team.
    const actionable = kycProfile.checklist.filter((c) => c.state === 'missing' || c.state === 'rejected').length;
    nextStep = (
      <Box as="section" className="ag-host-next" data-testid="kyc-progress-card">
        <span className="ag-eyebrow">{t('host.next', 'Next step')}</span>
        <b>{actionable ? t('kyc.completeYourProfile') : t('kyc.underReviewTitle')}</b>
        <p className="ag-small">{actionable ? t('kyc.remainingItems', { count: actionable }) : t('kyc.underReviewMessage')}</p>
        <span className="ag-host-bar"><i style={{ width: `${kycProfile.completion_percent}%` }} /></span>
        <div className="ag-host-two">
          <Button go onClick={() => open('documents')} data-testid="kyc-complete-profile-cta">{actionable ? t('kyc.completeProfileCta') : t('kyc.viewStatusCta')}</Button>
        </div>
      </Box>
    );
  } else if (live) {
    nextStep = <Box className="ag-host-next ok"><Icon name="check" /><span>{t('host.live_note', 'You are live. Travellers can find and book you.')}</span></Box>;
  }

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        <PageHead eyebrow={`${typeLabel(type)} · ${provider.location || ''}`} title={provider.business_name || provider.extras?.host_name} />
        <p className="ag-host-status flex flex-wrap items-center gap-2">
          {/* Paid but not yet approved reads "Pending review"; listings are still private. */}
          <Status tone={live ? 'ok' : 'pending'} data-testid="provider-status">
            {live ? t('host.live', 'Live on aangan') : !active ? t('provider.pending') : t('provider.pending_review')}
          </Status>
          {kycProfile?.kyc_status === 'verified' && <VerifiedBadge size="md" />}
        </p>

        <section className="ag-host-sec">
          <SecHead title={<>{t('host.your_listings', 'Your listings')} <span className="n">{listings.length}</span></>} action={<SeeAll to="/my-listings" data-testid="host-see-listings">{t('home.see_all', 'See all')}</SeeAll>} />
          <div className="ag-host-lgrid">
            {listings.map((l, i) => {
              const on = l.extras?.available !== false;
              return (
                <div key={l.id} className="ag-host-lcard" data-testid={`host-listing-${l.id}`}>
                  <button type="button" className="ag-host-lphoto" style={l.image ? { backgroundImage: `url(${l.image})` } : undefined}
                    aria-label={l.title} onClick={() => setSelectedListing(l)} data-testid={`edit-listing-${l.id}`}>
                    {!l.image && <Icon name={BAND_ICON[l.type] || 'home'} />}
                  </button>
                  <div className="ag-host-lbody">
                    <span className="ag-host-gtag"><Icon name={BAND_ICON[l.type] || 'home'} />{typeLabel(l.type)}</span>
                    <b>{l.title}</b>
                    <span className="ag-small">{l.location}{Number(l.price) > 0 ? ` · ${t('host.from', 'From')} ₹${Number(l.price).toLocaleString('en-IN')}` : ''}</span>
                    {i === 0 && <HostPassLine provider={provider} user={user} onRenewed={async () => { await refresh(); await loadDashboard(); }} />}
                    <div className="ag-host-lacts">
                      {provider.page_path && (
                        <ButtonLink to={provider.page_path} go icon={<Icon name="globe" />} data-testid={i === 0 ? 'host-page-open' : undefined}>{t('host.site', 'Website')}</ButtonLink>
                      )}
                      <ButtonLink to="/provider/profile" go icon={<Icon name="person" />}>{t('common.edit')}</ButtonLink>
                      {(type === 'cafe' || type === 'shop') && (
                        <ButtonLink to="/provider/profile#menu" go icon={<Icon name="cup" />} data-testid={i === 0 ? 'host-menu-open' : undefined}>
                          {t('host.menu_n', 'Menu · {{count}}', { count: (Array.isArray(provider.extras?.[type === 'cafe' ? 'menu' : 'goods']) ? provider.extras[type === 'cafe' ? 'menu' : 'goods'].length : 0) })}
                        </ButtonLink>
                      )}
                      <Button icon={<Icon name="t_trip" />} onClick={() => open('bookings')} data-testid={i === 0 ? 'tab-bookings' : undefined}>
                        {t('host.bookings', 'Bookings')}{nAsk > 0 && <span className="ag-host-badge">{nAsk}</span>}
                      </Button>
                      <Button icon={<Icon name="check" />} onClick={() => open('documents')} data-testid={i === 0 ? 'tab-profile' : undefined}>
                        {docsLabel}{docsDue && <span className="ag-host-badge warn">!</span>}
                      </Button>
                      <span className="ag-host-tgrow">
                      <label className="ag-host-ltoggle" title={t('host.tg_what', 'What does this toggle mean?')}>
                        <input type="checkbox" role="switch" checked={on} disabled={switching === l.id}
                          aria-label={`${t('host.taking', 'Taking bookings')}: ${l.title}`}
                          onChange={(e) => setListingTaking(l, e.target.checked)} data-testid={`listing-taking-${l.id}`} />
                      </label>
                      <button type="button" className="ag-host-tginfo" aria-label={t('host.tg_what', 'What does this toggle mean?')} onClick={() => setTgPop(true)}>
                        <Icon name="bell" />
                      </button>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {listings.length === 0 && (
              <div className="col-span-2"><HostPassLine provider={provider} user={user} onRenewed={async () => { await refresh(); await loadDashboard(); }} /></div>
            )}
            <button type="button" className="ag-host-add" onClick={() => nav('/provider/onboard?add=1')} data-testid="add-listing-cta">
              <Icon name="plus" /><span>{t('host.add_more', 'Add more listings')}</span>
            </button>
          </div>
        </section>

        <section className="ag-host-sec">
          <SecHead title={t('host.overview', 'Business overview')} />
          <div className="ag-host-stats" data-testid="host-figures">
            <button type="button" className={`ag-host-stat${nNew ? ' hot' : ''}`} onClick={() => open('bookings')}><b>{nNew}</b><span>{t('host.new', 'New requests')}</span></button>
            <button type="button" className="ag-host-stat" onClick={() => open('bookings')}><b>{nUp}</b><span>{t('host.upcoming', 'Upcoming')}</span></button>
            <button type="button" className="ag-host-stat" onClick={() => open('bookings')}><b>{doneList.length}</b><span>{t('host.completed', 'Completed')}</span></button>
            <button type="button" className="ag-host-stat" onClick={() => open('bookings')}><b>₹{earned.toLocaleString('en-IN')}</b><span>{t('host.earned', 'Earned')}</span></button>
          </div>
        </section>

        <label className="ag-box ag-host-switch ag-host-avail">
          <span>
            <b>{t('host.taking', 'Taking bookings')}</b>
            <span className="ag-small">{taking ? t('host.avail_on', 'Available. Travellers can ask to book.') : t('host.avail_off', 'Not available right now. Your listings show as paused.')}</span>
          </span>
          <input type="checkbox" role="switch" checked={taking} disabled={switching === 'business'}
            onChange={(e) => setBusinessTaking(e.target.checked)} data-testid="business-taking" />
        </label>

        {nextStep}

        {!live && (
          <Box className="ag-host-help" data-testid="host-help-whatsapp">
            <div className="row">
              <MenuIcon><Icon name="wa" /></MenuIcon>
              <div className="min-w-0 flex-1">
                <b>{t('host.help_h', 'Need help getting verified?')}</b><br />
                <span className="ag-small">{t('host.help_s', 'Message the aangan team on WhatsApp. We can collect your ID and photos on a call and finish the setup for you.')}</span>
              </div>
            </div>
            <ButtonA target="_blank" rel="noopener noreferrer" icon={<Icon name="wa" />}
              href={`https://wa.me/${HELP_WA}?text=${encodeURIComponent(`${t('host.help_msg', 'Hi aangan, I need help getting my business verified:')} ${provider.business_name} (${typeLabel(type)}, ${provider.location || ''})`)}`}>
              {t('host.help_btn', 'Ask for help on WhatsApp')}
            </ButtonA>
          </Box>
        )}

        <DeliveryRequestsPanel visible={['cafe', 'shop'].includes(type)} />
        <HostReviewsCard stats={hostStats} />

        <div className="ag-host-links">
          {pageUrl && (
            <div className="ag-host-share" data-testid="host-page-card">
              <span className="min-w-0">
                <span className="ag-small block">{t('host.share', 'Share link')}</span>
                {!live && <span className="ag-small block">{provider.plan_active ? t('ui.hostExtras.private_until_approved') : t('ui.hostExtras.private_until_active')}</span>}
              </span>
              <span className="acts">
                <button type="button" className="ag-host-rowic" onClick={copy} aria-label={t('ui.hostExtras.copy_link')} title={t('ui.hostExtras.copy_link')}>
                  <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 9h10v10H9zM5 15V5h10" /></svg>
                </button>
                <button type="button" className="ag-host-rowic" onClick={share} aria-label={t('host.share', 'Share link')} title={t('host.share', 'Share link')}>
                  <Icon name="share" />
                </button>
              </span>
            </div>
          )}
          <Button go onClick={toTraveller}>{t('pd.switch_traveller')}</Button>
        </div>
      </div>

      {tgPop && (
        <div className="ag-host-pop" role="dialog" aria-modal="true" aria-label={t('host.tg_what', 'What does this toggle mean?')} onClick={(e) => { if (e.target === e.currentTarget) setTgPop(false); }}>
          <div className="ag-host-popbox">
            <MenuIcon><Icon name="t_trip" /></MenuIcon>
            <h2>{t('host.taking', 'Taking bookings')}</h2>
            <p className="ag-small"><b className="on">{t('host.on', 'On')}</b> {t('host.tg_on', 'this listing shows to travellers and they can ask to book.')}</p>
            <p className="ag-small"><b className="off">{t('host.off', 'Off')}</b> {t('host.tg_off', 'it stays on your website, but travellers cannot book it (full, closed for the season, or on a break).')}</p>
            <Button variant="primary" onClick={() => setTgPop(false)}>{t('host.tg_ok', 'Got it')}</Button>
          </div>
        </div>
      )}

      {editModal}

      <ListingFormModal open={addOpen} onClose={() => setAddOpen(false)} onSubmit={handleAddListing} />
    </div>
  );
}

/**
 * The dashboard in the business's own colour (prototype palette.js "For my business": the host picks
 * it on Theme colour, it is saved as profile.theme). `display: contents` keeps the layout as it was;
 * the theme variables still reach every screen of the dashboard through it.
 */
export default function ProviderDashboard() {
  // Re-render when dark mode is switched, so the business colour follows it.
  const [colourMode] = useMode();
  const { provider } = useAuth() as any;
  return (
    <div style={{ display: 'contents', ...themeVars(provider?.theme, colourMode) }} data-testid="host-dashboard-theme">
      <ProviderDashboardPage />
    </div>
  );
}
