import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Minus, Plus, User, Check, Clock } from '@phosphor-icons/react';
import { Box, Button, Chip, Chips, FieldError, Option, SelectField, StepBar, TextArea, TextField, IconButton } from '@/components/ag';
import { UnavailableNotice } from './profileSections';
import { Section } from './primitives';
import { BookingFlow } from './useBookingFlow';
import { todayStr, addDays, isBadRange, parseDate } from '@/lib/dates';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

/** Listing types whose bookings are requests the host accepts first (server: HOST_APPROVAL_TYPES). */
const HOST_ASKED = new Set(['homestay', 'driver', 'guide']);

/** "Sun, 16 Nov", as the prototype's booking steps write a day. */
function niceDay(iso: string, lang: string) {
  const d = parseDate(iso);
  return d ? d.toLocaleDateString(lang === 'en' ? 'en-IN' : lang, { weekday: 'short', day: 'numeric', month: 'short' }) : iso;
}

/** "Step 1 / 2" over the step's question, as in the prototype's booking flow. */
function StepHead({ n, total, title }: { n: number; total: number; title: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-0.5 pt-1">
      <span className="ag-small !text-[13px]">{t('ob.wz.step', { n, total })}</span>
      <h3 className="!text-[22px] !leading-7 !text-[var(--ink7)]">{title}</h3>
    </div>
  );
}

/**
 * What this booking costs, itemised, before anything is committed (prototype "Total to pay the
 * host"). Booking through aangan is free, so the only money here is the stay itself, settled with
 * the host; the notes under it say so.
 */
function PriceBreakdown({ item, unit, nights, guests, voucherPct = 0 }: {
  item: any; unit: string; nights: number; guests: number; voucherPct?: number;
}) {
  const { t } = useTranslation();
  const rate = Number(item.price) || 0;
  const isStay = item.type === 'homestay';
  // A homestay is priced per person per night; a driver or guide by the day.
  const units = isStay ? guests * Math.max(nights, 0) : 1;
  const stayTotal = rate * units;
  const needsDates = isStay && nights <= 0;
  const off = Math.round((stayTotal * voucherPct) / 100);
  const row = 'flex items-start justify-between gap-4';

  return (
    <Box flat data-testid="booking-breakdown" className="!bg-[var(--surface)] !gap-2">
      {rate > 0 && (
        <div className={`${row} ag-small`}>
          <span>
            ₹{rate.toLocaleString('en-IN')} {unit}
            {isStay && !needsDates && <> × {t('widget.guest_count', { count: guests })} × {t('booking.nights', { count: nights })}</>}
          </span>
        </div>
      )}
      {needsDates && <p className="ag-small">{t('booking.pick_dates_for_total')}</p>}
      {rate > 0 && !needsDates && voucherPct > 0 && (
        <div className={`${row} ag-small`} data-testid="booking-voucher-line">
          <span>{t('booking.voucher_discount', { pct: voucherPct })}</span>
          <span className="text-[var(--r)] whitespace-nowrap">−₹{off.toLocaleString('en-IN')}</span>
        </div>
      )}
      {rate > 0 && !needsDates && (
        <div className={`${row} border-t border-[var(--warmline)] pt-2 text-[17px] leading-6 font-medium text-[var(--ink-strong)]`}>
          <span>{voucherPct > 0 ? t('booking.voucher_final') : t('detail.total_host', 'Total to pay the host')}</span>
          <span className="tabular-nums whitespace-nowrap">₹{(stayTotal - off).toLocaleString('en-IN')}</span>
        </div>
      )}
      {rate > 0 && !needsDates && <p className="ag-small !text-[13px] !leading-[18px]">{t('booking.paid_to_host')}</p>}
      <p className="m-0 border-t border-[var(--warmline)] pt-2 text-[14px] leading-5 font-medium text-[var(--r)]">{t('booking.fee_note')}</p>
      <p className="ag-small !text-[13px] !leading-[18px]" data-testid="booking-cancel-note">{t('booking.cancel_note')}</p>
      <Link to="/refunds" className="ag-seeall self-start">{t('booking.fees_and_refunds')}</Link>
    </Box>
  );
}

