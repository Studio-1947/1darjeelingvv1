import React, { useState } from 'react';
import { RateTripButton, ShareStoryButton } from '@/components/AfterTrip';
import api from '@/lib/api';
import { formatTripDates } from '@/lib/dates';
import BookingFeeModal from '@/components/listing-detail/BookingFeeModal';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, XCircle, CircleNotch as Loader2, Compass, MapPin, CheckCircle, Clock, CalendarBlank, Users, Receipt } from '@phosphor-icons/react';

function StatusPill({ status, isPast, awaitingHost }: { status: string; isPast: boolean; awaitingHost?: boolean }) {
  const { t } = useTranslation();
  if (awaitingHost) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-gold/20 text-[#7a5d00]" data-testid="trip-awaiting-host">
        <Clock size={11} /> {t('booking.status.awaiting_host')}
      </span>
    );
  }
  if (status === 'confirmed' && isPast) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#DDF3E1] text-[#1E5A2E]">
        <CheckCircle size={11} /> {t('trips.completed')}
      </span>
    );
  }
  const map: Record<string, string> = {
    confirmed: 'bg-[#DDF0F1] text-[#0E4A4F]',
    pending_payment: 'bg-gold/20 text-[#7a5d00]',
    accepted: 'bg-[#E6F2EA] text-[#1F6656]',
    cancelled: 'bg-flag/10 text-flag',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${map[status] || 'bg-mist text-ink-soft'}`}>
      {status === 'pending_payment' && <Clock size={11} />}
      {status === 'cancelled' && <XCircle size={11} />}
      {status === 'confirmed' && <CheckCircle size={11} />}
      {t(`booking.status.${status}`, { defaultValue: status?.replace('_', ' ') })}
    </span>
  );
}

/** One booking in My Trips and on the account page: photo, name, status, then the details in clear rows. */
export default function TripCard({ booking: b, confirming, busy, onAskCancel, onCancel, onKeep, testId, onReviewed }: {
  booking: any;
  confirming: boolean;
  busy: boolean;
  onAskCancel: () => void;
  onCancel: () => void;
  onKeep: () => void;
  testId?: string;
  /** Reload after the guest rates a finished trip or confirms an accepted one. */
  onReviewed?: () => void;
}) {
  const { t, i18n } = useTranslation();
  // Board: after the host accepts, the guest confirms (free with the pass, else ₹1).
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmErr, setConfirmErr] = useState('');
  const [feeFor, setFeeFor] = useState<string | null>(null);
  const confirmAccepted = async () => {
    setConfirmBusy(true);
    setConfirmErr('');
    try {
      await api.post(`/bookings/${b.id}/checkout`);
      onReviewed?.();
    } catch (e: any) {
      if (e?.response?.status === 402 && e?.response?.data?.code === 'fee_required') setFeeFor(b.id);
      else setConfirmErr(e?.response?.data?.detail || e?.message || '');
    } finally {
      setConfirmBusy(false);
    }
  };
  const now = new Date(new Date().setHours(0, 0, 0, 0));
  // The server says when a trip is finished (India dates); older answers fall back to the date.
  const isPast = b.completed ?? Boolean(b.check_in && new Date(b.check_in) < now);
  const row = 'flex items-center gap-2 text-[13px] text-ink';
  return (
    <article data-testid={testId} className="bg-white rounded-2xl border border-[var(--line)] p-4 flex flex-col gap-3 shadow-[0_1px_2px_rgba(20,32,26,0.04)]">
      <div className="flex gap-3">
        <div className="w-20 h-20 rounded-xl overflow-hidden bg-mist flex-shrink-0">
          {b.listing?.image ? (
            <img src={b.listing.image} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full grid place-items-center text-ink-soft"><Compass size={22} /></div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display font-bold text-ink text-base leading-snug line-clamp-2">{b.listing?.title || b.listing_title}</h3>
            <StatusPill status={b.status} isPast={isPast} awaitingHost={!!b.awaiting_host} />
          </div>
          <div className="mt-1 text-xs text-ink-soft capitalize flex items-center gap-1">
            <MapPin size={12} className="text-pine flex-shrink-0" />
            <span className="truncate">{b.listing_type}{b.listing?.location ? ` · ${b.listing.location}` : ''}</span>
          </div>
        </div>
      </div>

      <dl className="rounded-xl bg-[#F4F7F6] border border-[var(--line)] px-3 py-2.5 space-y-1.5" data-testid="trip-details">
        {b.check_in && (
          <div className={row}>
            <CalendarBlank size={15} className="text-pine flex-shrink-0" />
            <dt className="text-ink-soft">{t('booking.checkin')}</dt>
            <dd className="font-semibold ml-auto text-right">{formatTripDates(b.check_in, b.check_out, i18n.language)}</dd>
          </div>
        )}
        <div className={row}>
          <Users size={15} className="text-pine flex-shrink-0" />
          <dt className="text-ink-soft">{t('booking.guests')}</dt>
          <dd className="font-semibold ml-auto">{b.guests}</dd>
        </div>
        <div className={row}>
          <Receipt size={15} className="text-pine flex-shrink-0" />
          <dt className="text-ink-soft">{t('dashboard.booked_on')}</dt>
          <dd className="font-semibold ml-auto">{new Date(b.created_at).toLocaleDateString(i18n.language)}</dd>
        </div>
      </dl>

      {b.awaiting_host && (
        <p className="text-[13px] text-[#7a5d00] bg-gold/10 rounded-xl px-3 py-2" data-testid={`trip-waiting-${b.id}`}>{t('approval.waiting_note')}</p>
      )}
      {b.status === 'accepted' && (
        <div className="rounded-xl bg-[#E6F2EA] border border-[#1F6656]/20 px-3 py-2.5" data-testid={`trip-accepted-${b.id}`}>
          <p className="text-[13px] font-semibold text-[#1F6656]">{t('approval.accepted_note')}</p>
          <button type="button" onClick={confirmAccepted} disabled={confirmBusy} data-testid={`trip-confirm-${b.id}`}
            className="mt-2 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[#1F6656] text-white font-bold text-[13px] btn-hover disabled:opacity-60">
            {confirmBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />} {t('approval.confirm_cta')}
          </button>
          {confirmErr && <p className="mt-2 text-xs font-semibold text-flag">{confirmErr}</p>}
        </div>
      )}
      <BookingFeeModal bookingId={feeFor} onClose={() => setFeeFor(null)}
        onConfirmed={() => { setFeeFor(null); onReviewed?.(); }} />

      {/* Board, after completion: review + suggestion for aangan, then share the trip story. */}
      {b.completed && (
        <div className="flex flex-wrap gap-2" data-testid={`after-trip-${b.id}`}>
          {!b.reviewed && <RateTripButton booking={b} onDone={() => onReviewed?.()} />}
          <ShareStoryButton place={b.listing?.title || b.listing_title} />
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <Link to={`/listing/${b.listing_id}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-pine hover:underline">
          {t('dashboard.view_listing')} <ArrowRight size={14} />
        </Link>
        {b.status !== 'cancelled' && !isPast && (
          confirming ? (
            <span className="inline-flex items-center gap-2 text-sm">
              <span className="text-ink-soft">{t('dashboard.cancel_confirm')}</span>
              <button onClick={onCancel} disabled={busy} data-testid={`confirm-cancel-${b.id}`}
                className="inline-flex items-center gap-1 font-bold text-flag disabled:opacity-50">
                {busy ? <Loader2 size={12} className="animate-spin" /> : null} {t('common.yes')}
              </button>
              <button onClick={onKeep} className="font-bold text-ink-soft">{t('common.no')}</button>
            </span>
          ) : (
            <button onClick={onAskCancel} data-testid={`cancel-booking-${b.id}`}
              className="inline-flex items-center gap-1 text-sm font-bold text-flag hover:text-[#8a1e1e]">
              <XCircle size={14} /> {t('common.cancel')}
            </button>
          )
        )}
      </div>
    </article>
  );
}
