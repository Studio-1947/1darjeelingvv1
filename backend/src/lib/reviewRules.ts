import { CODE_PREFIX } from './referrals';

/**
 * A referral code inside review text ("Very good ANG26-4AWLNE"). People pasted their invite code
 * into the review box to share it; a review is about the place, so the code is refused there and
 * the person is pointed to Refer a friend.
 */
export const REFERRAL_CODE_IN_TEXT = new RegExp(String.raw`\b${CODE_PREFIX}-?[A-Z0-9]{4,}\b`, 'i');

export const REFERRAL_IN_REVIEW_DETAIL =
  'Reviews are about the place, so they cannot carry a referral code. Share your code from Refer a friend instead.';
