import React from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, MessageCircle, Navigation, CalendarPlus } from 'lucide-react';
import { Screen, SectionHead } from './primitives';

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
  const note = isEvent
    ? 'Reach the organizer directly, add it to your calendar, or get directions.'
    : 'Drop by, or reach out directly before you go.';

  const waText = encodeURIComponent(`Hi! I found ${item.title} on 1 Darjeeling and would like to know more.`);

  return (
    <Screen tone="white" testid="detail-contact">
      <SectionHead label={t('detail.reserve')} title={title} note={note} />
      <div className="mt-10 mx-auto max-w-xl">
        <div className="mist-panel p-6 md:p-8 space-y-3">
          {phone ? (
            <>
              <a href={`tel:${phone}`} data-testid="contact-call"
                className="w-full py-4 rounded-full font-bold btn-hover inline-flex items-center justify-center gap-2 bg-pine text-white">
                <Phone size={18} /> {isEvent ? 'Call organizer' : 'Call now'}
              </a>
              <a href={`https://wa.me/${waNumber}?text=${waText}`} target="_blank" rel="noreferrer" data-testid="contact-whatsapp"
                className="w-full py-4 rounded-full font-bold btn-hover inline-flex items-center justify-center gap-2 bg-[#25D366] text-white">
                <MessageCircle size={18} /> WhatsApp
              </a>
            </>
          ) : (
            <p className="text-center text-sm text-ink-soft">
              No direct contact listed - use directions below to visit in person.
            </p>
          )}

          {calUrl && (
            <a href={calUrl} target="_blank" rel="noreferrer" data-testid="contact-calendar"
              className="w-full py-4 rounded-full font-bold btn-hover inline-flex items-center justify-center gap-2 bg-flag text-white">
              <CalendarPlus size={18} /> Add to calendar
            </a>
          )}

          <button onClick={onOpenMaps} data-testid="contact-directions"
            className="w-full py-4 rounded-full font-bold btn-hover inline-flex items-center justify-center gap-2 bg-white border border-[var(--line)] text-ink">
            <Navigation size={18} /> {t('cta.get_directions')}
          </button>
        </div>
      </div>
    </Screen>
  );
}
