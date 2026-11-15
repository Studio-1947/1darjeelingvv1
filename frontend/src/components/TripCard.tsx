import React, { useState } from 'react';
import { RateTripButton, ShareStoryButton } from '@/components/AfterTrip';
import api from '@/lib/api';
import { formatTripDates } from '@/lib/dates';
import BookingFeeModal from '@/components/listing-detail/BookingFeeModal';
import { useTranslation } from 'react-i18next';
import {
  Bell, Car, Check, CircleNotch as Loader2, Coffee, Compass, House, MapPin, NavigationArrow, Phone, PersonSimpleHike,
  ShoppingBag, WhatsappLogo, X,
} from '@phosphor-icons/react';
import { Button, ButtonA, ButtonLink, Status, TextArea } from '@/components/ag';

const digits = (p: string) => p.replace(/\D/g, '');
/** wa.me needs the country code; numbers saved as 10 digits are Indian. */
const waNumber = (p: string) => { const d = digits(p); return d.length === 10 ? `91${d}` : d; };
const mapsUrl = (c: { latitude: number | null; longitude: number | null; address: string | null }) =>
  c.latitude != null && c.longitude != null
    ? `https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address || '')}`;

const BAND_ICON: Record<string, React.ElementType> = { homestay: House, driver: Car, guide: PersonSimpleHike, cafe: Coffee, shop: ShoppingBag };

function StatusPill({ status, isPast, awaitingHost }: { status: string; isPast: boolean; awaitingHost?: boolean }) {
  const { t } = useTranslation();
  if (awaitingHost) return <Status data-testid="trip-awaiting-host">{t('booking.status.awaiting_host')}</Status>;
  if (status === 'confirmed' && isPast) return <Status tone="ok">{t('trips.completed')}</Status>;
  const tone = ({ confirmed: 'ok', accepted: 'info', cancelled: 'no' } as const)[status as 'confirmed'] ?? 'pending';
  return <Status tone={tone}>{t(`booking.status.${status}`, { defaultValue: status?.replace('_', ' ') })}</Status>;
}

/**
 * One booking on My trip (prototype tripcard): a band naming the service, the place and its status,
 * the details, then what the traveller can do now (call, WhatsApp, directions, confirm, rate, cancel).
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
  const Icon = BAND_ICON[b.listing_type] || Compass;
  const typeLabel = t(`ui.inviteHostLink.type.${b.listing_type}`, { defaultValue: String(b.listing_type || '').replace(/^./, (c: string) => c.toUpperCase()) });
  const canCancel = !cancelled && !isPast;
  const contact = b.status === 'confirmed' && !isPast && (b.host_contact || b.amount_due);
  const row = 'flex items-center gap-2';

  return (
    <article data-testid={testId} className="ag-box !gap-3 overflow-hidden">
      {/* Band: which service, and when */}
      <div className={`-mx-4 -mt-4 px-4 py-2.5 flex items-center gap-2 border-b border-[var(--warmline)] ${cancelled ? 'bg-[var(--soft)] text-[var(--ink-muted)]' : 'bg-[var(--r-tint)] text-[var(--r)]'}`}>
        <Icon size={18} aria-hidden="true" />
        <b className="font-medium text-sm">{t('ui.trips.band', '{{type}} booking', { type: typeLabel })}</b>
        {b.check_in && <span className="ml-auto text-xs text-[var(--ink-muted)] whitespace-nowrap">{formatTripDates(b.check_in, b.check_out, i18n.language)}</span>}
      </div>

      <div className="flex gap-3">
        <div className="w-16 h-16 rounded-[14px] overflow-hidden bg-[var(--creme2)] flex-shrink-0">
          {b.listing?.image ? (
            <img src={b.listing.image} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full grid place-items-center text-[var(--r)]"><Icon size={24} aria-hidden="true" /></div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="line-clamp-2">{title}</h2>
            <span className="flex-none whitespace-nowrap"><StatusPill status={b.status} isPast={isPast} awaitingHost={!!b.awaiting_host} /></span>
          </div>
          {b.listing?.location && (
            <p className="ag-small flex items-center gap-1 min-w-0"><MapPin size={14} className="text-[var(--r)] flex-shrink-0" aria-hidden="true" /><span className="truncate">{b.listing.location}</span></p>
          )}
        </div>
      </div>

      <dl className="flex flex-col gap-1 text-sm" data-testid="trip-details">
        {b.check_in && (
          <div className={row}>
            <dt className="text-[var(--ink-muted)]">{b.listing_type === 'homestay' ? t('booking.checkin') : t('trips.date')}</dt>
            <dd className="ml-auto text-right text-[var(--ink-strong)]">{formatTripDates(b.check_in, b.check_out, i18n.language)}</dd>
          </div>
        )}
        <div className={row}>
          <dt className="text-[var(--ink-muted)]">{b.listing_type === 'driver' ? t('trips.passengers') : b.listing_type === 'homestay' ? t('booking.guests') : t('trips.people')}</dt>
          <dd className="ml-auto text-[var(--ink-strong)]">{b.guests}</dd>
        </div>
        <div className={row}>
          <dt className="text-[var(--ink-muted)]">{t('dashboard.booked_on')}</dt>
          <dd className="ml-auto text-[var(--ink-strong)]">{new Date(b.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
        </div>
        {contact && b.amount_due ? (
          <div className={row} data-testid={`trip-amount-${b.id}`}>
            <dt className="text-[var(--ink-muted)]">{t('trips.amount_due')}</dt>
            <dd className="ml-auto ag-price">₹{Number(b.amount_due).toLocaleString('en-IN')}</dd>
          </div>
        ) : null}
      </dl>

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
            <div className="flex flex-wrap gap-2">
              {b.host_contact.phone && (
                <ButtonA href={`tel:${b.host_contact.phone}`} variant="tonal" size="sm" icon={<Phone />} data-testid={`trip-call-${b.id}`}>{t('trips.call')}</ButtonA>
              )}
              {b.host_contact.whatsapp && (
                <ButtonA href={`https://wa.me/${waNumber(b.host_contact.whatsapp)}`} target="_blank" rel="noopener noreferrer" variant="tonal" size="sm"
                  icon={<WhatsappLogo />} data-testid={`trip-whatsapp-${b.id}`}>{t('trips.whatsapp')}</ButtonA>
              )}
              {(b.host_contact.address || b.host_contact.latitude != null) && (
                <ButtonA href={mapsUrl(b.host_contact)} target="_blank" rel="noopener noreferrer" variant="tonal" size="sm"
                  icon={<NavigationArrow />} data-testid={`trip-directions-${b.id}`}>{t('trips.directions')}</ButtonA>
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

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <ButtonLink to={`/listing/${b.listing_id}`} size="sm" go>{t('dashboard.view_listing')}</ButtonLink>
        {canCancel && !confirming && (
          <Button variant="stop" size="sm" icon={<X />} onClick={onAskCancel} data-testid={`cancel-booking-${b.id}`}>{t('common.cancel')}</Button>
        )}
      </div>
    </article>
  );
}
