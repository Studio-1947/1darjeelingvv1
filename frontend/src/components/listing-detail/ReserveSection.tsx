import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Navigation, Receipt } from 'lucide-react';
import { Screen, SectionHead, ALIGN_TEXT, ALIGN_BLOCK } from './primitives';
import { BookingFlow } from './useBookingFlow';
import { todayStr, addDays, isBadRange } from '@/lib/dates';

/**
 * What the platform actually charges to confirm a booking, in rupees.
 *
 * Mirrors AMOUNTS.booking_commission in backend/src/config.ts (10000 paise → ₹1).
 * The server is the authority on what gets charged; this is only what we promise
 * beforehand, and the two must not drift - see the breakdown below.
 */
const BOOKING_FEE = 1;

/** Inline validation message under a field. Nothing rendered when there's no error. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} data-testid={id} role="alert" className="mt-1 block text-xs font-semibold text-flag">
      {message}
    </span>
  );
}

/**
 * What this booking costs, itemised, before anything is committed.
 *
 * The widget previously showed no total at all: a visitor pressed Reserve Now
 * having seen "₹1800 / head" and nothing else, while /refunds separately
 * disclosed a ₹1 booking confirmation fee they never saw in the flow (QA 3.3).
 *
 * The two halves are deliberately kept apart rather than summed into one number.
 * Only the ₹1 goes through Razorpay now; the stay itself is settled with the host.
 * A single "Total: ₹7,201" would imply we are collecting all of it.
 */
function PriceBreakdown({ item, unit, nights, guests }: {
  item: any; unit: string; nights: number; guests: number;
}) {
  const { t } = useTranslation();
  const rate = Number(item.price) || 0;
  const isStay = item.type === 'homestay';
  // A homestay is priced per person per night; a driver by the day.
  const units = isStay ? guests * Math.max(nights, 0) : 1;
  const stayTotal = rate * units;
  const needsDates = isStay && nights <= 0;

  return (
    <div data-testid="booking-breakdown" className="rounded-2xl border border-[var(--line)] bg-white p-4 md:p-5 text-left">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink-soft">
        <Receipt size={14} className="text-pine" /> {t('booking.price_details')}
      </div>

      {rate > 0 && (
        <div className="mt-3 flex items-start justify-between gap-4 text-sm">
          <span className="text-ink-soft">
            ₹{rate}{unit}
            {isStay && !needsDates && (
              <> × {t('widget.guest_count', { count: guests })} × {t('booking.nights', { count: nights })}</>
            )}
          </span>
          <span className="font-bold text-ink whitespace-nowrap">
            {needsDates ? '—' : `₹${stayTotal.toLocaleString('en-IN')}`}
          </span>
        </div>
      )}

      {needsDates && (
        <p className="mt-2 text-xs text-ink-soft">{t('booking.pick_dates_for_total')}</p>
      )}

      {rate > 0 && !needsDates && (
        <p className="mt-1 text-xs text-ink-soft">{t('booking.paid_to_host')}</p>
      )}

      <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-start justify-between gap-4 text-sm">
        <span className="text-ink-soft">{t('booking.confirmation_fee')}</span>
        <span className="font-bold text-ink whitespace-nowrap">₹{BOOKING_FEE}</span>
      </div>
      <div className="mt-2 flex items-start justify-between gap-4">
        <span className="text-sm font-bold text-ink">{t('booking.payable_now')}</span>
        <span className="font-display font-extrabold text-lg text-ink whitespace-nowrap">₹{BOOKING_FEE}</span>
      </div>

      <Link to="/refunds" className="mt-3 inline-block text-xs font-semibold text-pine underline">
        {t('booking.fees_and_refunds')}
      </Link>
    </div>
  );
}

