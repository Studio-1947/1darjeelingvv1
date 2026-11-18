import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Button, Chip, Chips, FieldError, Option, SelectField, StepBar, TextField } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import { BookingFlow } from './useBookingFlow';
import { todayStr, addDays, isBadRange, parseDate } from '@/lib/dates';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

/** Listing types whose bookings are requests the host accepts first (server: HOST_APPROVAL_TYPES). */
const HOST_ASKED = new Set(['homestay', 'driver', 'guide']);

/** How many steps the booking screen has (prototype: stay and ride 2, guide 3). */
export function bookingSteps(type: string) {
  return type === 'guide' ? 3 : 2;
}

/** "Thu, 19 Nov", as the prototype's booking steps write a day. */
function niceDay(iso: string, lang: string) {
  const d = parseDate(iso);
  return d ? d.toLocaleDateString(lang === 'en' ? 'en-IN' : lang, { weekday: 'short', day: 'numeric', month: 'short' }) : iso;
}

const rs = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** The people row (prototype `.box.sbrow` with a small stepper). */
function PeopleRow({ value, max, error, onChange }: { value: number; max: number; error?: string; onChange: (n: number) => void }) {
  const { t } = useTranslation();
  const n = Math.min(max, Math.max(1, Number(value) || 1));
  return (
    <>
      <Box role="group" aria-label={t('listing.sb_people', 'People')} aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'booking-error-guests' : undefined} tabIndex={error ? -1 : undefined}
        data-testid="booking-guests" className="ag-listing-sbrow">
        <span className="ag-listing-sblab"><Icon name="person" /> {t('listing.sb_people', 'People')}</span>
        <span className="ag-listing-mstep">
          <button type="button" aria-label={t('detail.people_minus', 'One person less')} disabled={n <= 1} onClick={() => onChange(n - 1)}>−</button>
          <span className="n" aria-live="polite">{n}</span>
          <button type="button" aria-label={t('detail.people_plus', 'One more person')} disabled={n >= max} onClick={() => onChange(n + 1)}>+</button>
        </span>
      </Box>
      <FieldError id="booking-error-guests">{error}</FieldError>
    </>
  );
}

/**
 * The booking screen behind "Book now" (prototype V.book with staybook.js and drivebook.js): a step
 * bar, the listing's name, then one step per screen. Stay: your stay (dates, people, total), then
 * send. Ride: your ride (trip, date, people, total), then send. Guide: which day, then services and
 * people, then send. Only what the server stores is asked (no room, pickup place or time).
 */
