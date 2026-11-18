import React, { useState } from 'react';
import { guideTripMessage, waLink } from '@/lib/tripMessages';
import { useTranslation } from 'react-i18next';
import { Box, Button, ButtonA, FieldError, Status } from '@/components/ag';
import { Icon, type IconName } from '@/components/ag/Icon';
import { formatTripDates } from '@/lib/dates';

/** The icon of each business type, as the prototype's booking band and type tag draw it. */
export const BAND_ICON: Record<string, IconName> = { homestay: 'home', driver: 'car', guide: 'trek', cafe: 'cup', shop: 'bag' };

/**
 * One booking request, drawn as the prototype's host booking card (bookings.js bookingCard):
 * a "Homestay booked" band, the name and status, the dates and amount, the journey
 * (Request sent → Host confirmed → Completed), the guest, then the actions for that stage.
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

  // The prototype's stages: -1 cancelled, 0 asked, 1 host said yes, 2 confirmed, 3 completed.
  const s = b.status === 'cancelled' ? -1 : b.completed ? 3 : b.status === 'confirmed' ? 2 : b.status === 'accepted' ? 1 : 0;
  const type = b.listing_type || b.listing?.type || 'homestay';
  const status = s < 0 ? <Status tone="no">{t('host.st_cancelled', 'Cancelled')}</Status>
    : s === 3 ? <Status tone="ok">{t('host.st_done', 'Completed')}</Status>
    : s === 2 ? <Status tone="ok">{t('booking.status.confirmed', { defaultValue: 'Confirmed' })}</Status>
    : s === 1 ? <Status tone="ok">{t('host.st_yes', 'Host said yes')}</Status>
    : <Status>{b.awaiting_host ? t('host.st_sent', 'Request sent') : t('booking.status.pending_payment', { defaultValue: 'Waiting for payment' })}</Status>;
  const steps: Array<[number, string]> = [[0, t('host.st_sent', 'Request sent')], [2, t('host.st_conf', 'Host confirmed')], ...(s === 3 ? [[3, t('host.st_done', 'Completed')] as [number, string]] : [])];
  const last = steps[steps.length - 1][0];
  const phone = b.customer?.phone || '';
  const digits = phone.replace(/\D/g, '');
  const amount = Number(b.amount) || 0;

  const decline = onCancel && b.status !== 'cancelled' && !b.completed && !confirming && (
    <Button variant="stop" onClick={() => setConfirming(true)} icon={<Icon name="close" />} data-testid={`booking-cancel-${b.id}`}>
      {t('pd.decline')}
    </Button>
  );

  return (
    <Box as="article" className="ag-host-trip" data-testid={`booking-${b.id}`}>
      <div className="ag-host-band"><Icon name={BAND_ICON[type] || 'home'} /><b>{t(`ob.wz.t_${type}`, { defaultValue: type })} {t('host.booked', 'booked')}</b></div>
      <div className="head">
        <h2 className="line-clamp-2">{b.listing?.title || b.listing_title}</h2>
        <span className="shrink-0">{status}</span>
      </div>
      <p className="line">
        {b.check_in ? formatTripDates(b.check_in, b.check_out, i18n.language) : new Date(b.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        , {Number(b.guests) === 1 ? t('host.person1', '1 person') : t('host.people', '{{n}} people', { n: b.guests })}.{amount > 0 && <> <b>₹{amount.toLocaleString('en-IN')}</b></>}
      </p>
      {s >= 0 && (
        <ol className="ag-host-journey" aria-label={t('host.journey', 'Booking status')}>
          {steps.map(([n, label], j) => (
            <li key={n} className={s > n ? 'past' : s === n ? 'here' : undefined}>
              {j > 0 && <i className={`ln${s >= n ? ' on' : ''}`} />}
              <span className="dot">{(s === n || (s > n && n === last)) && <Icon name="check" />}</span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
      )}
      {(b.notes || b.services?.length > 0 || b.route_name) && (
        <div className="more">
          {b.notes && <p className="italic">“{b.notes}”</p>}
          {b.services?.length > 0 && <p data-testid={`booking-asked-${b.id}`}>{t('ui.bookingCard.asked_for')}: <b>{b.services.join(', ')}</b></p>}
          {b.route_name && <p>{t('ui.bookingCard.route')}: <b>{b.route_name}</b></p>}
        </div>
      )}
      <p className="ag-host-guest">
        {t('host.guest', 'Guest')}: <b>{b.customer?.name || t('pd.guest_fallback')}</b>{phone ? ` · ${phone}` : ''}
        {' · '}{t('pd.placed')}: {new Date(b.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
      </p>
      {b.awaiting_host && <p className="ag-small" data-testid={`booking-request-note-${b.id}`}>{t('approval.host_request_note')}</p>}
      {b.status === 'accepted' && <p className="ag-small">{t('approval.host_accepted_note')}</p>}
      <FieldError>{acceptErr}</FieldError>

      {b.awaiting_host && onAccept ? (
        <div className="ag-host-tbtns">
          <Button variant="primary" onClick={doAccept} disabled={accepting} data-testid={`booking-accept-${b.id}`}>
            {accepting ? t('common.loading') : t('approval.host_accept')}
          </Button>
          {decline}
        </div>
      ) : s >= 0 && s < 3 ? (
        <div className="ag-host-tbtns">
          {digits && <ButtonA variant="tonal" href={`tel:${phone}`} icon={<Icon name="phone" />} data-testid={`booking-call-${b.id}`}>{t('pd.call')}</ButtonA>}
          {digits && (
            <ButtonA variant="tonal" target="_blank" rel="noreferrer" icon={<Icon name="wa" />} data-testid={`booking-wa-${b.id}`}
              href={`https://wa.me/${digits}?text=${encodeURIComponent(t('pd.wa_guest_message', { name: b.customer?.name || '', listing: b.listing?.title || '' }))}`}>
              {t('contact.whatsapp')}
            </ButtonA>
          )}
          {/* Board, Guide: confirm, then one long WhatsApp message with all the details. */}
          {guideDetails && (
            <ButtonA variant="tonal" href={guideDetails} target="_blank" rel="noreferrer" icon={<Icon name="news" />} data-testid={`booking-guide-details-${b.id}`}>
              {t('ui.bookingCard.send_trip_details')}
            </ButtonA>
          )}
          {decline}
        </div>
      ) : null}
      {confirming && (
        <div className="ag-host-tbtns items-center">
          <span className="text-sm text-[var(--ink-strong)]">{t('pd.cancel_booking_confirm')}</span>
          <Button variant="stop" onClick={doCancel} disabled={busy} data-testid={`booking-cancel-yes-${b.id}`}>
            {busy ? t('common.loading') : t('common.yes')}
          </Button>
          <Button onClick={() => setConfirming(false)}>{t('common.no')}</Button>
        </div>
      )}
    </Box>
  );
}
