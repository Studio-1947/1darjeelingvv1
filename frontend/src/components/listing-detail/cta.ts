import { ArrowRight, Phone, Storefront as Store, Coffee, Ticket, Leaf, Mountains as Mountain } from '@phosphor-icons/react';

// Contextual CTA per listing type: i18n key, icon, and button colour.
export const CTA_CONFIG = {
  homestay: { key: 'book_now', Icon: ArrowRight, color: 'bg-pine text-white' },
  driver: { key: 'talk_to_driver', Icon: Phone, color: 'bg-pine text-white' },
  guide: { key: 'request_guide', Icon: ArrowRight, color: 'bg-pine text-white' },
  shop: { key: 'contact_shop', Icon: Store, color: 'bg-ink text-white' },
  cafe: { key: 'visit_cafe', Icon: Coffee, color: 'bg-ink text-white' },
  event: { key: 'join_event', Icon: Ticket, color: 'bg-pine text-white' },
  biodiversity: { key: 'learn_more', Icon: Leaf, color: 'bg-pine text-white' },
  spot: { key: 'explore', Icon: Mountain, color: 'bg-pine text-white' },
};

/**
 * A homestay with a real host takes requests (the host accepts first), so its button says
 * "Request to book" instead of "Reserve". Drivers and guides already read as requests.
 */
export function ctaFor(type: string, requestToBook = false) {
  if (type === 'homestay' && requestToBook) return { ...CTA_CONFIG.homestay, key: 'request_to_book' };
  return CTA_CONFIG[type] || CTA_CONFIG.spot;
}
