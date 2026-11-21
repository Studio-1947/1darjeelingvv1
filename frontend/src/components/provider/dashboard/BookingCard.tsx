import React, { useState } from 'react';
import { guideTripMessage, waLink } from '@/lib/tripMessages';
import { useTranslation } from 'react-i18next';
import { Box, Button, ButtonA, FieldError, Status } from '@/components/ag';
import { Icon, type IconName } from '@/components/ag/Icon';
import { formatTripDates } from '@/lib/dates';
import { niceTime } from '@/lib/tripTime';
import CancelSheet, { reasonLine } from '@/components/CancelSheet';

/** The icon of each business type, as the prototype's booking band and type tag draw it. */
export const BAND_ICON: Record<string, IconName> = { homestay: 'home', driver: 'car', guide: 'trek', cafe: 'cup', shop: 'bag' };

/**
 * One booking request, drawn as the prototype's host booking card (bookings.js bookingCard):
 * a "Homestay booked" band, the name and status, the dates and amount, the journey
 * (Request sent → You accepted → Guest confirmed → Completed), the guest, then the actions for that stage.
 * Board: a driver, homestay or guide request waits for the host - "Accept" is that yes; the guest
 * then confirms it (pass or ₹1) and it becomes a booking.
 * Declining or cancelling asks the host for a reason (prototype cancel.js); a guest's request to
 * cancel a confirmed booking shows here with Accept cancellation / Keep booking.
 */
