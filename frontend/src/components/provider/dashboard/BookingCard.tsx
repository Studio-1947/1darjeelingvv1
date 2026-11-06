import React, { useState } from 'react';
import { guideTripMessage, waLink } from '@/lib/tripMessages';
import { useTranslation } from 'react-i18next';
import { Phone, ChatCircle as MessageCircle, XCircle, CheckCircle, CircleNotch as Loader2 } from '@phosphor-icons/react';
import { StatusPill } from './widgets';
import { formatTripDates } from '@/lib/dates';

/**
 * One booking in the provider's list: guest, dates, and contact + accept / decline actions.
 * Board: a driver, homestay or guide request waits for the host - "Accept" is that yes; the guest
 * then confirms it (pass or ₹1) and it becomes a booking.
 */
export default function BookingCard({ b, onCancel, onAccept, host }: {
  b: any;
  onCancel?: (id: string) => Promise<void> | void;
  onAccept?: (id: string) => Promise<void> | void;
  host?: { name: string; business: string; phone?: string; location?: string };
}) {
  const { t, i18n } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptErr, setAcceptErr] = useState('');

  const doAccept = async () => {
    setAccepting(true);
    setAcceptErr('');
    try {
      await onAccept?.(b.id);
    } catch (e: any) {
      setAcceptErr(e?.response?.data?.detail || t('approval.accept_failed'));
    } finally {
      setAccepting(false);
    }
  };

  const doCancel = async () => {
    setBusy(true);
    try {
      await onCancel?.(b.id);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <article
      key={b.id}
      data-testid={`booking-${b.id}`}
      className="bg-white rounded-2xl border border-[var(--line)] p-4 md:p-5 flex gap-4"
    >
      <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-mist flex-shrink-0">
        {b.listing?.image && <img src={b.listing.image} alt="" className="w-full h-full object-cover" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-display font-bold text-ink text-base leading-tight line-clamp-1">{b.listing?.title || b.listing_title}</div>
            <div className="text-xs text-ink-soft mt-0.5">{b.customer?.name || t('pd.guest_fallback')} · {b.customer?.phone}</div>
          </div>
          <StatusPill status={b.awaiting_host ? 'awaiting_host' : b.status} />
        </div>
        <div className="mt-2 text-xs text-ink-soft space-y-0.5">
          {b.check_in && <div>{t('booking.checkin')}: <b className="text-ink">{formatTripDates(b.check_in, b.check_out, i18n.language)}</b></div>}
          <div>{t('booking.guests')}: <b className="text-ink">{b.guests}</b> · {t('pd.placed')}: {new Date(b.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          {b.notes && <div className="italic">“{b.notes}”</div>}
          {b.services?.length > 0 && <div data-testid={`booking-asked-${b.id}`}>Asked for: <b className="text-ink">{b.services.join(', ')}</b></div>}
          {b.route_name && <div>Route: <b className="text-ink">{b.route_name}</b></div>}
        </div>
        {b.awaiting_host && <p className="mt-2 text-xs font-semibold text-[#7a5d00]" data-testid={`booking-request-note-${b.id}`}>{t('approval.host_request_note')}</p>}
        {b.status === 'accepted' && <p className="mt-2 text-xs font-semibold text-pine">{t('approval.host_accepted_note')}</p>}
        {acceptErr && <p className="mt-2 text-xs font-semibold text-flag">{acceptErr}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {b.awaiting_host && onAccept && (
            <button onClick={doAccept} disabled={accepting} data-testid={`booking-accept-${b.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1F6656] text-white font-bold text-xs btn-hover disabled:opacity-60">
              {accepting ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} {t('approval.host_accept')}
            </button>
          )}
          <a
            href={`tel:${b.customer?.phone || ''}`}
            data-testid={`booking-call-${b.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pine text-white font-bold text-xs btn-hover"
          >
            <Phone size={12} /> {t('pd.call')}
          </a>
          <a
            href={`https://wa.me/${(b.customer?.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(t('pd.wa_guest_message', { name: b.customer?.name || '', listing: b.listing?.title || '' }))}`}
            target="_blank"
            rel="noreferrer"
            data-testid={`booking-wa-${b.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#25D366] text-white font-bold text-xs btn-hover"
          >
            <MessageCircle size={12} /> {t('contact.whatsapp')}
          </a>
          {/* Board, Guide: confirm, then one long WhatsApp message with all the details. */}
          {b.listing_type === 'guide' && (b.status === 'accepted' || b.status === 'confirmed') && host && (
            <a
              href={waLink(b.customer?.phone, guideTripMessage({
                guestName: b.customer?.name, hostName: host.name, businessName: host.business,
                date: b.check_in, endDate: b.check_out, guests: b.guests,
                // The services the guest asked for; every service when they did not pick.
                services: (b.listing?.extras?.services || [])
                  .filter((s: any) => !b.services?.length || b.services.includes(s.name))
                  .map((s: any) => ({ name: s.name, price: Number(s.price) || 0, unit: s.unit })),
                meetingPoint: b.listing?.location || host.location, phone: host.phone, notes: b.notes,
              }))}
              target="_blank"
              rel="noreferrer"
              data-testid={`booking-guide-details-${b.id}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#25D366] text-[#128C4A] font-bold text-xs btn-hover"
            >
              <MessageCircle size={12} /> Send trip details
            </a>
          )}
          {onCancel && b.status !== 'cancelled' && (
            confirming ? (
              <span className="inline-flex items-center gap-2 text-xs pl-1">
                <span className="text-ink-soft">{t('pd.cancel_booking_confirm')}</span>
                <button onClick={doCancel} disabled={busy} data-testid={`booking-cancel-yes-${b.id}`}
                  className="inline-flex items-center gap-1 font-bold text-flag disabled:opacity-50">
                  {busy ? <Loader2 size={12} className="animate-spin" /> : null} {t('common.yes')}
                </button>
                <button onClick={() => setConfirming(false)} className="font-bold text-ink-soft">{t('common.no')}</button>
              </span>
            ) : (
              <button onClick={() => setConfirming(true)} data-testid={`booking-cancel-${b.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-flag/40 text-flag font-bold text-xs btn-hover">
                <XCircle size={12} /> {t('pd.decline')}
              </button>
            )
          )}
        </div>
      </div>
    </article>
  );
}