/** The people stepper (prototype `.stepper.sm` in a box row). */
function PeopleStepper({ value, max, maxLabel, error, onChange }: {
  value: number; max: number; maxLabel: string; error?: string; onChange: (n: number) => void;
}) {
  const { t } = useTranslation();
  const n = Math.min(max, Math.max(1, Number(value) || 1));
  return (
    <>
      <Box flat role="group" aria-label={t('detail.people', 'People')} aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'booking-error-guests' : undefined} tabIndex={error ? -1 : undefined}
        data-testid="booking-guests" className="!flex-row !items-center justify-between !py-2.5 !pr-2.5">
        <span className="flex flex-col">
          <span className="inline-flex items-center gap-2 font-medium text-[var(--ink-strong)]"><User className="w-5 h-5 text-[var(--r)]" aria-hidden="true" />{t('detail.people', 'People')}</span>
          <span className="ag-small !text-[12px] !leading-4">{maxLabel}</span>
        </span>
        <span className="ag-stepper !gap-2">
          <IconButton small tint label={t('detail.people_minus', 'One person less')} disabled={n <= 1} onClick={() => onChange(n - 1)}><Minus weight="bold" /></IconButton>
          <span className="n !text-[20px] !leading-7" aria-live="polite">{n}</span>
          <IconButton small tint label={t('detail.people_plus', 'One more person')} disabled={n >= max} onClick={() => onChange(n + 1)}><Plus weight="bold" /></IconButton>
        </span>
      </Box>
      <FieldError id="booking-error-guests">{error}</FieldError>
    </>
  );
}

/**
 * The booking form on the listing page, laid out as the prototype's booking steps (stay: your stay,
 * then send; driver: your ride, then send; guide: which day, services, then send). All steps sit
 * on one screen so nothing is hidden behind a Next; what is sent and how is useBookingFlow's job.
 */
