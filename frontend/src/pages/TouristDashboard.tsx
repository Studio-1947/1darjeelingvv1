import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { LogOut, Store, Compass, Phone, ArrowRight, Ticket, Calendar, Sparkles, XCircle, Loader2 } from 'lucide-react';

function StatusPill({ status }) {
  const { t } = useTranslation();
  const map = {
    confirmed: 'bg-pine/10 text-pine',
    pending_payment: 'bg-gold/20 text-[#8a6b04]',
    cancelled: 'bg-flag/10 text-flag',
  };
  // Unknown statuses fall back to the raw value rather than an empty pill.
  const label = t(`booking.status.${status}`, { defaultValue: status?.replace('_', ' ') });
  return <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${map[status] || 'bg-mist text-ink-soft'}`}>{label}</span>;
}

export default function TouristDashboard() {
  const { t, i18n } = useTranslation();
  const { user, loading: authLoading, logout } = useAuth();
  const nav = useNavigate();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null); // booking awaiting cancel confirmation
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const upcoming = bookings.filter((b) => b.status !== 'cancelled' && (b.check_in ? new Date(b.check_in) >= new Date(new Date().setHours(0, 0, 0, 0)) : true));
  const past = bookings.filter((b) => b.check_in && new Date(b.check_in) < new Date(new Date().setHours(0, 0, 0, 0)));

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-10">
      {/* Profile header */}
      <div className="flex items-center gap-4 md:gap-5 mb-8">
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-display font-extrabold text-3xl">
          {user.name?.trim().charAt(0).toUpperCase() || 'T'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-widest text-flag">{t('dashboard.traveller')}</div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl md:text-4xl text-ink leading-tight">{user.name || t('dashboard.traveller')}</h1>
          <p className="text-sm text-ink-soft mt-0.5 flex items-center gap-1"><Phone size={12} /> {user.phone}</p>
        </div>
        <button onClick={() => { logout(); nav('/'); }} data-testid="tourist-logout"
          className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--line)] text-ink font-semibold text-sm btn-hover">
          <LogOut size={14} /> {t('nav.logout')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 md:gap-4 mb-8">
        <div className="rounded-2xl p-4 bg-gradient-to-br from-flag to-[#8a1e1e] text-white">
          <div className="text-[11px] uppercase tracking-widest font-bold opacity-90">{t('dashboard.bookings')}</div>
          <div className="mt-1 font-display font-extrabold text-3xl leading-none">{bookings.length}</div>
        </div>
        <div className="rounded-2xl p-4 bg-gradient-to-br from-pine to-pine-dark text-white">
          <div className="text-[11px] uppercase tracking-widest font-bold opacity-90">{t('dashboard.upcoming')}</div>
          <div className="mt-1 font-display font-extrabold text-3xl leading-none">{upcoming.length}</div>
        </div>
        <div className="rounded-2xl p-4 bg-gradient-to-br from-gold to-[#c69108] text-white">
          <div className="text-[11px] uppercase tracking-widest font-bold opacity-90">{t('dashboard.trips_taken')}</div>
          <div className="mt-1 font-display font-extrabold text-3xl leading-none">{past.length}</div>
        </div>
      </div>

      {/* Bookings list */}
      <div>
        <h2 className="font-display font-extrabold text-xl md:text-2xl text-ink mb-4 flex items-center gap-2">
          <Calendar size={18} className="text-pine" /> {t('dashboard.my_bookings')}
        </h2>
        {bookings.length === 0 ? (
          <div className="mist-panel p-8 md:p-10 text-center">
            <p className="text-ink-soft">{t('dashboard.no_bookings')}</p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              <Link to="/homestays" data-testid="empty-book-stay" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-flag text-white font-bold text-sm btn-hover">
                {t('dashboard.book_homestay')} <ArrowRight size={14} />
              </Link>
              <Link to="/drivers" data-testid="empty-book-driver" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-pine text-white font-bold text-sm btn-hover">
                {t('dashboard.find_driver')} <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bookings.map((b) => (
              <article key={b.id} data-testid={`my-booking-${b.id}`}
                className="bg-white rounded-2xl border border-[var(--line)] p-4 md:p-5 flex gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-mist flex-shrink-0">
                  {b.listing?.image && <img src={b.listing.image} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-display font-bold text-ink line-clamp-1">{b.listing?.title || b.listing_title}</div>
                      <div className="text-xs text-ink-soft capitalize">{b.listing_type}{b.listing?.location ? ` · ${b.listing.location}` : ''}</div>
                    </div>
                    <StatusPill status={b.status} />
                  </div>
                  <div className="mt-2 text-xs text-ink-soft space-y-0.5">
                    {b.check_in && <div>{t('booking.checkin')}: <b className="text-ink">{b.check_in}</b>{b.check_out && <> → <b className="text-ink">{b.check_out}</b></>}</div>}
                    <div>{t('booking.guests')}: <b className="text-ink">{b.guests}</b> · {t('dashboard.booked_on')}: {new Date(b.created_at).toLocaleDateString(i18n.language)}</div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <Link to={`/listing/${b.listing_id}`} data-testid={`revisit-${b.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-pine">
                      {t('dashboard.view_listing')} <ArrowRight size={12} />
                    </Link>
                    {b.status !== 'cancelled' && (
                      confirmingId === b.id ? (
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span className="text-ink-soft">{t('dashboard.cancel_confirm')}</span>
                          <button onClick={() => cancelBooking(b.id)} disabled={busyId === b.id}
                            data-testid={`confirm-cancel-${b.id}`} className="inline-flex items-center gap-1 font-bold text-flag disabled:opacity-50">
                            {busyId === b.id ? <Loader2 size={12} className="animate-spin" /> : null} {t('common.yes')}
                          </button>
                          <button onClick={() => setConfirmingId(null)} className="font-bold text-ink-soft">{t('common.no')}</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmingId(b.id)} data-testid={`cancel-booking-${b.id}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-flag hover:text-[#8a1e1e]">
                          <XCircle size={12} /> {t('common.cancel')}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="mt-10">
        <h2 className="font-display font-extrabold text-xl md:text-2xl text-ink mb-4 flex items-center gap-2">
          <Sparkles size={18} className="text-flag" /> {t('dashboard.quick_actions')}
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
            <Link to="/provider/dashboard" className="rounded-2xl p-4 bg-gradient-to-br from-pine to-pine-dark text-white btn-hover">
              <div className="w-10 h-10 rounded-full bg-white/15 text-white grid place-items-center mb-2"><Store size={18} /></div>
              <div className="font-display font-bold">{t('nav.business_dashboard')}</div>
            </Link>
          ) : (
            <Link to="/provider/onboard" className="rounded-2xl p-4 bg-gradient-to-br from-pine to-pine-dark text-white btn-hover">
              <div className="w-10 h-10 rounded-full bg-white/15 text-white grid place-items-center mb-2"><Store size={18} /></div>
              <div className="font-display font-bold">{t('provider.onboard_title')}</div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
