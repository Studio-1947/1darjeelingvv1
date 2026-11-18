import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon as AgIcon } from '@/components/ag/Icon';
import { RateTripButton, ShareStoryButton } from '@/components/AfterTrip';
import api from '@/lib/api';
import { formatTripDates } from '@/lib/dates';
import BookingFeeModal from '@/components/listing-detail/BookingFeeModal';
import { useTranslation } from 'react-i18next';
import { Bell, Check, CircleNotch as Loader2, MapPin, X } from '@phosphor-icons/react';
import { Button, ButtonA, Status, TextArea } from '@/components/ag';

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
 */
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
  const canCancel = !cancelled && !isPast;
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
        {contact && b.amount_due ? (
          <> <b className="ag-price" data-testid={`trip-amount-${b.id}`}>₹{Number(b.amount_due).toLocaleString('en-IN')}</b></>
        ) : null}
      </p>
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

      {/* Cancel: ask first, in the card (the request is withdrawn or cancelled at once on the server). */}
      {canCancel && confirming && (
        <div className="flex flex-col gap-2 rounded-[14px] px-3 py-3 border border-[var(--fail-line)] bg-[var(--fail-bg)]" role="group" aria-label={t('dashboard.cancel_confirm')}>
          <p className="text-sm font-medium text-[var(--ink-strong)]">{t('dashboard.cancel_confirm')}</p>
          <p className="ag-small flex items-start gap-1.5" data-testid={`cancel-free-${b.id}`}><Check size={16} className="flex-shrink-0 mt-0.5 text-[var(--ok)]" aria-hidden="true" /> {t('dashboard.cancel_free')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="stop" size="sm" onClick={onCancel} disabled={busy} data-testid={`confirm-cancel-${b.id}`}
              icon={busy ? <Loader2 className="animate-spin" /> : <X />}>
              {t('ui.trips.cx_go', 'Cancel booking')}
            </Button>
            <Button size="sm" onClick={onKeep}>{t('ui.trips.cx_keep', 'Keep booking')}</Button>
          </div>
        </div>
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

      {canCancel && !confirming && (
        <Button variant="stop" size="sm" icon={<X />} className="self-start" onClick={onAskCancel} data-testid={`cancel-booking-${b.id}`}>{t('common.cancel')}</Button>
      )}
    </article>
  );
}
