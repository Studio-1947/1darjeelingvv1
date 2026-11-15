import React from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, CheckCircle } from '@phosphor-icons/react';
import { formatTripDates } from '@/lib/dates';
import { Box, Button } from '@/components/ag';
import Sheet from './Sheet';

/**
 * Board: "Book > Waiting for approval > Call/WhatsApp". Shown after a traveller asks to book a
 * driver, homestay or guide: nothing is confirmed or paid yet, the host accepts first, then the
 * traveller confirms from My Trips. Prototype: the "Request sent" done screen.
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
    <Sheet onClose={onClose} labelledBy="request-sent-title" testid="booking-request-sent">
      <div className="ag-done !py-2">
        <span className="big !bg-[var(--pending-bg)] !text-[var(--pending)]"><Clock aria-hidden="true" /></span>
        <div className="flex flex-col gap-1">
          <span className="ag-eyebrow">{t('approval.request_eyebrow')}</span>
          <h2 id="request-sent-title" className="!text-[22px] !leading-7">{t('approval.request_title')}</h2>
        </div>
        <p className="ag-small !text-[var(--ink7)]">{t('approval.request_body', { title })}</p>
        {booking.check_in && (
          <p className="ag-lead">{formatTripDates(booking.check_in, booking.check_out, i18n.language)}</p>
        )}
      </div>
      <Box flat className="!bg-[var(--surface)]">
        <span className="ag-eyebrow">{t('approval.next_steps')}</span>
        <ol className="grid gap-2">
          {steps.map((s, i) => (
            <li key={s} className="flex items-start gap-2 ag-small !text-[var(--ink-strong)]">
              {i === 0
                ? <Clock className="mt-0.5 w-[18px] h-[18px] flex-none text-[var(--pending)]" aria-hidden="true" />
                : <CheckCircle className="mt-0.5 w-[18px] h-[18px] flex-none text-[var(--r)]" aria-hidden="true" />}
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </Box>
      <Button variant="primary" go block onClick={onTrips} data-testid="request-go-trips" data-autofocus>
        {t('approval.go_trips')}
      </Button>
    </Sheet>
  );
}
