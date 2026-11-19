import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon as AgIcon } from '@/components/ag/Icon';
import { RateTripButton, ShareStoryButton } from '@/components/AfterTrip';
import api from '@/lib/api';
import { formatTripDates } from '@/lib/dates';
import BookingFeeModal from '@/components/listing-detail/BookingFeeModal';
import { useTranslation } from 'react-i18next';
import { Bell, CircleNotch as Loader2, MapPin, X } from '@phosphor-icons/react';
import { Button, ButtonA, FieldError, Status, TextArea } from '@/components/ag';
import CancelSheet, { reasonLine, type CancelMode } from '@/components/CancelSheet';
import { niceTime } from '@/lib/tripTime';

const IconCheck = () => <AgIcon name="check" />;

const digits = (p: string) => p.replace(/\D/g, '');
/** wa.me needs the country code; numbers saved as 10 digits are Indian. */
const waNumber = (p: string) => { const d = digits(p); return d.length === 10 ? `91${d}` : d; };
const mapsUrl = (c: { latitude: number | null; longitude: number | null; address: string | null }) =>
  c.latitude != null && c.longitude != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address || '')}`;

const BAND_ICON: Record<string, 'home' | 'car' | 'trek' | 'cup' | 'bag'> = { homestay: 'home', driver: 'car', guide: 'trek', cafe: 'cup', shop: 'bag' };

function StatusPill({ status, isPast, awaitingHost }: { status: string; isPast: boolean; awaitingHost?: boolean }) {
  const { t } = useTranslation();
  if (awaitingHost) return <Status data-testid="trip-awaiting-host">{t('booking.status.awaiting_host')}</Status>;
  if (status === 'confirmed' && isPast) return <Status tone="ok">{t('trips.completed')}</Status>;
  const tone = ({ confirmed: 'ok', accepted: 'info', cancelled: 'no' } as const)[status as 'confirmed'] ?? 'pending';
  return <Status tone={tone}>{t(`booking.status.${status}`, { defaultValue: status?.replace('_', ' ') })}</Status>;
}

/**
 * One booking on My trip (prototype tripcard): a band naming the service, the place and its status,
 * one line of details, the request journey, then what the traveller can do now (call, WhatsApp,
 * directions, confirm, rate, report a problem, cancel).
 *
 * Cancelling (prototype cancel.js) asks for a reason. A request the host has not said yes to, or
 * an accepted one not yet confirmed, is cancelled at once; a confirmed booking sends the host a
 * cancel request, which they accept or keep, and which the traveller can take back.
 */
export default function TripCard({ booking: b, testId, onReviewed }: {
  booking: any;
  testId?: string;
  /** Reload after the guest rates, confirms, cancels or asks to cancel. */
  onReviewed?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [undoErr, setUndoErr] = useState('');
  const cancelMode: CancelMode = b.status === 'confirmed' ? 'guest_request' : b.status === 'accepted' ? 'guest_cancel' : 'guest_withdraw';
  const submitCancel = async (reason: string, note: string) => {
    if (cancelMode === 'guest_request') await api.post(`/bookings/${b.id}/cancel-request`, { reason, note });
    else await api.patch(`/bookings/${b.id}/cancel`, { reason, note });
    setCancelOpen(false);
    onReviewed?.();
  };
  const undoRequest = async () => {
    setUndoBusy(true);
    setUndoErr('');
    try {
      await api.delete(`/bookings/${b.id}/cancel-request`);
      onReviewed?.();
    } catch (e: any) {
      setUndoErr(e?.response?.data?.detail || e?.message || '');
    } finally {
      setUndoBusy(false);
    }
  };
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
  // "Report a problem" on a confirmed trip (host did not show up, wrong address, asked for more
  // money): it reaches the team's Feedback page with this booking, where they can cancel it.
  const [problemOpen, setProblemOpen] = useState(false);
  const [problem, setProblem] = useState('');
  const [problemState, setProblemState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const sendProblem = async () => {
    if (problem.trim().length < 5) return;
    setProblemState('sending');
    try {
      await api.post('/feedback/aangan', { message: `Problem with this booking: ${problem.trim()}`, booking_id: b.id });
      setProblemState('sent');
      setProblem('');
    } catch {
      setProblemState('error');
    }
  };
  const now = new Date(new Date().setHours(0, 0, 0, 0));
  // The server says when a trip is finished (India dates); older answers fall back to the date.
  const isPast = b.completed ?? Boolean(b.check_in && new Date(b.check_in) < now);
  const cancelled = b.status === 'cancelled';
  const title = b.listing?.title || b.listing_title;
  const bandIcon = BAND_ICON[b.listing_type] || 'pin';
  const Icon = (p: { size?: number; 'aria-hidden'?: boolean | 'true' }) => <AgIcon name={bandIcon} {...p} />;
  const typeLabel = t(`ui.inviteHostLink.type.${b.listing_type}`, { defaultValue: String(b.listing_type || '').replace(/^./, (c: string) => c.toUpperCase()) });
  const canCancel = !cancelled && !isPast && !b.cancel_request;
  const cancelledTitle = b.declined ? t('cancel.declined', 'Declined by the host')
    : b.cancelled_by === 'host' ? t('cancel.by_host', 'Cancelled by the host')
    : b.cancelled_by === 'admin' ? t('cancel.by_team', 'Cancelled by the aangan team')
    : b.cancelled_by === 'guest' ? t('cancel.by_you', 'Cancelled by you') : '';
  // A ride: when and where (pickup time, from → to, days); a stay: the room.
  const rideBits = [
    b.pickup_time ? t('trips.pickup_at', 'Pickup {{time}}', { time: niceTime(b.pickup_time, i18n.language) }) : null,
    b.pickup_place || b.drop_place ? [b.pickup_place, b.drop_place].map((x: string | null) => x || '…').join(' → ') : null,
    b.days ? (Number(b.days) === 1 ? t('listing.db_day1', '1 day') : t('listing.db_ndays_n', '{{n}} days', { n: b.days })) : null,
  ].filter(Boolean);
  const contact = b.status === 'confirmed' && !isPast && (b.host_contact || b.amount_due);

  // Prototype journey: Request sent, then Host confirmed, then Completed once the trip is over.
  const stage = b.status === 'confirmed' ? (isPast ? 2 : 1) : 0;
  const steps: [string, string][] = [['ui.trips.j_sent', 'Request sent'], ['ui.trips.j_conf', 'Host confirmed']];
  if (stage === 2) steps.push(['trips.completed', 'Completed']);

  return (
    <article data-testid={testId} className="ag-box ag-account-trip">
      {/* Band: which service */}
      <div className={`ag-account-band ${cancelled ? 'off' : ''}`}>
        <Icon size={16} aria-hidden="true" />
        <span>{t('ui.trips.band', '{{type}} booking', { type: typeLabel })}</span>
      </div>

      <div className="flex items-start justify-between gap-2">
        <h2 className="line-clamp-2 min-w-0"><Link to={`/listing/${b.listing_id}`}>{title}</Link></h2>
        <span className="flex-none whitespace-nowrap"><StatusPill status={b.status} isPast={isPast} awaitingHost={!!b.awaiting_host} /></span>
      </div>
      {b.listing?.location && (
        <p className="ag-small flex items-center gap-1 min-w-0 -mt-1"><MapPin size={14} className="text-[var(--r)] flex-shrink-0" aria-hidden="true" /><span className="truncate">{b.listing.location}</span></p>
      )}

      <p className="line" data-testid="trip-details">
        {[b.check_in ? formatTripDates(b.check_in, b.check_out, i18n.language) : null, b.guests ? (Number(b.guests) === 1 ? t('ui.trips.one_person', '1 person') : t('ui.trips.n_people', '{{n}} people', { n: b.guests })) : null].filter(Boolean).join(', ')}.
        {!cancelled && (b.amount ?? b.amount_due) ? (
          <> <b className="ag-price" data-testid={`trip-amount-${b.id}`}>₹{Number(b.amount ?? b.amount_due).toLocaleString('en-IN')}</b></>
        ) : null}
      </p>
      {(b.room_name || rideBits.length > 0 || b.route_name) && (
        <p className="ag-small -mt-2 ag-account-tripmore" data-testid={`trip-more-${b.id}`}>
          {b.room_name && <span><AgIcon name="home" /> {b.room_name}</span>}
          {b.route_name && <span><AgIcon name="car" /> {b.route_name}</span>}
          {rideBits.length > 0 && <span><AgIcon name="pin" /> {rideBits.join(' · ')}</span>}
        </p>
      )}
      <p className="ag-small -mt-2">{t('dashboard.booked_on')} {new Date(b.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>

      {!cancelled && (
        <ol className="ag-account-journey" aria-label={t('ui.trips.status', 'Status')}>
          {steps.map(([k, fb], j) => {
            const cls = j < stage ? 'past' : j === stage ? 'here' : '';
            const tick = j === stage || (j < stage && j === steps.length - 1);
            return (
              <li key={k} className={cls}>
                <span className="jdot" aria-hidden="true">{(tick || j < stage) && <IconCheck />}</span>
                <span>{t(k, fb)}</span>
              </li>
            );
          })}
        </ol>
      )}

      {/* Cancelled: who did it and why (prototype cxban.no). */}
      {cancelled && cancelledTitle && (
        <div className="ag-cxban no" data-testid={`trip-cancelled-${b.id}`}>
          <AgIcon name="close" />
          <span>
            <b>{cancelledTitle}</b>
            {(b.cancel_reason || b.cancel_note) && <><br /><span className="ag-small">{reasonLine(t, b.cancel_reason, b.cancel_note)}</span></>}
            {b.cancel_late && <><br /><span className="ag-small">{t('cancel.late_tag', 'Late cancellation')}</span></>}
          </span>
        </div>
      )}
      {/* Asked the host to cancel: waiting for them, and the way back (prototype cxban.warn). */}
      {!cancelled && b.cancel_request && (
        <div className="ag-cxban warn" data-testid={`trip-cancel-request-${b.id}`}>
          <AgIcon name="bell" />
          <span>
            <b>{t('cancel.req', 'Cancellation requested')}</b><br />
            {t('cancel.wait', 'Waiting for the host to accept. You can still call them.')}<br />
            <span className="ag-small">{reasonLine(t, b.cancel_request.reason, b.cancel_request.note)}</span>
          </span>
          <Button size="sm" onClick={undoRequest} disabled={undoBusy} data-testid={`trip-cancel-undo-${b.id}`}>
            {undoBusy ? t('common.loading') : t('cancel.undo', 'Keep my booking')}
          </Button>
          <FieldError>{undoErr}</FieldError>
        </div>
      )}
      {!cancelled && !b.cancel_request && b.cancel_request_kept && b.status === 'confirmed' && !isPast && (
        <div className="ag-cxban" data-testid={`trip-cancel-kept-${b.id}`}>
          <AgIcon name="phone" />
          <span>{t('cancel.kept', 'The host asked to keep this booking. Call them to talk it through.')}</span>
        </div>
      )}

      {/* Confirmed and still ahead: the host's contact, which the confirmation promised. */}
      {contact && (
        <div className="flex flex-col gap-2" data-testid={`trip-contact-${b.id}`}>
          <div>
            <p className="text-sm font-medium text-[var(--ink-strong)]">{t('trips.contact_title')}</p>
            <p className="ag-small">{t('trips.contact_note')}</p>
          </div>
          {b.host_contact?.address && (
            <p className="text-sm text-[var(--ink7)] flex items-start gap-1.5"><MapPin size={16} className="text-[var(--r)] flex-shrink-0 mt-0.5" aria-hidden="true" /> {b.host_contact.address}</p>
          )}
          {b.host_contact && (
            <div className="ag-account-tripbtns">
              {b.host_contact.phone && (
                <ButtonA href={`tel:${b.host_contact.phone}`} variant="tonal" size="sm" icon={<AgIcon name="phone" />} data-testid={`trip-call-${b.id}`}>{t('trips.call')}</ButtonA>
              )}
              {b.host_contact.whatsapp && (
                <ButtonA href={`https://wa.me/${waNumber(b.host_contact.whatsapp)}`} target="_blank" rel="noopener noreferrer" variant="tonal" size="sm"
                  icon={<AgIcon name="wa" />} data-testid={`trip-whatsapp-${b.id}`}>{t('trips.whatsapp')}</ButtonA>
              )}
              {(b.host_contact.address || b.host_contact.latitude != null) && (
                <ButtonA href={mapsUrl(b.host_contact)} target="_blank" rel="noopener noreferrer" variant="tonal" size="sm"
                  icon={<AgIcon name="pin" />} data-testid={`trip-directions-${b.id}`}>{t('trips.directions')}</ButtonA>
              )}
            </div>
          )}
        </div>
      )}

      {b.awaiting_host && (
        <p className="flex items-start gap-2 rounded-[14px] px-3 py-2 text-sm bg-[var(--pending-bg)] text-[var(--pending)]" data-testid={`trip-waiting-${b.id}`}>
          <Bell size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" /> {t('approval.waiting_note')}
        </p>
      )}
      {b.status === 'accepted' && (
        <div className="flex flex-col gap-2 rounded-[14px] px-3 py-3 bg-[var(--r-tint)]" data-testid={`trip-accepted-${b.id}`}>
          <p className="text-sm font-medium text-[var(--r)]">{t('approval.accepted_note')}</p>
          <Button size="sm" go className="self-start" onClick={confirmAccepted} disabled={confirmBusy} data-testid={`trip-confirm-${b.id}`}
            icon={confirmBusy ? <Loader2 className="animate-spin" /> : undefined}>
            {t('approval.confirm_cta')}
          </Button>
          {confirmErr && <p className="ag-err" role="alert">{confirmErr}</p>}
        </div>
      )}
      <BookingFeeModal bookingId={feeFor} onClose={() => setFeeFor(null)}
        onConfirmed={() => { setFeeFor(null); onReviewed?.(); }} />

      {/* Board, after completion: review + suggestion for aangan, then share the trip story. */}
      {b.completed && (
        <div className="flex flex-wrap gap-2" data-testid={`after-trip-${b.id}`}>
          {!b.reviewed && <RateTripButton booking={b} onDone={() => onReviewed?.()} />}
          <ShareStoryButton place={title} />
        </div>
      )}

      {/* Cancel: a reason first, in a sheet (prototype cancel.js). */}
      {cancelOpen && (
        <CancelSheet booking={b} mode={cancelMode} onSubmit={submitCancel} onClose={() => setCancelOpen(false)}
          submitTestId={`confirm-cancel-${b.id}`} infoTestId={cancelMode === 'guest_request' ? `cancel-info-${b.id}` : `cancel-free-${b.id}`} />
      )}

      {b.status === 'confirmed' && (
        problemState === 'sent' ? (
          <p className="text-sm text-[var(--ok)]" data-testid={`problem-sent-${b.id}`}>{t('trips.problem_sent')}</p>
        ) : problemOpen ? (
          <div className="flex flex-col gap-2" data-testid={`problem-form-${b.id}`}>
            <TextArea id={`problem-${b.id}`} label={t('trips.problem_title')} value={problem} onChange={(e) => setProblem(e.target.value)} rows={3} maxLength={1900}
              placeholder={t('trips.problem_ph')} error={problemState === 'error' ? t('trips.problem_error') : undefined} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={sendProblem} disabled={problemState === 'sending' || problem.trim().length < 5} data-testid={`problem-send-${b.id}`}>{t('trips.problem_send')}</Button>
              <Button size="sm" variant="text" onClick={() => setProblemOpen(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        ) : (
          <Button variant="text" size="sm" className="self-start !text-[var(--ink-muted)] underline" onClick={() => setProblemOpen(true)} data-testid={`problem-open-${b.id}`}>
            {t('trips.problem_open')}
          </Button>
        )
      )}

      {canCancel && (
        <Button variant="stop" size="sm" icon={<X />} className="self-start" onClick={() => setCancelOpen(true)} data-testid={`cancel-booking-${b.id}`}>
          {b.status === 'confirmed' ? t('cancel.ask', 'Ask to cancel') : t('common.cancel')}
        </Button>
      )}
    </article>
  );
}
