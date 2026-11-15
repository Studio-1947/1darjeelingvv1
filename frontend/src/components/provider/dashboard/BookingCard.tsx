import React, { useState } from 'react';
import { guideTripMessage, waLink } from '@/lib/tripMessages';
import { useTranslation } from 'react-i18next';
import { Phone, ChatCircle, WhatsappLogo, XCircle, CheckCircle, CircleNotch as Loader2 } from '@phosphor-icons/react';
import { Box, Button, ButtonA, FieldError } from '@/components/ag';
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

  const guideDetails = b.listing_type === 'guide' && (b.status === 'accepted' || b.status === 'confirmed') && host
    ? waLink(b.customer?.phone, guideTripMessage({
      guestName: b.customer?.name, hostName: host.name, businessName: host.business,
      date: b.check_in, endDate: b.check_out, guests: b.guests,
      // The services the guest asked for; every service when they did not pick.
      services: (b.listing?.extras?.services || [])
        .filter((s: any) => !b.services?.length || b.services.includes(s.name))
        .map((s: any) => ({ name: s.name, price: Number(s.price) || 0, unit: s.unit })),
      meetingPoint: b.listing?.location || host.location, phone: host.phone, notes: b.notes,
    }))
    : null;

  return (
    <Box as="article" data-testid={`booking-${b.id}`}>
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 flex-none overflow-hidden rounded-2xl bg-[var(--creme2)]">
          {b.listing?.image && <img src={b.listing.image} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2">{b.listing?.title || b.listing_title}</h3>
            <StatusPill status={b.awaiting_host ? 'awaiting_host' : b.status} />
          </div>
          <p className="ag-small">{b.customer?.name || t('pd.guest_fallback')} · {b.customer?.phone}</p>
        </div>
      </div>
      <div className="grid gap-0.5 text-sm text-[var(--ink7)]">
        {b.check_in && <p>{t('booking.checkin')}: <b className="font-medium text-[var(--ink-strong)]">{formatTripDates(b.check_in, b.check_out, i18n.language)}</b></p>}
        <p>{t('booking.guests')}: <b className="font-medium text-[var(--ink-strong)]">{b.guests}</b> · {t('pd.placed')}: {new Date(b.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
        {b.notes && <p className="italic">“{b.notes}”</p>}
        {b.services?.length > 0 && <p data-testid={`booking-asked-${b.id}`}>{t('ui.bookingCard.asked_for')}: <b className="font-medium text-[var(--ink-strong)]">{b.services.join(', ')}</b></p>}
        {b.route_name && <p>{t('ui.bookingCard.route')}: <b className="font-medium text-[var(--ink-strong)]">{b.route_name}</b></p>}
      </div>
      {b.awaiting_host && <p className="text-sm text-[var(--pending)]" data-testid={`booking-request-note-${b.id}`}>{t('approval.host_request_note')}</p>}
      {b.status === 'accepted' && <p className="text-sm text-[var(--r)]">{t('approval.host_accepted_note')}</p>}
      <FieldError>{acceptErr}</FieldError>
      <div className="ag-row">
        {b.awaiting_host && onAccept && (
          <Button variant="primary" size="sm" onClick={doAccept} disabled={accepting} data-testid={`booking-accept-${b.id}`}
            icon={accepting ? <Loader2 className="animate-spin" /> : <CheckCircle />}>
            {t('approval.host_accept')}
          </Button>
        )}
        <ButtonA size="sm" href={`tel:${b.customer?.phone || ''}`} icon={<Phone />} data-testid={`booking-call-${b.id}`}>{t('pd.call')}</ButtonA>
        <ButtonA size="sm" target="_blank" rel="noreferrer" icon={<WhatsappLogo />} data-testid={`booking-wa-${b.id}`}
          href={`https://wa.me/${(b.customer?.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(t('pd.wa_guest_message', { name: b.customer?.name || '', listing: b.listing?.title || '' }))}`}>
          {t('contact.whatsapp')}
        </ButtonA>
        {/* Board, Guide: confirm, then one long WhatsApp message with all the details. */}
        {guideDetails && (
          <ButtonA size="sm" href={guideDetails} target="_blank" rel="noreferrer" icon={<ChatCircle />} data-testid={`booking-guide-details-${b.id}`}>
            {t('ui.bookingCard.send_trip_details')}
          </ButtonA>
        )}
        {onCancel && b.status !== 'cancelled' && !confirming && (
          <Button variant="stop" size="sm" onClick={() => setConfirming(true)} icon={<XCircle />} data-testid={`booking-cancel-${b.id}`}>
            {t('pd.decline')}
          </Button>
        )}
      </div>
      {onCancel && b.status !== 'cancelled' && confirming && (
        <div className="ag-row">
          <span className="text-sm text-[var(--ink-strong)]">{t('pd.cancel_booking_confirm')}</span>
          <Button variant="stop" size="sm" onClick={doCancel} disabled={busy} data-testid={`booking-cancel-yes-${b.id}`}
            icon={busy ? <Loader2 className="animate-spin" /> : undefined}>
            {t('common.yes')}
          </Button>
          <Button size="sm" onClick={() => setConfirming(false)}>{t('common.no')}</Button>
        </div>
      )}
    </Box>
  );
}
