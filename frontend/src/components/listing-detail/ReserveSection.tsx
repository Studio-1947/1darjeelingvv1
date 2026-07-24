import React from 'react';
import { useTranslation } from 'react-i18next';
import { Navigation } from 'lucide-react';
import { Screen, SectionHead } from './primitives';
import { BookingFlow } from './useBookingFlow';

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
  const { form, setForm, busy, msg, doBook } = booking;
  const CtaIcon = cta.Icon;
  return (
    <Screen tone="white" testid="detail-reserve">
      <SectionHead label={t('detail.reserve')}
        title={item.price > 0 ? `₹${item.price}${unit}` : t('detail.reserve')}
        note={bookable ? undefined : t('detail.walk_in_note')} />

      <div className="mt-10 mx-auto max-w-xl">
        <div className="mist-panel p-6 md:p-8">
          {bookable ? (
            <div className="space-y-4">
              {item.type === 'homestay' && (
                <div className="grid grid-cols-2 gap-4">
                  <label className="block text-left">
                    <span className="text-xs font-semibold text-ink-soft">{t('booking.checkin')}</span>
                    <input required type="date" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })}
                      data-testid="booking-checkin" className="mt-1 w-full px-3 py-3 rounded-xl border border-[var(--line)] bg-white outline-none text-sm" />
                  </label>
                  <label className="block text-left">
                    <span className="text-xs font-semibold text-ink-soft">{t('booking.checkout')}</span>
                    <input required type="date" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })}
                      data-testid="booking-checkout" className="mt-1 w-full px-3 py-3 rounded-xl border border-[var(--line)] bg-white outline-none text-sm" />
                  </label>
                </div>
              )}
              <label className="block text-left">
                <span className="text-xs font-semibold text-ink-soft">{t('booking.guests')}</span>
                <input type="number" min="1" value={form.guests} onChange={(e) => setForm({ ...form, guests: Number(e.target.value) || 1 })}
                  data-testid="booking-guests" className="mt-1 w-full px-3 py-3 rounded-xl border border-[var(--line)] bg-white outline-none" />
              </label>
              <label className="block text-left">
                <span className="text-xs font-semibold text-ink-soft">{t('booking.notes')}</span>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  data-testid="booking-notes" rows={3} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none" />
              </label>

              <button onClick={doBook} disabled={busy} data-testid="booking-submit"
                className={`w-full py-4 rounded-full font-bold btn-hover disabled:opacity-60 inline-flex items-center justify-center gap-2 ${cta.color}`}>
                {busy ? t('common.loading') : (item.type === 'driver' ? t('cta.talk_to_driver') : t('cta.book_now'))} <CtaIcon size={18} />
              </button>
              {msg && <p data-testid="booking-msg" className="text-sm text-center text-pine font-semibold">{msg}</p>}
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
  return (
    <div className="lg:hidden fixed bottom-16 inset-x-0 z-30 px-4 pb-3">
      <div className="mx-auto max-w-md bg-white rounded-2xl border border-[var(--line)] shadow-[0_-8px_24px_-8px_rgba(20,32,26,0.18)] p-2.5 flex items-center gap-2">
        {item.price > 0 && (
          <div className="pl-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-ink-soft leading-none">{t('common.starting_from')}</div>
            <div className="font-display font-extrabold text-lg text-ink leading-tight">₹{item.price}<span className="text-[10px] text-ink-soft font-semibold">{unit}</span></div>
          </div>
        )}
        <button
          onClick={bookable ? onBook : onOpenMaps}
          disabled={busy}
          data-testid="mobile-sticky-cta"
          className={`ml-auto flex-shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-full font-extrabold btn-hover ${bookable ? cta.color : 'bg-pine text-white'}`}
        >
          {bookable
            ? <><CtaIcon size={16} /> {item.type === 'driver' ? t('cta.talk_to_driver') : t('cta.book_now')}</>
            : <><Navigation size={16} /> {t('cta.get_directions')}</>}
        </button>
      </div>
    </div>
  );
}
