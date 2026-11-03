import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { SignOut as LogOut, Storefront as Store, Compass, Phone, ArrowRight, Ticket, Calendar, XCircle, CircleNotch as Loader2 } from '@phosphor-icons/react';
import { useSeo } from '@/components/Seo';
import BlockedPeople from '@/components/BlockedPeople';
import TripStats, { tripBuckets, type TripFilter } from '@/components/TripStats';
import TripCard from '@/components/TripCard';


export default function TouristDashboard() {
  const { t, i18n } = useTranslation();
  useSeo({ title: t('nav.dashboard'), noindex: true });
  const { user, loading: authLoading, logout, setMode } = useAuth();
  const nav = useNavigate();

  // This is the traveller side's home, so being here means travelling. A host who books a stay
  // or opens this page sees the traveller header and tabs with it.
  // Opening this page no longer flips a host to the traveller side: Business and Traveller are
  // kept apart, and the explicit switches (header menu, dashboard button) do the switching.
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null); // booking awaiting cancel confirmation
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TripFilter>('all');
  const [avatarError, setAvatarError] = useState(false);

  const loadBookings = useCallback(() => api.get('/bookings/me').then((r) => setBookings(r.data.items || [])), []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav('/login?next=/dashboard'); return; }
    loadBookings().finally(() => setLoading(false));
  }, [user, authLoading, nav, loadBookings]);

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

  if (authLoading || loading || !user) return <div className="p-10 text-center text-ink-soft">{t('common.loading')}</div>;

  const shown = tripBuckets(bookings)[filter];

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-10">
      {/* Profile header: photo, name, phone, then the Traveller tag and the switch to the business side. */}
      <div className="flex items-center gap-4 md:gap-5 mb-6">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-display font-extrabold text-3xl flex-shrink-0">
          {user.avatar && !avatarError ? (
            <img src={user.avatar} alt={user.name || ''} onError={() => setAvatarError(true)} data-testid="account-avatar" className="w-full h-full object-cover" />
          ) : (user.name?.trim().charAt(0).toUpperCase() || 'T')}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl md:text-4xl text-ink leading-tight">{user.name || t('dashboard.traveller')}</h1>
          <p className="text-sm text-ink-soft mt-0.5 flex items-center gap-1 whitespace-nowrap"><Phone size={12} /> {user.phone}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span data-testid="account-mode" className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#DDF0F1] text-[#0E4A4F] text-[11px] font-bold uppercase tracking-wider">
              {t('dashboard.traveller')}
            </span>
            {user.role === 'provider' ? (
              <button type="button" onClick={() => { setMode('provider'); nav('/provider/dashboard'); }}
                data-testid="account-switch-business"
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-[#1F6656] text-[#1F6656] text-xs font-bold btn-hover">
                <Store size={13} /> {t('nav.switch_business')} <ArrowRight size={12} />
              </button>
            ) : (
              <Link to="/provider/onboard" data-testid="account-switch-business"
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-[#1F6656] text-[#1F6656] text-xs font-bold btn-hover">
                <Store size={13} /> {t('nav.switch_business')} <ArrowRight size={12} />
              </Link>
            )}
          </div>
        </div>
        <button onClick={() => { logout(); nav('/'); }} data-testid="tourist-logout"
          className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--line)] text-ink font-semibold text-sm btn-hover">
          <LogOut size={14} /> {t('nav.logout')}
        </button>
      </div>

      <div className="mb-8">
        <TripStats bookings={bookings} filter={filter} onFilter={setFilter} />
      </div>

      {/* Bookings list */}
      <div>
        <h2 className="font-display font-extrabold text-xl md:text-2xl text-ink mb-4 flex items-center gap-2">
          <Calendar size={18} className="text-pine" /> {t('dashboard.my_bookings')}
        </h2>
        {shown.length === 0 && bookings.length > 0 ? (
          <div className="mist-panel p-6 text-center text-sm text-ink-soft" data-testid="trip-filter-empty">{t('trips.none_in_filter')}</div>
        ) : bookings.length === 0 ? (
          <div className="mist-panel p-8 md:p-10 text-center">
            <p className="text-ink-soft">{t('dashboard.no_bookings')}</p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              <Link to="/homestays" data-testid="empty-book-stay" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-pine text-white font-bold text-sm btn-hover">
                {t('dashboard.book_homestay')} <ArrowRight size={14} />
              </Link>
              <Link to="/drivers" data-testid="empty-book-driver" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-pine text-white font-bold text-sm btn-hover">
                {t('dashboard.find_driver')} <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shown.map((b) => (
              <TripCard key={b.id} booking={b} testId={`my-booking-${b.id}`}
                confirming={confirmingId === b.id} busy={busyId === b.id}
                onAskCancel={() => setConfirmingId(b.id)} onCancel={() => cancelBooking(b.id)} onKeep={() => setConfirmingId(null)} />
            ))}
          </div>
        )}
      </div>

      {/* Notifications / Activity feed — mirrors mobile activity tab */}
      {(() => {
        const needsAction = bookings.filter((b) => b.status === 'pending_payment');
        const recentConfirmed = bookings.filter((b) => b.status === 'confirmed').slice(0, 3);
        const hasActivity = needsAction.length > 0 || recentConfirmed.length > 0;
        if (!hasActivity) return null;
        return (
          <div className="mt-10">
            <h2 className="font-display font-extrabold text-xl md:text-2xl text-ink mb-4 flex items-center gap-2">
              <Ticket size={18} className="text-flag" /> Activity
            </h2>
            <div className="space-y-3">
              {needsAction.map((b) => (
                <div key={b.id} data-testid={`activity-pending-${b.id}`}
                  className="flex items-center gap-3 p-4 rounded-2xl bg-gold/10 border border-gold/30">
                  <div className="w-9 h-9 rounded-full bg-gold/20 text-[#8a6b04] grid place-items-center flex-shrink-0">
                    <Calendar size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-ink line-clamp-1">
                      Booking awaiting confirmation
                    </div>
                    <div className="text-xs text-ink-soft mt-0.5 line-clamp-1">
                      {b.listing?.title || b.listing_title} — waiting for host
                    </div>
                  </div>
                  <Link to="/my-trips"
                    className="text-xs font-bold text-pine hover:underline flex-shrink-0 flex items-center gap-1">
                    View <ArrowRight size={11} />
                  </Link>
                </div>
              ))}
              {recentConfirmed.map((b) => (
                <div key={b.id} data-testid={`activity-confirmed-${b.id}`}
                  className="flex items-center gap-3 p-4 rounded-2xl bg-pine/5 border border-pine/20">
                  <div className="w-9 h-9 rounded-full bg-pine/10 text-pine grid place-items-center flex-shrink-0">
                    <Ticket size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-ink line-clamp-1">
                      Booking confirmed ✓
                    </div>
                    <div className="text-xs text-ink-soft mt-0.5 line-clamp-1">
                      {b.listing?.title || b.listing_title}
                      {b.check_in ? ` · Check-in ${b.check_in}` : ''}
                    </div>
                  </div>
                  <Link to="/my-trips"
                    className="text-xs font-bold text-pine hover:underline flex-shrink-0 flex items-center gap-1">
                    View <ArrowRight size={11} />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      
      <div className="mt-10">
        <h2 className="font-display font-extrabold text-xl md:text-2xl text-ink mb-4 flex items-center gap-2">
          <Compass size={20} className="text-pine" /> {t('dashboard.quick_actions')}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/homestays" className="rounded-2xl p-4 bg-white border border-[var(--line)] btn-hover">
            <div className="w-10 h-10 rounded-full bg-mist text-pine grid place-items-center mb-2"><Compass size={18} /></div>
            <div className="font-display font-bold text-ink">{t('dashboard.browse_stays')}</div>
          </Link>
          <Link to="/drivers" className="rounded-2xl p-4 bg-white border border-[var(--line)] btn-hover">
            <div className="w-10 h-10 rounded-full bg-mist text-pine grid place-items-center mb-2"><Phone size={18} /></div>
            <div className="font-display font-bold text-ink">{t('dashboard.find_driver')}</div>
          </Link>
          <Link to="/events" className="rounded-2xl p-4 bg-white border border-[var(--line)] btn-hover">
            <div className="w-10 h-10 rounded-full bg-mist text-pine grid place-items-center mb-2"><Ticket size={18} /></div>
            <div className="font-display font-bold text-ink">{t('dashboard.cultural_events')}</div>
          </Link>
          {user.role === 'provider' ? (
            // The traveller side shows no business pages, as in the app. A host still gets
            // one way across, the same switch the profile menu has.
            <button type="button" onClick={() => { setMode('provider'); nav('/provider/dashboard'); }}
              data-testid="dashboard-switch-business"
              className="text-left rounded-2xl p-4 bg-white border border-[var(--line)] btn-hover">
              <div className="w-10 h-10 rounded-full bg-mist text-pine grid place-items-center mb-2"><Store size={18} /></div>
              <div className="font-display font-bold text-ink">{t('nav.switch_business')}</div>
            </button>
          ) : (
            <Link to="/provider/onboard" className="rounded-2xl p-4 bg-gradient-to-br from-pine to-pine-dark text-white btn-hover">
              <div className="w-10 h-10 rounded-full bg-white/15 text-white grid place-items-center mb-2"><Store size={18} /></div>
              <div className="font-display font-bold">{t('provider.onboard_title')}</div>
            </Link>
          )}
        </div>
      </div>

      <BlockedPeople />
    </div>
  );
}
