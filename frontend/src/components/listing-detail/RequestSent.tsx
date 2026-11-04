import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, X, ArrowRight, CheckCircle } from '@phosphor-icons/react';
import { formatTripDates } from '@/lib/dates';

/**
 * Board: "Book > Waiting for approval > Call/WhatsApp". Shown after a traveller asks to book a
 * driver, homestay or guide: nothing is confirmed or paid yet, the host accepts first, then the
 * traveller confirms from My Trips.
 */
export default function RequestSent({ booking, title, onClose, onTrips }: {
  booking: any | null;
  title: string;
  onClose: () => void;
  onTrips: () => void;
}) {
  const { t, i18n } = useTranslation();
  if (!booking) return null;
  const steps = [t('approval.step_host'), t('approval.step_confirm'), t('approval.step_contact')];
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog" aria-modal="true" data-testid="booking-request-sent">
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl p-5 md:p-6 animate-fade-up max-h-[90svh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-pine">{t('approval.request_eyebrow')}</div>
            <h2 className="mt-1 font-display font-extrabold text-2xl text-ink leading-tight">{t('approval.request_title')}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close', 'Close')} className="p-1.5 rounded-full hover:bg-mist">
            <X size={18} />
          </button>
        </div>
        <p className="mt-2 text-sm text-ink-soft">{t('approval.request_body', { title })}</p>
        {booking.check_in && (
          <p className="mt-3 text-sm font-semibold text-ink">
            {formatTripDates(booking.check_in, booking.check_out, i18n.language)}
          </p>
        )}
        <div className="mt-4 rounded-2xl bg-[#F4F7F6] border border-[var(--line)] p-4">
          <div className="text-xs font-bold uppercase tracking-widest text-ink-soft">{t('approval.next_steps')}</div>
          <ol className="mt-2 space-y-2">
            {steps.map((s, i) => (
              <li key={s} className="flex items-start gap-2 text-sm text-ink">
                {i === 0 ? <Clock size={16} className="mt-0.5 text-[#7a5d00] flex-shrink-0" /> : <CheckCircle size={16} className="mt-0.5 text-pine flex-shrink-0" />}
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <button type="button" onClick={onTrips} data-testid="request-go-trips"
          className="mt-5 w-full inline-flex items-center justify-center gap-1.5 h-[50px] rounded-full bg-[#1F6656] text-white font-bold text-[15px] btn-hover">
          {t('approval.go_trips')} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
