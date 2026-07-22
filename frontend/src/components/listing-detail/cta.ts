import { ArrowRight, Phone, Store, Coffee, Ticket, Leaf, Mountain } from 'lucide-react';

// Contextual CTA per listing type: i18n key, icon, and button colour.
export const CTA_CONFIG = {
  homestay: { key: 'book_now', Icon: ArrowRight, color: 'bg-flag text-white' },
  driver: { key: 'talk_to_driver', Icon: Phone, color: 'bg-pine text-white' },
  shop: { key: 'contact_shop', Icon: Store, color: 'bg-ink text-white' },
  cafe: { key: 'visit_cafe', Icon: Coffee, color: 'bg-ink text-white' },
  event: { key: 'join_event', Icon: Ticket, color: 'bg-flag text-white' },
  biodiversity: { key: 'learn_more', Icon: Leaf, color: 'bg-pine text-white' },
  spot: { key: 'explore', Icon: Mountain, color: 'bg-pine text-white' },
};

export function ctaFor(type: string) {
  return CTA_CONFIG[type] || CTA_CONFIG.spot;
}
