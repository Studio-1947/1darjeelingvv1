import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatTripDates } from '@/lib/dates';
import { Box, Button } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';

/**
 * Board: "Book > Waiting for approval > Call/WhatsApp". The screen after a traveller asks to book a
 * driver, homestay or guide (prototype V.done 'sent'): nothing is confirmed or paid yet; the host
 * accepts first, then the traveller confirms from My Trips.
 */
export default function RequestSent({ booking, title, onTrips }: {
  booking: any | null;
  title: string;
  onTrips: () => void;
}) {
  const { t, i18n } = useTranslation();
  if (!booking) return null;
  return (
    <div className="ag-main">
      <Box className="ag-listing-done" data-testid="booking-request-sent" role="status">
        <span className="dot" aria-hidden="true"><Icon name="check" /></span>
        <h1 id="request-sent-title">{t('listing.sent', 'Request sent')}</h1>
        <p className="m-0">{t('approval.request_title')}</p>
        <p className="ag-small m-0">{t('approval.request_body', { title })}</p>
        {booking.check_in && <p className="ag-lead m-0">{formatTripDates(booking.check_in, booking.check_out, i18n.language)}</p>}
        <Button variant="primary" onClick={onTrips} data-testid="request-go-trips" autoFocus>
          {t('listing.seetrips', 'See my trips')}
        </Button>
      </Box>
    </div>
  );
}
