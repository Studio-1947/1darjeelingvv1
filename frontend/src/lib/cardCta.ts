/**
 * The label on a listing card's button.
 *
 * A card navigates to the listing - it never books a room, rings a driver or
 * reserves a table. The buttons used to say "Reserve Now" and "Talk to Driver",
 * promising something the card cannot do; a visitor who taps expecting to book
 * lands on a page and has to start again (QA 4.7).
 *
 * "Explore" and "Learn more" already described a navigation honestly, so those
 * two types keep their own wording. Everything else says what actually happens.
 */
const CARD_CTA_KEY: Record<string, string> = {
  spot: 'cta.explore',
  biodiversity: 'cta.learn_more',
};

export function cardCtaKey(type: string): string {
  return CARD_CTA_KEY[type] || 'common.view_details';
}
