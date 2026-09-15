import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useFavorites } from '@/context/FavoritesContext';
import { isSupportActive } from '@/lib/support';
import { SignOut as LogOut, Storefront as Store, Compass, Phone, ArrowRight, Ticket, Calendar, XCircle, CircleNotch as Loader2 } from '@phosphor-icons/react';
import { useSeo } from '@/components/Seo';
import { MobileScreen, Monogram, Touch, PrimaryButton as MobilePrimaryButton, MobileSheet } from '@/components/mobile';

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
  useSeo({ title: t('nav.dashboard'), noindex: true });
  const { user, loading: authLoading, logout } = useAuth();
  const nav = useNavigate();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null); // booking awaiting cancel confirmation
  const [busyId, setBusyId] = useState<string | null>(null);
  const { ids: savedIds } = useFavorites();
  // Mobile-only: RN's profile.tsx has a real delete-account action this app
  // never exposed a UI for (DELETE /users/me already works server-side).
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadBookings = useCallback(() => api.get('/bookings/me').then((r) => setBookings(r.data.items || [])), []);

  const deleteAccount = async () => {
    setDeleteBusy(true);
    try {
      await api.delete('/users/me');
      logout();
      nav('/');
    } finally {
      setDeleteBusy(false);
    }
  };

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
    <>
    <div className="hidden lg:block mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-10">
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

    {/* ============================================================= */}
    {/* MOBILE PROFILE (< lg) - matches RN's profile.tsx: identity,     */}
    {/* Pass card, stats, rows, provider prompt, sign out + a new       */}
    {/* delete-account action (DELETE /users/me already worked, had no  */}
    {/* UI anywhere until now). Language row is dropped - English-only. */}
    {/* ============================================================= */}
    <MobileScreen tone="light" className="block lg:hidden pb-[calc(var(--bottom-nav-h)+1rem)]">
      <div className="px-[var(--mu-gutter)] pt-6">
        <div className="flex items-center gap-3.5">
          <Monogram label={user.name || '?'} className="w-[62px] h-[62px] text-2xl flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-[family-name:var(--mu-font-display)] font-black text-xl text-[var(--mu-ink)] truncate">
              {user.name || t('dashboard.traveller')}
            </div>
            <div className="text-xs text-[var(--mu-text-muted)]">{user.phone}</div>
          </div>
        </div>

        <Link to="/support" className="block mt-3.5">
          <div className="rounded-[var(--mu-r-card)] px-[17px] py-3.5" style={{ background: 'var(--mu-ink)' }}>
            <span className="font-[family-name:var(--mu-font-mono)] text-[10px] font-semibold uppercase tracking-wide text-[var(--mu-sage)]">
              {isSupportActive(user) ? t('mobileProfile.pass_active') : t('mobileProfile.pass_inactive')}
            </span>
            {isSupportActive(user) ? (
              <div className="mt-1 font-[family-name:var(--mu-font-display)] font-black text-base text-[var(--mu-lime)]">
                {t('mobileProfile.member_till')} {new Date(user.supportExpiresAt).toLocaleDateString()}
              </div>
            ) : (
              <div className="mt-1 font-[family-name:var(--mu-font-display)] font-black text-base text-[var(--mu-lime)]">
                {t('mobileProfile.pass_get_it')}
              </div>
            )}
          </div>
        </Link>

        <div className="mt-2.5 flex gap-2.5">
          <Link to="/my-trips" className="flex-1">
            <div className="rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] py-2.5 text-center">
              <div className="font-[family-name:var(--mu-font-display)] font-black text-[17px] text-[var(--mu-green)]">{bookings.length}</div>
              <div className="text-[10.5px] text-[var(--mu-text-muted)]">{t('mobileProfile.stat_trips')}</div>
            </div>
          </Link>
          <Link to="/saved" className="flex-1">
            <div className="rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] py-2.5 text-center">
              <div className="font-[family-name:var(--mu-font-display)] font-black text-[17px] text-[var(--mu-green)]">{savedIds.size}</div>
              <div className="text-[10.5px] text-[var(--mu-text-muted)]">{t('mobileProfile.row_saved')}</div>
            </div>
          </Link>
        </div>

        <div className="mt-2.5 rounded-[var(--mu-r-card)] border border-[var(--mu-border)] bg-[var(--mu-surface)] overflow-hidden">
          <Link to="/refer" className="flex items-center px-4 py-3 border-b border-[var(--mu-border)]">
            <span className="flex-1 text-sm font-semibold text-[var(--mu-ink)]">{t('mobileProfile.row_refer')}</span>
            <span className="text-xs font-bold" style={{ color: 'var(--mu-orange)' }}>›</span>
          </Link>
          <Link to="/saved" className="flex items-center px-4 py-3 border-b border-[var(--mu-border)]">
            <span className="flex-1 text-sm font-semibold text-[var(--mu-ink)]">{t('mobileProfile.row_saved')}</span>
            <span className="text-xs text-[var(--mu-text-faint)]">{savedIds.size} ›</span>
          </Link>
          <Link to="/terms" className="flex items-center px-4 py-3">
            <span className="flex-1 text-sm font-semibold text-[var(--mu-ink)]">{t('mobileProfile.row_legal')}</span>
            <span className="text-xs text-[var(--mu-text-faint)]">›</span>
          </Link>
        </div>

        <Link
          to={user.role === 'provider' ? '/provider/dashboard' : '/provider/onboard'}
          className="block mt-2.5 rounded-[var(--mu-r-card-sm)] px-4 py-3"
          style={{ background: 'var(--mu-green-tint)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">🏔</span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold" style={{ color: 'var(--mu-green)' }}>
                {user.role === 'provider' ? t('mobileProfile.switch_to_provider') : t('mobileProfile.provider_prompt_title')}
              </div>
              <div className="text-[11.5px] text-[var(--mu-text-body)]">{t('mobileProfile.provider_prompt_body')}</div>
            </div>
            <span className="font-black text-[15px]" style={{ color: 'var(--mu-green)' }}>→</span>
          </div>
        </Link>

        <div className="mt-6 pb-2 space-y-3.5">
          <Touch onClick={() => { logout(); nav('/'); }} className="w-full text-center text-sm font-bold" style={{ color: 'var(--mu-green)' }}>
            {t('mobileProfile.sign_out')}
          </Touch>
          <Touch onClick={() => setDeleteOpen(true)} className="w-full text-center text-xs text-[var(--mu-text-faint)]">
            {t('mobileProfile.delete_account')}
          </Touch>
        </div>
      </div>

      <MobileSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('mobileProfile.delete_account_title')}>
        <p className="text-sm text-[var(--mu-text-body)]">{t('mobileProfile.delete_account_body')}</p>
        <div className="mt-5 space-y-2.5">
          <MobilePrimaryButton onClick={deleteAccount} disabled={deleteBusy} className="w-full !bg-[var(--mu-danger)]">
            {deleteBusy ? t('mobileProfile.deleting_account') : t('mobileProfile.delete_account_confirm')}
          </MobilePrimaryButton>
          <Touch onClick={() => setDeleteOpen(false)} disabled={deleteBusy} className="w-full text-center text-sm font-semibold text-[var(--mu-text-muted)]">
            {t('mobileProfile.cancel')}
          </Touch>
        </div>
      </MobileSheet>
    </MobileScreen>
    </>
  );
}
