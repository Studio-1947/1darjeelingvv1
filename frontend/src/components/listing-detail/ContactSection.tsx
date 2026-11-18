import React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ag/Icon';
import { Button, ButtonA } from '@/components/ag';
import { Section } from './primitives';

/**
 * A Google Calendar "add event" link, but only when the listing carries a real ISO date in
 * extras.event_date / extras.date - never a guessed one, so we don't add wrong dates to calendars.
 */
function googleCalendarUrl(item: any): string | null {
  const raw = item.extras?.event_date || item.extras?.date;
  if (!raw) return null;
  const start = new Date(raw);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // assume ~2h if no end given
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: item.title || 'Event',
    dates: `${fmt(start)}/${fmt(end)}`,
    details: item.description || '',
    location: item.location || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Action screen for listings you don't book online - shops, cafes, and events. */
export default function ContactSection({ item, onOpenMaps }: { item: any; onOpenMaps: () => void }) {
  const { t } = useTranslation();
  const phone: string | null = item.provider_phone || null;
  const waNumber = phone ? phone.replace(/\D/g, '') : '';
  const isEvent = item.type === 'event';
  const calUrl = isEvent ? googleCalendarUrl(item) : null;

  const title = item.type === 'shop' ? t('cta.contact_shop')
    : item.type === 'cafe' ? t('cta.visit_cafe')
    : t('cta.join_event');
  const note = isEvent ? t('contact.event_note') : t('contact.place_note');

  const waText = encodeURIComponent(t('contact.wa_message', { title: item.title }));

  return (
    <Section title={title} note={note} testid="detail-contact">
      {!phone && <p className="ag-small">{t('contact.no_contact')}</p>}
      {/* The prototype's contact row (trip card .sitebtns): Call, WhatsApp, Direction as tonal pills. */}
      <div className="ag-listing-acts">
        {phone && (
          <ButtonA variant="tonal" href={`tel:${phone}`} data-testid="contact-call" icon={<Icon name="phone" />}>
            {isEvent ? t('contact.call_organizer') : t('listing.call', 'Call')}
          </ButtonA>
        )}
        {phone && (
          <ButtonA variant="tonal" href={`https://wa.me/${waNumber}?text=${waText}`} target="_blank" rel="noreferrer" data-testid="contact-whatsapp"
            icon={<Icon name="wa" />}>
            WhatsApp
          </ButtonA>
        )}
        <Button variant="tonal" onClick={onOpenMaps} data-testid="contact-directions" icon={<Icon name="pin" />}>
          {t('listing.direction', 'Direction')}
        </Button>
        {calUrl && (
          <ButtonA variant="tonal" href={calUrl} target="_blank" rel="noreferrer" data-testid="contact-calendar" icon={<Icon name="t_trip" />}>
            {t('contact.add_to_calendar')}
          </ButtonA>
        )}
      </div>
    </Section>
  );
}