export function ReserveSection({ item, unit, bookable, available = true, cta, booking }: {
  item: any;
  unit: string;
  bookable: boolean;
  /** False when the host has switched availability off: the form gives way to a notice. */
  available?: boolean;
  cta: { key: string };
  booking: BookingFlow;
}) {
  const { t, i18n } = useTranslation();
  const { form, updateForm, errors, busy, msg, doBook } = booking;
  // Referral vouchers the traveller can use on this booking (the app's "Apply voucher").
  const { user } = useAuth();
  const [vouchers, setVouchers] = React.useState<{ id: string; discountPercentage: number }[]>([]);
  React.useEffect(() => {
    if (!user || !bookable) { setVouchers([]); return; }
    api.get('/users/me/vouchers').then(({ data }) => setVouchers(Array.isArray(data) ? data : [])).catch(() => setVouchers([]));
  }, [user, bookable]);
  const today = todayStr();
  const lang = i18n.language;

  const isStay = item.type === 'homestay';
  const isDriver = item.type === 'driver';
  const isGuide = item.type === 'guide';
  const services: any[] = isGuide && Array.isArray(item.extras?.services) ? item.extras.services.filter((s: any) => String(s?.name || '').trim()) : [];
  const routes: any[] = isDriver && Array.isArray(item.extras?.routes) ? item.extras.routes : [];
  const total = isGuide && services.length > 0 ? 3 : 2;

  // Moving check-in past the current check-out would leave an impossible range sitting in the
  // form, so the stale end of it is dropped rather than kept around for the submit handler to reject.
  const onCheckIn = (value: string) =>
    updateForm({ check_in: value, check_out: isBadRange(value, form.check_out) ? '' : form.check_out });

  const nights = form.check_in && form.check_out
    ? Math.round((Date.parse(form.check_out) - Date.parse(form.check_in)) / 86_400_000)
    : 0;
  const firstDone = isStay ? nights > 0 : !!form.check_in;

  // The server sends the limit it enforces (lib/bookingRules.ts); the fallback is the same rule.
  const maxGuests = item.max_guests || (isDriver ? (item.extras?.seats || 6) : (item.extras?.capacity || 10));
  const maxLabel = t(isDriver ? 'ui.reserveSection.max_passengers' : isGuide ? 'ui.reserveSection.max_people' : 'ui.reserveSection.max_guests', { max: maxGuests });
  const people = (
    <PeopleStepper value={form.guests} max={maxGuests} maxLabel={maxLabel} error={errors.guests}
      onChange={(n) => updateForm({ guests: n })} />
  );
  // The date inputs are narrower than the pill's usual padding allows at phone width.
  const dateStyle = { paddingInline: 14 };
  const guideDays = [today, addDays(today, 1), addDays(today, 2)];

  return (
    <Section id="book" testid="detail-reserve" className="scroll-mt-24">
      {!available ? (
        <UnavailableNotice />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <StepBar total={total} at={firstDone ? total - 1 : 0} label={t('ob.wz.step', { n: firstDone ? total : 1, total })} />
            <span className="ag-small">{item.title}</span>
          </div>

          {/* ---------- step 1 ---------- */}
          {isStay && (
            <>
              <StepHead n={1} total={total} title={t('detail.your_stay', 'Your stay')} />
              <div className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] items-start gap-1.5">
                <TextField label={t('booking.checkin')} type="date" required value={form.check_in} min={today} style={dateStyle}
                  onChange={(e) => onCheckIn(e.target.value)} data-testid="booking-checkin"
                  error={errors.check_in} errorId="booking-error-checkin" />
                <ArrowRight className="mt-[46px] w-5 h-5 text-[var(--r)]" aria-hidden="true" />
                {/* A stay is at least one night, so the earliest check-out is the day after check-in. */}
                <TextField label={t('booking.checkout')} type="date" required value={form.check_out} style={dateStyle}
                  min={form.check_in ? addDays(form.check_in, 1) : addDays(today, 1)} disabled={!form.check_in}
                  onChange={(e) => updateForm({ check_out: e.target.value })} data-testid="booking-checkout"
                  error={errors.check_out} errorId="booking-error-checkout" />
              </div>
              {nights > 0 && (
                <p className="ag-small">
                  {niceDay(form.check_in, lang)} → {niceDay(form.check_out, lang)} · <b className="font-medium text-[var(--ink-strong)]">{t('booking.nights', { count: nights })}</b>
                </p>
              )}
              {people}
            </>
          )}

          {isDriver && (
            <>
              <StepHead n={1} total={total} title={t('detail.your_ride', 'Your ride')} />
              {/* A driver booking says which route: the trip, and the driver's km and places covered. */}
              {routes.length > 0 && (
                <SelectField label={t('booking.route')} value={form.route || ''} onChange={(e) => updateForm({ route: e.target.value })} data-testid="booking-route">
                  <option value="">{t('booking.route_pick')}</option>
                  {routes.map((r: any, i: number) => {
                    const name = typeof r === 'string' ? r : (r.route || r.name || '');
                    return name ? <option key={i} value={name}>{name}{r.price ? ` · ₹${Number(r.price).toLocaleString('en-IN')}` : ''}</option> : null;
                  })}
                </SelectField>
              )}
              <TextField label={t('detail.journey_date', 'Journey date')} type="date" required value={form.check_in} min={today}
                onChange={(e) => updateForm({ check_in: e.target.value })} data-testid="booking-date"
                error={errors.check_in} errorId="booking-error-date" />
              {people}
            </>
          )}

          {isGuide && (
            <>
              <StepHead n={1} total={total} title={t('detail.which_day', 'Which day?')} />
              <Chips>
                {guideDays.map((d, i) => (
                  <Chip key={d} on={form.check_in === d} onClick={() => updateForm({ check_in: d })}>
                    {i === 0 ? t('detail.today', 'Today') : i === 1 ? t('detail.tomorrow', 'Tomorrow') : niceDay(d, lang)}
                  </Chip>
                ))}
              </Chips>
              <TextField label={t('detail.other_day', 'Or pick another date')} type="date" required value={form.check_in} min={today}
                onChange={(e) => updateForm({ check_in: e.target.value })} data-testid="booking-date"
                error={errors.check_in} errorId="booking-error-date"
                hint={Array.isArray(item.extras?.seasons) && item.extras.seasons.length > 0
                  ? <span data-testid="booking-guide-seasons">{t('booking.guide_seasons', { seasons: item.extras.seasons.map((s: string) => t(`profile.season_${s}`, { defaultValue: s })).join(', ') })}</span>
                  : undefined} />
              {services.length === 0 && people}
            </>
          )}

          {/* ---------- guide step 2: the services ("Asking for given items") ---------- */}
          {isGuide && services.length > 0 && (
            <>
              <StepHead n={2} total={total} title={t('booking.services')} />
              <div className="ag-pick" data-testid="booking-services">
                {item.extras.services.map((s: any, i: number) => {
                  const name = String(s?.name || '').trim();
                  if (!name) return null;
                  const on = (form.services || []).includes(name);
                  return (
                    <Option key={i} on={on} data-testid={`booking-service-${i}`} title={name}
                      sub={s.price ? `₹${Number(s.price).toLocaleString('en-IN')} ${t(`profile.unit_${s.unit || 'day'}`)}` : undefined}
                      onClick={() => updateForm({ services: on ? (form.services || []).filter((x) => x !== name) : [...(form.services || []), name] })} />
                  );
                })}
              </div>
              {people}
            </>
          )}

          {/* ---------- last step: message, total, send ---------- */}
          <StepHead n={total} total={total} title={t('detail.send_request', 'Send your request')} />
          <TextArea label={t('detail.note_host', 'Message for the host (you can skip)')} value={form.notes} rows={3}
            onChange={(e) => updateForm({ notes: e.target.value })} data-testid="booking-notes" className="[&_textarea]:!min-h-[96px]" />

          {vouchers.length > 0 && (
            <fieldset data-testid="booking-vouchers" className="flex flex-col gap-2">
              <legend className="ag-eyebrow mb-2">{t('booking.voucher_apply')}</legend>
              <Chips>
                {vouchers.map((v) => {
                  const on = form.voucher_id === v.id;
                  return (
                    <Chip key={v.id} on={on} data-testid={`booking-voucher-${v.id}`}
                      onClick={() => updateForm({ voucher_id: on ? undefined : v.id, voucher_pct: on ? undefined : v.discountPercentage })}>
                      {on && <Check weight="bold" aria-hidden="true" />}{t('booking.voucher_off', { pct: v.discountPercentage })} · {t('booking.voucher_reward')}
                    </Chip>
                  );
                })}
              </Chips>
            </fieldset>
          )}

          <PriceBreakdown item={item} unit={unit} nights={nights} guests={Number(form.guests) || 1} voucherPct={form.voucher_pct || 0} />

          <Button variant="primary" go block onClick={doBook} disabled={busy} data-testid="booking-submit">
            {busy ? t('common.loading') : t(`cta.${cta.key}`)}
          </Button>
          {msg && <p data-testid="booking-msg" role="alert" className="ag-err !text-[14px] !leading-5">{msg}</p>}
          {HOST_ASKED.has(item.type) && <p className="ag-small text-center">{t('approval.step_ask')}</p>}

          {HOST_ASKED.has(item.type) && (
            <Box tone="blush" flat data-testid="reserve-how-it-works">
              <span className="ag-eyebrow">{t('approval.next_steps')}</span>
              <ol className="grid gap-2.5">
                {[t('approval.step_ask'), t('approval.step_host'), t('approval.step_confirm'), t('approval.step_contact')].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="ag-micon !w-7 !h-7 text-[13px] font-medium">{i === 1 ? <Clock aria-hidden="true" className="!w-4 !h-4" /> : i + 1}</span>
                    <span className="pt-0.5 text-[14px] leading-5 text-[var(--ink-strong)]">{step}</span>
                  </li>
                ))}
              </ol>
              <Link to="/refunds" className="ag-seeall self-start">{t('approval.refund_link')}</Link>
            </Box>
          )}
        </>
      )}
    </Section>
  );
}