/** Reserve screen: the booking form (bookable types) or a walk-in CTA. */
export function ReserveSection({ item, unit, bookable, cta, booking, onOpenMaps }: {
  item: any;
  unit: string;
  bookable: boolean;
  cta: any;
  booking: BookingFlow;
  onOpenMaps: () => void;
}) {
  const { t } = useTranslation();
  const { form, updateForm, errors, busy, msg, doBook } = booking;
  const CtaIcon = cta.Icon;
  const today = todayStr();

  // Moving check-in past the current check-out would leave an impossible range
  // sitting in the form, so the stale end of it is dropped rather than kept
  // around for the submit handler to reject.
  const onCheckIn = (value: string) =>
    updateForm({ check_in: value, check_out: isBadRange(value, form.check_out) ? '' : form.check_out });

  const nights = form.check_in && form.check_out
    ? Math.round((Date.parse(form.check_out) - Date.parse(form.check_in)) / 86_400_000)
    : 0;

  return (
    <Screen tone="white" testid="detail-reserve">
      <SectionHead label={t('detail.reserve')}
        title={item.price > 0 ? `₹${item.price}${unit}` : t('detail.reserve')}
        note={bookable ? undefined : t('detail.walk_in_note')} />

      <div className={`mt-10 max-w-xl ${ALIGN_BLOCK}`}>
        <div className="mist-panel p-6 md:p-8">
          {bookable ? (
            <div className="space-y-4">
              {item.type === 'homestay' && (
                <div className="grid grid-cols-2 gap-4">
                  <label className="block text-left">
                    <span className="text-xs font-semibold text-ink-soft">{t('booking.checkin')}</span>
                    <input required type="date" value={form.check_in} min={today} onChange={(e) => onCheckIn(e.target.value)}
                      aria-invalid={!!errors.check_in} aria-describedby={errors.check_in ? 'booking-error-checkin' : undefined}
                      data-testid="booking-checkin"
                      className={`mt-1 w-full px-3 py-3 rounded-xl border bg-white outline-none text-sm ${errors.check_in ? 'border-flag' : 'border-[var(--line)]'}`} />
                    <FieldError id="booking-error-checkin" message={errors.check_in} />
                  </label>
                  <label className="block text-left">
                    <span className="text-xs font-semibold text-ink-soft">{t('booking.checkout')}</span>
                    {/* A stay is at least one night, so the earliest check-out
                        the picker will offer is the day after check-in. */}
                    <input required type="date" value={form.check_out} min={form.check_in ? addDays(form.check_in, 1) : addDays(today, 1)}
                      disabled={!form.check_in}
                      onChange={(e) => updateForm({ check_out: e.target.value })}
                      aria-invalid={!!errors.check_out} aria-describedby={errors.check_out ? 'booking-error-checkout' : undefined}
                      data-testid="booking-checkout"
                      className={`mt-1 w-full px-3 py-3 rounded-xl border bg-white outline-none text-sm disabled:opacity-50 disabled:cursor-not-allowed ${errors.check_out ? 'border-flag' : 'border-[var(--line)]'}`} />
                    <FieldError id="booking-error-checkout" message={errors.check_out} />
                  </label>
                </div>
              )}
              <label className="block text-left">
                <span className="text-xs font-semibold text-ink-soft">{t('booking.guests')}</span>
                <input type="number" min="1" value={form.guests} onChange={(e) => updateForm({ guests: Number(e.target.value) || 1 })}
                  aria-invalid={!!errors.guests} aria-describedby={errors.guests ? 'booking-error-guests' : undefined}
                  data-testid="booking-guests"
                  className={`mt-1 w-full px-3 py-3 rounded-xl border bg-white outline-none ${errors.guests ? 'border-flag' : 'border-[var(--line)]'}`} />
                <FieldError id="booking-error-guests" message={errors.guests} />
              </label>
              <label className="block text-left">
                <span className="text-xs font-semibold text-ink-soft">{t('booking.notes')}</span>
                <textarea value={form.notes} onChange={(e) => updateForm({ notes: e.target.value })}
                  data-testid="booking-notes" rows={3} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none" />
              </label>

              <PriceBreakdown item={item} unit={unit} nights={nights} guests={Number(form.guests) || 1} />

              <button onClick={doBook} disabled={busy} data-testid="booking-submit"
                className={`w-full py-4 rounded-full font-bold btn-hover disabled:opacity-60 inline-flex items-center justify-center gap-2 ${cta.color}`}>
                {busy ? t('common.loading') : (item.type === 'driver' ? t('cta.talk_to_driver') : t('cta.book_now'))} <CtaIcon size={18} />
              </button>
              {msg && <p data-testid="booking-msg" className={`text-sm ${ALIGN_TEXT} text-pine font-semibold`}>{msg}</p>}
            </div>
          ) : (
            <button onClick={onOpenMaps} data-testid="info-cta"
              className={`w-full py-4 rounded-full font-bold btn-hover inline-flex items-center justify-center gap-2 ${cta.color}`}>
              <CtaIcon size={18} /> {t(`cta.${cta.key}`)}
            </button>
          )}
        </div>
      </div>
    </Screen>
  );
}

/** Sticky bottom bar with price + CTA, mobile only. */
export function MobileStickyBar({ item, unit, bookable, cta, busy, onBook, onOpenMaps }: {
  item: any;
  unit: string;
  bookable: boolean;
  cta: any;
  busy: boolean;
  onBook: () => void;
  onOpenMaps: () => void;
}) {
  const { t } = useTranslation();
  const CtaIcon = cta.Icon;
  // A free spot (no price, not bookable) has nothing to show but the directions
  // action, so the white price panel would just be an empty frame around it -
  // drop it and let the button stand on its own.
  const bare = !bookable && !(item.price > 0);

  return (
    <div className="lg:hidden fixed bottom-16 inset-x-0 z-30 px-4 pb-3">
      {bare ? (
        <button
          onClick={onOpenMaps}
          data-testid="mobile-sticky-cta"
          className="mx-auto max-w-md w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-full font-extrabold bg-pine text-white shadow-[0_8px_24px_-8px_rgba(20,32,26,0.45)] btn-hover"
        >
          <Navigation size={16} /> {t('cta.get_directions')}
        </button>
      ) : (
        // gap-2 and min-w-0 on the price block: at 390px the rupee figure and the
        // button label each wrapped onto a second line, leaving the bar two rows
        // tall and off-centre (QA 4.5). The price may now shrink and ellipsise;
        // the button never wraps, since a broken CTA reads as broken.
        <div className="mx-auto max-w-md bg-white rounded-2xl border border-[var(--line)] shadow-[0_-8px_24px_-8px_rgba(20,32,26,0.18)] p-2.5 flex items-center gap-2">
          {item.price > 0 && (
            <div className="pl-1.5 min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-widest text-ink-soft leading-none truncate">{t('common.starting_from')}</div>
              <div className="font-display font-extrabold text-base sm:text-lg text-ink leading-tight truncate">
                ₹{item.price}<span className="text-[10px] text-ink-soft font-semibold">{unit}</span>
              </div>
            </div>
          )}
          <button
            onClick={bookable ? onBook : onOpenMaps}
            disabled={busy}
            data-testid="mobile-sticky-cta"
            className={`ml-auto flex-shrink-0 inline-flex items-center gap-1.5 px-4 sm:px-5 py-3 rounded-full font-extrabold text-sm whitespace-nowrap btn-hover ${bookable ? cta.color : 'bg-pine text-white'}`}
          >
            {bookable
              ? <><CtaIcon size={16} /> {item.type === 'driver' ? t('cta.talk_to_driver') : t('cta.book_now')}</>
              : <><Navigation size={16} /> {t('cta.get_directions')}</>}
          </button>
        </div>
      )}
    </div>
  );
}