export function BookingScreen({ item, unit, step, booking, onNext }: {
  item: any;
  unit: string;
  /** 1-based. */
  step: number;
  booking: BookingFlow;
  onNext: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { form, updateForm, errors, busy, msg, doBook, validate } = booking;
  const lang = i18n.language;
  const today = todayStr();
  const total = bookingSteps(item.type);
  const last = step >= total;

  const isStay = item.type === 'homestay';
  const isDriver = item.type === 'driver';
  const isGuide = item.type === 'guide';
  const services: any[] = isGuide && Array.isArray(item.extras?.services) ? item.extras.services.filter((s: any) => String(s?.name || '').trim()) : [];
  const routes: any[] = isDriver && Array.isArray(item.extras?.routes) ? item.extras.routes : [];

  // Referral vouchers the traveller can use on this booking (the app's "Apply voucher").
  const { user } = useAuth();
  const [vouchers, setVouchers] = React.useState<{ id: string; discountPercentage: number }[]>([]);
  React.useEffect(() => {
    if (!user) { setVouchers([]); return; }
    api.get('/users/me/vouchers').then(({ data }) => setVouchers(Array.isArray(data) ? data : [])).catch(() => setVouchers([]));
  }, [user]);

  // The prototype opens on tomorrow (and one night for a stay), so the total is never empty.
  React.useEffect(() => {
    if (form.check_in) return;
    const d = addDays(today, 1);
    updateForm(isStay ? { check_in: d, check_out: form.check_out && form.check_out > d ? form.check_out : addDays(d, 1) } : { check_in: d });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCheckIn = (value: string) =>
    updateForm({ check_in: value, check_out: !value ? '' : isBadRange(value, form.check_out) || !form.check_out ? addDays(value, 1) : form.check_out });

  const nights = form.check_in && form.check_out
    ? Math.round((Date.parse(form.check_out) - Date.parse(form.check_in)) / 86_400_000)
    : 0;
  const guests = Math.max(1, Number(form.guests) || 1);
  const rate = Number(item.price) || 0;
  // A homestay is priced per person per night; a driver or guide by the day (backend lib/bookingAmount.ts).
  const gross = isStay ? rate * guests * Math.max(nights, 0) : rate;
  const pct = form.voucher_pct || 0;
  const off = Math.round((gross * pct) / 100);
  const maxGuests = item.max_guests || (isDriver ? (item.extras?.seats || 6) : (item.extras?.capacity || 10));

  const next = () => {
    if (step === 1 && !validate()) return;
    onNext();
  };

  const people = <PeopleRow value={form.guests} max={maxGuests} error={errors.guests} onChange={(n) => updateForm({ guests: n })} />;

  const totalBox = (
    <Box data-testid="booking-breakdown">
      <div className="ag-listing-sum">
        {pct > 0 && gross > 0 && (
          <>
            <span data-testid="booking-voucher-line">{t('booking.voucher_discount', { pct })}</span>
            <span className="price">−{rs(off)}</span>
          </>
        )}
        <span className="t">{t('listing.total', 'Total to pay the host')}</span>
        <span className="t price">{gross > 0 ? rs(gross - off) : '—'}</span>
      </div>
      <p className="ag-small">{t('listing.payhost', 'You pay this to the host directly. aangan takes no share.')}</p>
    </Box>
  );

  const nextBtn = (
    <Button variant="primary" go className="ag-listing-next" onClick={next} data-testid="booking-next">{t('listing.next', 'Next')}</Button>
  );


  return (
    <div className="ag-main ag-listing-book" data-testid="detail-reserve" id="book">
      <StepBar total={total} at={step - 1} label={t('ob.wz.step', { n: step, total })} />
      <p className="ag-small m-0">{item.title}</p>

      {/* ---------- stay: dates, people, total ---------- */}
      {isStay && step === 1 && (
        <>
          <h1>{t('listing.sb_h', 'Your stay')}</h1>
          <div className="ag-listing-daterange">
            <TextField label={t('listing.sb_in', 'Check-in')} type="date" required value={form.check_in} min={today}
              onChange={(e) => onCheckIn(e.target.value)} data-testid="booking-checkin"
              error={errors.check_in} errorId="booking-error-checkin" />
            <span className="arrow" aria-hidden="true"><Icon name="arrowne" /></span>
            {/* A stay is at least one night, so the earliest check-out is the day after check-in. */}
            <TextField label={t('listing.sb_out', 'Check-out')} type="date" required value={form.check_out}
              min={form.check_in ? addDays(form.check_in, 1) : addDays(today, 1)} disabled={!form.check_in}
              onChange={(e) => updateForm({ check_out: e.target.value })} data-testid="booking-checkout"
              error={errors.check_out} errorId="booking-error-checkout" />
          </div>
          {nights > 0 && (
            <p className="ag-small ag-listing-nightline">
              {niceDay(form.check_in, lang)} → {niceDay(form.check_out, lang)} · {t('booking.nights', { count: nights })}
            </p>
          )}
          {people}
          {totalBox}
          {nextBtn}
        </>
      )}

      {/* ---------- ride: trip, date, people, total ---------- */}
      {isDriver && step === 1 && (
        <>
          <h1>{t('listing.db_h', 'Your ride')}</h1>
          {routes.length > 0 && (
            <SelectField label={t('listing.db_trip', 'Trip')} value={form.route || ''} onChange={(e) => updateForm({ route: e.target.value })} data-testid="booking-route">
              <option value="">{t('booking.route_pick')}</option>
              {routes.map((r: any, i: number) => {
                const name = typeof r === 'string' ? r : (r.route || r.name || '');
                return name ? <option key={i} value={name}>{name}{r.price ? ` · ${rs(Number(r.price))}` : ''}</option> : null;
              })}
            </SelectField>
          )}
          {rate > 0 && (
            <p className="ag-small ag-listing-rate m-0 inline-flex items-center gap-1.5">
              <Icon name="car" size={16} className="text-[var(--r)]" /> {t('listing.db_dayrate', 'Day rate')} · {rs(rate)} {unit}
            </p>
          )}
          <TextField label={t('listing.db_when', 'Journey date')} type="date" required value={form.check_in} min={today}
            onChange={(e) => updateForm({ check_in: e.target.value })} data-testid="booking-date"
            error={errors.check_in} errorId="booking-error-date" />
          {people}
          {totalBox}
          {nextBtn}
        </>
      )}

      {/* ---------- guide: which day ---------- */}
      {isGuide && step === 1 && (
        <>
          <h1>{t('listing.when', 'Which day?')}</h1>
          <Chips>
            {[1, 2, 3].map((d, i) => {
              const day = addDays(today, d - 1);
              return (
                <Chip key={day} on={form.check_in === day} onClick={() => updateForm({ check_in: day })}>
                  {i === 0 ? t('listing.today', 'Today') : i === 1 ? t('listing.tmrw', 'Tomorrow') : niceDay(day, lang)}
                </Chip>
              );
            })}
          </Chips>
          <TextField label={t('listing.other', 'Or pick another date')} type="date" required value={form.check_in} min={today}
            onChange={(e) => updateForm({ check_in: e.target.value })} data-testid="booking-date"
            error={errors.check_in} errorId="booking-error-date"
            hint={Array.isArray(item.extras?.seasons) && item.extras.seasons.length > 0
              ? <span data-testid="booking-guide-seasons">{t('booking.guide_seasons', { seasons: item.extras.seasons.map((s: string) => t(`profile.season_${s}`, { defaultValue: s })).join(', ') })}</span>
              : undefined} />
          {nextBtn}
        </>
      )}

      {/* ---------- guide: services and people ---------- */}
      {isGuide && step === 2 && (
        <>
          <h1>{services.length > 0 ? t('booking.services') : t('listing.people', 'How many people?')}</h1>
          {services.length > 0 && (
            <div className="ag-pick" data-testid="booking-services">
              {item.extras.services.map((s: any, i: number) => {
                const name = String(s?.name || '').trim();
                if (!name) return null;
                const on = (form.services || []).includes(name);
                return (
                  <Option key={i} on={on} data-testid={`booking-service-${i}`} title={name}
                    sub={s.price ? `${rs(Number(s.price))} ${t(`profile.unit_${s.unit || 'day'}`)}` : undefined}
                    onClick={() => updateForm({ services: on ? (form.services || []).filter((x) => x !== name) : [...(form.services || []), name] })} />
                );
              })}
            </div>
          )}
          {people}
          {totalBox}
          {nextBtn}
        </>
      )}

      {/* ---------- last step: what you asked for, a message, send ---------- */}
      {last && (
        <>
          <Box>
            <div className="ag-listing-sum">
              <span>
                {isStay && form.check_in && form.check_out
                  ? `${niceDay(form.check_in, lang)} → ${niceDay(form.check_out, lang)}`
                  : form.check_in ? niceDay(form.check_in, lang) : ''}
                {isDriver && form.route ? `, ${form.route}` : ''}
                {isGuide && form.services?.length ? `, ${form.services.join(', ')}` : ''}
              </span>
              <span>
                {isStay && nights > 0 ? `${t('booking.nights', { count: nights })}, ` : ''}{guests === 1 ? t('listing.ppl_one', '1 person') : t('listing.ppl_many', '{{count}} people', { count: guests })}
              </span>
              {pct > 0 && gross > 0 && (
                <>
                  <span data-testid="booking-voucher-line">{t('booking.voucher_discount', { pct })}</span>
                  <span className="price">−{rs(off)}</span>
                </>
              )}
              <span className="t">{t('listing.total', 'Total to pay the host')}</span>
              <span className="t price">{gross > 0 ? rs(gross - off) : '—'}</span>
            </div>
          </Box>

          <TextField label={t('listing.note', 'Message for the host (you can skip)')} value={form.notes} maxLength={200}
            onChange={(e) => updateForm({ notes: e.target.value })} data-testid="booking-notes" />

          {vouchers.length > 0 && (
            <fieldset data-testid="booking-vouchers" className="flex flex-col gap-2">
              <legend className="ag-eyebrow mb-2">{t('booking.voucher_apply')}</legend>
              <Chips>
                {vouchers.map((v) => {
                  const on = form.voucher_id === v.id;
                  return (
                    <Chip key={v.id} on={on} data-testid={`booking-voucher-${v.id}`}
                      onClick={() => updateForm({ voucher_id: on ? undefined : v.id, voucher_pct: on ? undefined : v.discountPercentage })}>
                      {on && <Icon name="check" />}{t('booking.voucher_off', { pct: v.discountPercentage })} · {t('booking.voucher_reward')}
                    </Chip>
                  );
                })}
              </Chips>
            </fieldset>
          )}

          <Button variant="primary" className="ag-listing-send" onClick={doBook} disabled={busy} data-testid="booking-submit">
            {busy ? t('common.loading') : t('listing.send', 'Send')}
          </Button>
          {msg && <p data-testid="booking-msg" role="alert" className="ag-err !text-[14px] !leading-5">{msg}</p>}
          {(errors.check_in || errors.check_out || errors.guests) && (
            <p className="ag-err !text-[14px] !leading-5" role="alert">{errors.check_in || errors.check_out || errors.guests}</p>
          )}
          <p className="ag-small ag-listing-center m-0">{t('listing.askfree', 'Asking is free. You pay nothing now.')}</p>
          <p className="ag-listing-feeline"><Icon name="badge" /><span>{t('booking.fee_note')}</span></p>
          <p className="ag-small ag-listing-center m-0" data-testid="booking-cancel-note">
            {t('booking.cancel_note')} <Link to="/refunds" className="text-[var(--r)] no-underline font-medium">{t('booking.fees_and_refunds')}</Link>
          </p>

          {HOST_ASKED.has(item.type) && (
            <Box tone="blush" flat data-testid="reserve-how-it-works">
              <span className="ag-eyebrow">{t('approval.next_steps')}</span>
              <ol className="grid gap-2.5 m-0 p-0 list-none">
                {[t('approval.step_ask'), t('approval.step_host'), t('approval.step_confirm'), t('approval.step_contact')].map((s, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="ag-micon !w-7 !h-7 text-[13px] font-medium">{i === 1 ? <Icon name="hourglass" size={16} /> : i + 1}</span>
                    <span className="pt-0.5 text-[14px] leading-5 text-[var(--ink-strong)]">{s}</span>
                  </li>
                ))}
              </ol>
            </Box>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The fixed price + "Book now" bar over the tab bar (prototype v7bar), for listings that take
 * bookings. "Book now" opens the booking screen.
 */
export function BookBar({ item, unit, onBook }: { item: any; unit: string; onBook: () => void }) {
  const { t } = useTranslation();
  const rooms = Array.isArray(item.extras?.rooms) ? item.extras.rooms.length : 0;

  // The page leaves room for this bar: it reads --page-cta-h.
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

  return (
    <div ref={barRef} data-testid="mobile-sticky-bar" className="ag-bookbar">
      <div className="ag-wrap">
        <div className="pp">
          <span>{t('listing.v7price', 'Price')}{rooms > 1 ? ` · ${t('listing.v7from', 'From')}` : ''}</span>
          <b>
            {Number(item.price) > 0 ? rs(Number(item.price)) : '—'}
            {unit && Number(item.price) > 0 && <span className="!text-[13px] !font-normal !text-[var(--ink-muted)]"> {unit}</span>}
          </b>
        </div>
        <Button variant="primary" go onClick={onBook} data-testid="mobile-sticky-cta">{t('listing.v7book', 'Book now')}</Button>
      </div>
    </div>
  );
}
