// The booking button's label per listing type (an i18n key under `cta.`).
export const CTA_CONFIG: Record<string, { key: string }> = {
  homestay: { key: 'book_now' },
  driver: { key: 'request_driver' },
  guide: { key: 'request_guide' },
  shop: { key: 'contact_shop' },
  cafe: { key: 'visit_cafe' },
  event: { key: 'join_event' },
  biodiversity: { key: 'learn_more' },
  spot: { key: 'explore' },
};

/**
 * A homestay with a real host takes requests (the host accepts first), so its button says
 * "Request to book" instead of "Reserve". Drivers and guides already read as requests.
 */
export function ctaFor(type: string, requestToBook = false) {
  if (type === 'homestay' && requestToBook) return { ...CTA_CONFIG.homestay, key: 'request_to_book' };
  return CTA_CONFIG[type] || CTA_CONFIG.spot;
}
