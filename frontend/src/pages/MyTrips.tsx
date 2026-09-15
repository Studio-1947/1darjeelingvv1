import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import { Ticket, Calendar, ArrowRight, XCircle, CircleNotch as Loader2, Compass, Phone, CheckCircle as CheckCircle2, Clock, MapPin, Storefront as Store, SignIn as LogIn } from '@phosphor-icons/react';
import { MobileScreen, FilterPill } from '@/components/mobile';

function StatusPill({ status, isPast }: { status: string; isPast: boolean }) {
  const { t } = useTranslation();
  
  if (status === 'confirmed' && isPast) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-pine/10 text-pine">
        <CheckCircle2 size={10} /> Completed
      </span>
    );
  }

  const map: Record<string, string> = {
    confirmed: 'bg-pine/10 text-pine',
    pending_payment: 'bg-gold/20 text-[#8a6b04]',
    cancelled: 'bg-flag/10 text-flag',
  };

  const label = t(`booking.status.${status}`, { defaultValue: status?.replace('_', ' ') });
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${map[status] || 'bg-mist text-ink-soft'}`}>
      {status === 'pending_payment' && <Clock size={10} />}
      {status === 'cancelled' && <XCircle size={10} />}
      {status === 'confirmed' && <CheckCircle2 size={10} />}
      {label}
    </span>
  );
}

export default function MyTrips() {
  const { t, i18n } = useTranslation();
  useSeo({ title: t('nav.my_trips'), noindex: true });
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabFilter, setTabFilter] = useState<'all' | 'upcoming' | 'completed' | 'cancelled'>('all');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Mobile-only: RN's trips.tsx has a binary Upcoming/Past split rather than
  // this page's existing 4-way all/upcoming/completed/cancelled filter.
  const [mobileTab, setMobileTab] = useState<'upcoming' | 'past'>('upcoming');

  const loadBookings = useCallback(() => {
    return api.get('/bookings/me')
      .then((r) => setBookings(r.data.items || []))
      .catch((err) => console.error('Failed to load trips:', err));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    loadBookings().finally(() => setLoading(false));
  }, [user, authLoading, loadBookings]);

  const cancelBooking = async (id: string) => {
    setBusyId(id);
    try {
      await api.patch(`/bookings/${id}/cancel`);
      await loadBookings();
      setConfirmingId(null);
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-ink-soft">
        <Loader2 size={24} className="animate-spin mx-auto mb-2 text-flag" />
        {t('common.loading')}
      </div>
    );
  }

  // Logged-out state
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-flag/10 text-flag grid place-items-center mx-auto mb-4">
          <Ticket size={28} />
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-ink">My Trips & Bookings</h1>
        <p className="text-ink-soft max-w-md mx-auto mt-2 text-sm">
          Log in to view your complete trip history, upcoming homestay reservations, driver bookings, and cultural experiences in Darjeeling.
        </p>
        <button
          onClick={() => nav('/login?next=/my-trips')}
          className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-flag text-white font-bold text-sm btn-hover shadow-md"
        >
          <LogIn size={16} /> Log In to View Trips
        </button>
      </div>
    );
  }

  const now = new Date(new Date().setHours(0, 0, 0, 0));
  
  const upcomingList = bookings.filter(
    (b) => b.status !== 'cancelled' && (b.check_in ? new Date(b.check_in) >= now : true)
  );

  const completedList = bookings.filter(
    (b) => b.status === 'confirmed' && b.check_in && new Date(b.check_in) < now
  );

  const cancelledList = bookings.filter((b) => b.status === 'cancelled');

  let filteredBookings = bookings;
  if (tabFilter === 'upcoming') filteredBookings = upcomingList;
  else if (tabFilter === 'completed') filteredBookings = completedList;
  else if (tabFilter === 'cancelled') filteredBookings = cancelledList;

  const pastList = [...completedList, ...cancelledList];
  const mobileList = mobileTab === 'upcoming' ? upcomingList : pastList;

  return (
    <>
    <div className="hidden lg:block mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-10 pb-24 lg:pb-12">
      {/* Banner for service providers */}
      {user.role === 'provider' && (
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-pine/10 to-pine/5 border border-pine/20 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Store size={18} className="text-pine flex-shrink-0" />
            <span className="text-xs font-semibold text-ink">
              Looking for your business listings & guest reservations?
            </span>
          </div>
          <Link
            to="/my-listings"
            className="inline-flex items-center gap-1 text-xs font-bold text-pine hover:underline"
          >
            Go to My Listings <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-flag flex items-center gap-1.5">
            <Ticket size={13} /> Personal History
          </div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl md:text-4xl text-ink mt-1">
            My Trips & Bookings
          </h1>
          <p className="text-xs sm:text-sm text-ink-soft mt-1">
            Your journey history, upcoming reservations, and completed stays through 1 Darjeeling.
          </p>
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-3 md:gap-4 mb-8">
        <div className="rounded-2xl p-4 bg-gradient-to-br from-flag to-[#8a1e1e] text-white shadow-sm">
          <div className="text-[11px] uppercase tracking-widest font-bold opacity-90">Total Bookings</div>
          <div className="mt-1 font-display font-extrabold text-2xl sm:text-3xl leading-none">
            {bookings.length}
          </div>
        </div>
        <div className="rounded-2xl p-4 bg-gradient-to-br from-pine to-pine-dark text-white shadow-sm">
          <div className="text-[11px] uppercase tracking-widest font-bold opacity-90">Upcoming</div>
          <div className="mt-1 font-display font-extrabold text-2xl sm:text-3xl leading-none">
            {upcomingList.length}
          </div>
        </div>
        <div className="rounded-2xl p-4 bg-gradient-to-br from-gold to-[#c69108] text-white shadow-sm">
          <div className="text-[11px] uppercase tracking-widest font-bold opacity-90">Completed</div>
          <div className="mt-1 font-display font-extrabold text-2xl sm:text-3xl leading-none">
            {completedList.length}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--line)] mb-6 overflow-x-auto no-scrollbar">
        {[
          { key: 'all', label: `All (${bookings.length})` },
          { key: 'upcoming', label: `Upcoming (${upcomingList.length})` },
          { key: 'completed', label: `Completed (${completedList.length})` },
          { key: 'cancelled', label: `Cancelled (${cancelledList.length})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTabFilter(key as any)}
            className={`px-4 py-2.5 font-bold text-xs sm:text-sm whitespace-nowrap transition-colors ${
              tabFilter === key
                ? 'text-flag border-b-2 border-flag -mb-px'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bookings List */}
      {filteredBookings.length === 0 ? (
        <div className="mist-panel p-8 md:p-12 text-center rounded-3xl">
          <div className="w-12 h-12 rounded-full bg-mist text-ink-soft grid place-items-center mx-auto mb-3">
            <Ticket size={24} />
          </div>
          <h3 className="font-display font-bold text-lg text-ink">No trips found</h3>
          <p className="text-xs sm:text-sm text-ink-soft max-w-sm mx-auto mt-1">
            {tabFilter === 'all'
              ? 'You haven’t booked any homestays, drivers, or experiences yet.'
              : `You have no ${tabFilter} trips at the moment.`}
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5 justify-center">
            <Link
              to="/homestays"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-flag text-white font-bold text-xs sm:text-sm btn-hover"
            >
              Browse Homestays <ArrowRight size={14} />
            </Link>
            <Link
              to="/drivers"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-pine text-white font-bold text-xs sm:text-sm btn-hover"
            >
              Find a Driver <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredBookings.map((b) => {
            const isPast = Boolean(b.check_in && new Date(b.check_in) < now);

            return (
              <article
                key={b.id}
                data-testid={`my-trip-card-${b.id}`}
                className="bg-white rounded-2xl border border-[var(--line)] p-4 md:p-5 flex flex-col sm:flex-row gap-4 hover:shadow-sm transition-shadow"
              >
                <div className="w-full sm:w-24 h-32 sm:h-24 rounded-xl overflow-hidden bg-mist flex-shrink-0 relative">
                  {b.listing?.image ? (
                    <img src={b.listing.image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-ink-soft">
                      <Compass size={24} />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display font-bold text-ink text-base line-clamp-1">
                          {b.listing?.title || b.listing_title}
                        </h3>
                        <div className="text-xs text-ink-soft capitalize flex items-center gap-1 mt-0.5">
                          <MapPin size={11} className="text-pine flex-shrink-0" />
                          <span>{b.listing_type}</span>
                          {b.listing?.location && <span>· {b.listing.location}</span>}
                        </div>
                      </div>
                      <StatusPill status={b.status} isPast={isPast} />
                    </div>

                    <div className="mt-3 text-xs text-ink-soft space-y-1 bg-mist/60 p-2.5 rounded-xl border border-[var(--line)]/50">
                      {b.check_in && (
                        <div>
                          {t('booking.checkin')}: <b className="text-ink">{b.check_in}</b>
                          {b.check_out && <> → <b className="text-ink">{b.check_out}</b></>}
                        </div>
                      )}
                      <div>
                        {t('booking.guests')}: <b className="text-ink">{b.guests}</b> · Booked:{' '}
                        {new Date(b.created_at).toLocaleDateString(i18n.language)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
                    <Link
                      to={`/listing/${b.listing_id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-pine hover:underline"
                    >
                      {t('dashboard.view_listing')} <ArrowRight size={12} />
                    </Link>

                    {b.status !== 'cancelled' && !isPast && (
                      confirmingId === b.id ? (
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span className="text-ink-soft">Cancel?</span>
                          <button
                            onClick={() => cancelBooking(b.id)}
                            disabled={busyId === b.id}
                            className="inline-flex items-center gap-1 font-bold text-flag disabled:opacity-50 hover:underline"
                          >
                            {busyId === b.id ? <Loader2 size={12} className="animate-spin" /> : null} Yes
                          </button>
                          <button
                            onClick={() => setConfirmingId(null)}
                            className="font-bold text-ink-soft hover:underline"
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmingId(b.id)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-flag hover:text-[#8a1e1e]"
                        >
                          <XCircle size={12} /> Cancel
                        </button>
                      )
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Quick suggestions */}
      <div className="mt-12">
        <h2 className="font-display font-extrabold text-xl text-ink mb-4 flex items-center gap-2">
          <Compass size={20} className="text-pine" /> Explore More in Darjeeling
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/homestays" className="rounded-2xl p-4 bg-white border border-[var(--line)] btn-hover shadow-sm">
            <div className="w-9 h-9 rounded-full bg-mist text-pine grid place-items-center mb-2">
              <Compass size={18} />
            </div>
            <div className="font-display font-bold text-sm text-ink">Homestays</div>
          </Link>
          <Link to="/drivers" className="rounded-2xl p-4 bg-white border border-[var(--line)] btn-hover shadow-sm">
            <div className="w-9 h-9 rounded-full bg-mist text-pine grid place-items-center mb-2">
              <Phone size={18} />
            </div>
            <div className="font-display font-bold text-sm text-ink">Drivers & Cabs</div>
          </Link>
          <Link to="/cafes" className="rounded-2xl p-4 bg-white border border-[var(--line)] btn-hover shadow-sm">
            <div className="w-9 h-9 rounded-full bg-mist text-pine grid place-items-center mb-2">
              <Store size={18} />
            </div>
            <div className="font-display font-bold text-sm text-ink">Cafes & Bakeries</div>
          </Link>
          <Link to="/events" className="rounded-2xl p-4 bg-white border border-[var(--line)] btn-hover shadow-sm">
            <div className="w-9 h-9 rounded-full bg-mist text-pine grid place-items-center mb-2">
              <Ticket size={18} />
            </div>
            <div className="font-display font-bold text-sm text-ink">Events & Culture</div>
          </Link>
        </div>
      </div>
    </div>

    {/* ============================================================= */}
    {/* MOBILE MY TRIPS (< lg) - matches RN's trips.tsx: Upcoming/Past   */}
    {/* tabs, status-styled cards mapped onto this backend's real       */}
    {/* statuses (confirmed/pending_payment/accepted/cancelled).        */}
    {/* ============================================================= */}
    <MobileScreen tone="light" className="block lg:hidden pb-[calc(var(--bottom-nav-h)+1rem)]">
      <div className="px-[var(--mu-gutter)] pt-6">
        <h1 className="font-[family-name:var(--mu-font-display)] font-black text-2xl text-[var(--mu-ink)] tracking-tight">
          {t('mobileTrips.title')}
        </h1>
        <div className="mt-3 flex gap-2">
          <FilterPill active={mobileTab === 'upcoming'} onClick={() => setMobileTab('upcoming')}>
            {t('mobileTrips.tab_upcoming')}
          </FilterPill>
          <FilterPill active={mobileTab === 'past'} onClick={() => setMobileTab('past')}>
            {t('mobileTrips.tab_past')}
          </FilterPill>
        </div>
      </div>

      <div className="mt-3.5 px-[var(--mu-gutter)] space-y-3">
        {mobileList.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--mu-text-muted)]">{t('mobileTrips.empty')}</p>
        ) : (
          mobileList.map((b) => {
            const isConfirmed = b.status === 'confirmed';
            const isCancelled = b.status === 'cancelled';
            return isConfirmed ? (
              <div key={b.id} className="rounded-[var(--mu-r-card)] px-[17px] py-[15px]" style={{ background: 'var(--mu-ink)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide" style={{ background: 'var(--mu-lime)', color: 'var(--mu-lime-ink)' }}>
                    {t('mobileTrips.status_confirmed')}
                  </span>
                </div>
                <div className="mt-2.5 font-[family-name:var(--mu-font-display)] font-bold text-base text-[var(--mu-cream)]">
                  {b.listing?.title || b.listing_title}
                </div>
                <div className="mt-0.5 text-xs text-[var(--mu-text-on-dark-muted)] capitalize">
                  {b.listing_type}
                </div>
                <div className="mt-3 flex gap-2.5">
                  <Link to={`/listing/${b.listing_id}`} className="flex-1 py-2 rounded-[var(--mu-r-chip)] border text-center" style={{ borderColor: 'var(--mu-on-dark-line)' }}>
                    <span className="text-xs font-semibold text-[var(--mu-cream)]">{t('mobileTrips.call_host')}</span>
                  </Link>
                  <Link to={`/listing/${b.listing_id}`} className="flex-1 py-2 rounded-[var(--mu-r-chip)] border text-center" style={{ borderColor: 'var(--mu-on-dark-line)' }}>
                    <span className="text-xs font-semibold text-[var(--mu-cream)]">{t('mobileTrips.directions')}</span>
                  </Link>
                </div>
                {mobileTab === 'upcoming' && (
                  confirmingId === b.id ? (
                    <div className="mt-2.5 flex items-center justify-center gap-3 text-xs">
                      <span className="text-[var(--mu-text-on-dark-muted)]">{t('mobileTrips.cancel_confirm')}</span>
                      <button onClick={() => cancelBooking(b.id)} disabled={busyId === b.id} className="font-bold text-[var(--mu-danger)]">
                        {t('common.yes')}
                      </button>
                      <button onClick={() => setConfirmingId(null)} className="font-bold text-[var(--mu-text-on-dark-muted)]">
                        {t('common.no')}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmingId(b.id)} className="mt-2.5 w-full text-center text-xs font-semibold text-[var(--mu-text-on-dark-muted)]">
                      {t('mobileTrips.cancel_booking')}
                    </button>
                  )
                )}
              </div>
            ) : (
              <div key={b.id} className="rounded-[var(--mu-r-card)] border border-[var(--mu-border)] bg-[var(--mu-surface)] px-[17px] py-[15px]">
                <span
                  className="inline-flex px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide"
                  style={{
                    background: isCancelled ? 'var(--mu-border)' : 'var(--mu-orange-soft)',
                    color: isCancelled ? 'var(--mu-text-muted)' : 'var(--mu-orange-ink)',
                  }}
                >
                  {isCancelled ? t('mobileTrips.status_cancelled') : t('mobileTrips.status_awaiting')}
                </span>
                <div className={`mt-2.5 font-[family-name:var(--mu-font-display)] font-bold text-[15px] ${isCancelled ? 'text-[var(--mu-text-muted)]' : 'text-[var(--mu-ink)]'}`}>
                  {b.listing?.title || b.listing_title}
                </div>
                <div className="mt-0.5 text-xs text-[var(--mu-text-faint)]">{b.listing_type}</div>
                {isCancelled && (
                  <div className="mt-2 text-[11.5px] text-[var(--mu-text-faint)]">{t('mobileTrips.cancelled_note')}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </MobileScreen>
    </>
  );
}