export default function BookingCard({ b, onCancel, onAccept, onCancelRequest, host }: {
  b: any;
  onCancel?: (id: string, reason: string, note: string) => Promise<void> | void;
  onAccept?: (id: string) => Promise<void> | void;
  /** Answer a guest's cancel request: accept (the booking is cancelled) or keep it. */
  onCancelRequest?: (id: string, answer: 'accept' | 'keep') => Promise<void> | void;
  host?: { name: string; business: string; phone?: string; location?: string };
}) {
  const { t, i18n } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptErr, setAcceptErr] = useState('');
  const [answering, setAnswering] = useState<'' | 'accept' | 'keep'>('');
  const answer = async (a: 'accept' | 'keep') => {
    setAnswering(a);
    setAcceptErr('');
    try {
      await onCancelRequest?.(b.id, a);
    } catch (e: any) {
      setAcceptErr(e?.response?.data?.detail || t('cancel.failed', 'That did not work. Try again.'));
    } finally {
      setAnswering('');
    }
  };

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

  const doCancel = async (reason: string, note: string) => {
    await onCancel?.(b.id, reason, note);
    setConfirming(false);
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
    : s === 1 ? <Status tone="ok">{t('host.st_acc', 'You accepted')}</Status>
    : <Status>{b.awaiting_host ? t('host.st_sent', 'Request sent') : t('booking.status.pending_payment', { defaultValue: 'Waiting for payment' })}</Status>;
  const phone = b.customer?.phone || '';
  const digits = phone.replace(/\D/g, '');
  const amount = Number(b.amount) || 0;
  const request = s >= 0 && b.cancel_request ? b.cancel_request : null;
  // The journey, each step with whether it has happened: Request sent, You accepted (only when the
  // booking needed your yes), Guest confirmed, a cancel request and you keeping the booking when
  // there was one, and Completed, always the last step.
  const kept = s >= 2 && !request && !!b.cancel_request_kept;
  const steps: Array<[boolean, string]> = [[true, t('host.st_sent', 'Request sent')]];
  if (s >= 1 || b.accepted_at || b.awaiting_host) steps.push([s >= 1, t('host.st_acc', 'You accepted')]);
  steps.push([s >= 2, t('host.st_guest_conf', 'Guest confirmed')]);
  // A request left unanswered past the trip no longer matters: the trip simply completed.
  if ((request && s < 3) || kept) steps.push([true, t('cancel.hreq', 'Guest asked to cancel')]);
  if (kept) steps.push([true, t('host.st_kept', 'You kept the booking')]);
  steps.push([s === 3, t('host.st_done', 'Completed')]);
  const at = steps.map((x) => x[0]).lastIndexOf(true);
  const cancelledTitle = b.declined ? t('cancel.you_declined', 'You declined this request')
    : b.cancelled_by === 'host' ? t('cancel.you_cancelled', 'You cancelled this booking')
    : b.cancelled_by === 'guest' ? t('cancel.by_guest', 'Cancelled by the guest')
    : b.cancelled_by === 'admin' ? t('cancel.by_team', 'Cancelled by the aangan team') : '';
  // A ride: pickup time, from → to and days; the fare quoted is the amount above.
  const ride = [
    b.pickup_time ? t('trips.pickup_at', 'Pickup {{time}}', { time: niceTime(b.pickup_time, i18n.language) }) : null,
    b.pickup_place || b.drop_place ? [b.pickup_place, b.drop_place].map((x: string | null) => x || '…').join(' → ') : null,
    b.days ? (Number(b.days) === 1 ? t('listing.db_day1', '1 day') : t('listing.db_ndays_n', '{{n}} days', { n: b.days })) : null,
  ].filter(Boolean).join(' · ');

  const decline = onCancel && b.status !== 'cancelled' && !b.completed && !confirming && !request && (
    <Button variant="stop" onClick={() => setConfirming(true)} icon={<Icon name="close" />} data-testid={`booking-cancel-${b.id}`}>
      {b.status === 'confirmed' || b.status === 'accepted' ? t('ui.trips.cx_go', 'Cancel booking') : t('pd.decline')}
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
          {steps.map(([, label], j) => (
            <li key={j} className={j < at ? 'past' : j === at ? 'here' : undefined}>
              {j > 0 && <i className={`ln${j <= at ? ' on' : ''}`} />}
              <span className="dot">{j === at && <Icon name="check" />}</span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
      )}
      {(b.notes || b.services?.length > 0 || b.route_name || b.room_name || ride) && (
        <div className="more">
          {b.notes && <p className="italic">“{b.notes}”</p>}
          {b.services?.length > 0 && <p data-testid={`booking-asked-${b.id}`}>{t('ui.bookingCard.asked_for')}: <b>{b.services.join(', ')}</b></p>}
          {b.room_name && <p data-testid={`booking-room-${b.id}`}>{t('listing.sb_room', 'Room')}: <b>{b.room_name}</b></p>}
          {b.route_name && <p>{t('ui.bookingCard.route')}: <b>{b.route_name}</b></p>}
          {ride && <p data-testid={`booking-ride-${b.id}`}>{t('ui.bookingCard.ride', 'Ride')}: <b>{ride}</b></p>}
        </div>
      )}
      {s < 0 && cancelledTitle && (
        <div className="ag-cxban no" data-testid={`booking-cancelled-${b.id}`}>
          <Icon name="close" />
          <span>
            <b>{cancelledTitle}</b>
            {(b.cancel_reason || b.cancel_note) && <><br /><span className="ag-small">{reasonLine(t, b.cancel_reason, b.cancel_note)}</span></>}
            {b.cancel_late && <><br /><span className="ag-small">{t('cancel.late_tag', 'Late cancellation')}</span></>}
          </span>
        </div>
      )}
      {request && (
        <div className="ag-cxban warn" data-testid={`booking-cancel-request-${b.id}`}>
          <Icon name="bell" />
          <span>
            <b>{t('cancel.hreq', 'Guest asked to cancel')}</b><br />
            <span className="ag-small">
              {reasonLine(t, request.reason, request.note)}{request.late ? ` · ${t('cancel.late_tag', 'Late cancellation')}` : ''}
            </span>
          </span>
        </div>
      )}
      {s === 2 && !request && b.cancel_request_kept && (
        <p className="ag-small" data-testid={`booking-cancel-kept-${b.id}`}>{t('cancel.kept_host', 'The guest asked to cancel; you kept the booking.')}</p>
      )}
      <p className="ag-host-guest">
        {t('host.guest', 'Guest')}: <b>{b.customer?.name || t('pd.guest_fallback')}</b>{phone ? ` · ${phone}` : ''}
        {' · '}{t('pd.placed')}: {new Date(b.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
      </p>
      {b.awaiting_host && <p className="ag-small" data-testid={`booking-request-note-${b.id}`}>{t('approval.host_request_note')}</p>}
      {b.status === 'accepted' && <p className="ag-small">{t('approval.host_accepted_note')}</p>}
      <FieldError>{acceptErr}</FieldError>

      {request ? (
        <div className="ag-host-tbtns">
          <Button variant="stop" onClick={() => answer('accept')} disabled={!!answering} data-testid={`booking-cxaccept-${b.id}`}>
            {answering === 'accept' ? t('common.loading') : t('cancel.accept', 'Accept cancellation')}
          </Button>
          <Button onClick={() => answer('keep')} disabled={!!answering} data-testid={`booking-cxkeep-${b.id}`}>
            {answering === 'keep' ? t('common.loading') : t('ui.trips.cx_keep', 'Keep booking')}
          </Button>
          {digits && <ButtonA variant="tonal" href={`tel:${phone}`} icon={<Icon name="phone" />} data-testid={`booking-call-${b.id}`}>{t('pd.call')}</ButtonA>}
        </div>
      ) : b.awaiting_host && onAccept ? (
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
        <CancelSheet booking={b} mode={b.status === 'pending_payment' ? 'host_decline' : 'host_cancel'}
          onSubmit={doCancel} onClose={() => setConfirming(false)} submitTestId={`booking-cancel-yes-${b.id}`} />
      )}
    </Box>
  );
}
