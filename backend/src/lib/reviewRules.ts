import { CODE_PREFIX } from './referrals';

/**
 * A referral code inside review text ("Very good ANG26-4AWLNE"). People pasted their invite code
 * into the review box to share it; a review is about the place, so the code is refused there and
 * the person is pointed to Refer a friend.
 */
export const REFERRAL_CODE_IN_TEXT = new RegExp(String.raw`\b${CODE_PREFIX}-?[A-Z0-9]{4,}\b`, 'i');

export const REFERRAL_IN_REVIEW_DETAIL =
  'Reviews are about the place, so they cannot carry a referral code. Share your code from Refer a friend instead.';

/**
 * Hosts people book through aangan. A review of one needs a completed booking with it: with the
 * pass at ₹1, letting any pass holder review any homestay made fake or spiteful reviews nearly
 * free (audit 2026-11-08). Cafes, shops, spots, events and nature stay open to pass holders,
 * because people walk into those without booking.
 */
export const STAY_REQUIRED_TYPES = new Set(['homestay', 'driver', 'guide']);

export const STAY_REQUIRED_DETAIL = 'You can review this host after a completed booking with them.';

export type ReviewEligibility =
  | { allowed: true }
  | { allowed: false; code: 'stay_required' | 'support_required'; detail: string };

/**
 * Who may review a listing: anyone who finished a booking with it; otherwise a pass holder (or a
 * pass-exempt account), except for the hosts in STAY_REQUIRED_TYPES.
 */
export function reviewEligibility(opts: { listingType: string; hasCompletedBooking: boolean; hasPass: boolean }): ReviewEligibility {
  if (opts.hasCompletedBooking) return { allowed: true };
  if (STAY_REQUIRED_TYPES.has(opts.listingType)) {
    return { allowed: false, code: 'stay_required', detail: STAY_REQUIRED_DETAIL };
  }
  if (opts.hasPass) return { allowed: true };
  return { allowed: false, code: 'support_required', detail: 'The aangan pass is required before you can do this.' };
}