/**
 * The fixed price + "Book now" bar over the tab bar (prototype v7bar), for listings that take
 * bookings. "Book now" brings up the booking steps; the bar steps aside while they are on screen.
 */
export function BookBar({ item, unit, onBook }: { item: any; unit: string; onBook: () => void }) {
  const { t } = useTranslation();
  const rooms = Array.isArray(item.extras?.rooms) ? item.extras.rooms.length : 0;

  // The page ends with the footer, so the page leaves room for this bar: it reads --page-cta-h.
  const barRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = barRef.current;
    if (!el) return undefined;
    const root = document.documentElement;
    const set = () => root.style.setProperty('--page-cta-h', `${el.offsetHeight}px`);
    set();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); root.style.removeProperty('--page-cta-h'); };
  }, []);

  // While the booking form itself is on screen the bar only repeats its button and covers the
  // price breakdown (persona test 2026-11-09), so it slides away until the form scrolls off. It
  // also steps aside at the very end of the page so the footer is not left under it.
  const [formInView, setFormInView] = React.useState(false);
  React.useEffect(() => {
    const targets = [document.querySelector('[data-testid="detail-reserve"]'), document.querySelector('footer')].filter(Boolean) as Element[];
    if (!targets.length || typeof IntersectionObserver === 'undefined') return undefined;
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => seen.set(e.target, e.isIntersecting));
      setFormInView([...seen.values()].some(Boolean));
    }, { threshold: 0.15 });
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div ref={barRef} data-testid="mobile-sticky-bar" aria-hidden={formInView || undefined} inert={formInView || undefined}
      className={`ag-bookbar transition-[opacity,transform] duration-200 ${formInView ? 'opacity-0 translate-y-4 pointer-events-none' : ''}`}>
      <div className="ag-wrap">
        <div className="pp">
          <span>{t('detail.price', 'Price')}{rooms > 1 ? ` · ${t('common.starting_from')}` : ''}</span>
          <b>
            {Number(item.price) > 0 ? `₹${Number(item.price).toLocaleString('en-IN')}` : '—'}
            {unit && Number(item.price) > 0 && <span className="!text-[13px] !font-normal !text-[var(--ink-muted)]"> {unit}</span>}
          </b>
        </div>
        <Button variant="primary" go onClick={onBook} data-testid="mobile-sticky-cta">{t('detail.book_now', 'Book now')}</Button>
      </div>
    </div>
  );
}
