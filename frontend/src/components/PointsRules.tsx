import React from 'react';
import { useTranslation } from 'react-i18next';
import { CaretDown } from '@phosphor-icons/react';
import i18n from '@/i18n';

export type PointsRow = {
  /** How the points are earned, in the user's words. */
  label: string;
  /** Points per time (from the server's points_rules). */
  points: number;
  /** Points earned this way so far, when the server says. */
  earned?: number;
};

/**
 * "How points work": every way to earn Aangan Points, with what it is worth and what the user has
 * earned from it so far. The numbers come from the dashboard response (points_rules), so this list
 * cannot drift from what the server counts. Renders nothing when an older server sends no rules.
 */
export default function PointsRules({ rows, tone = 'light', testId }: { rows: PointsRow[]; tone?: 'light' | 'dark'; testId?: string }) {
  const { t } = useTranslation();
  if (!rows.length) return null;
  const muted = tone === 'dark' ? 'text-white/75' : 'text-[var(--ink-muted)]';
  const line = tone === 'dark' ? 'border-white/15' : 'border-[var(--warmline)]';
  const head = tone === 'dark' ? '' : 'text-[var(--r)]';
  return (
    <details className="group mt-3" data-testid={testId}>
      <summary className={`flex cursor-pointer list-none items-center gap-1 text-sm font-medium [&::-webkit-details-marker]:hidden ${head}`}>
        {t('ui.pointsRules.how_points_work')}
        <CaretDown size={14} weight="bold" className="transition-transform group-open:rotate-180" />
      </summary>
      <ul className="mt-2 grid w-full gap-1.5">
        {rows.map((r) => (
          <li key={r.label} className={`flex items-baseline justify-between gap-3 border-t pt-1.5 text-sm ${line}`}>
            <span>
              <b className="font-medium">+{r.points}</b> <span className={muted}>{r.label}</span>
            </span>
            {r.earned !== undefined && <span className="shrink-0 font-medium tabular-nums">{r.earned.toLocaleString('en-IN')}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Traveller rows, from GET /users/me/dashboard. Labels are translated when this is called (at render). */
export function travellerPointsRows(
  rules?: Partial<Record<'completedTrip' | 'review' | 'referral' | 'profileComplete' | 'pass', number>>,
  earned?: Partial<Record<'trips' | 'reviews' | 'referrals' | 'profile' | 'pass', number>>,
): PointsRow[] {
  if (!rules) return [];
  const rows: Array<PointsRow | null> = [
    rules.completedTrip != null ? { label: i18n.t('ui.pointsRules.each_finished_trip'), points: rules.completedTrip, earned: earned?.trips } : null,
    rules.review != null ? { label: i18n.t('ui.pointsRules.each_review_you_write'), points: rules.review, earned: earned?.reviews } : null,
    rules.referral != null ? { label: i18n.t('ui.pointsRules.each_friend_joins'), points: rules.referral, earned: earned?.referrals } : null,
    rules.profileComplete != null ? { label: i18n.t('ui.pointsRules.completing_profile'), points: rules.profileComplete, earned: earned?.profile } : null,
    rules.pass != null ? { label: i18n.t('ui.pointsRules.taking_pass'), points: rules.pass, earned: earned?.pass } : null,
  ];
  return rows.filter((r): r is PointsRow => r !== null);
}

/** Host rows, from GET /providers/me/stats. A 5-star review earns its own amount, not review + bonus. */
export function hostPointsRows(
  rules?: Partial<Record<'completedBooking' | 'review' | 'fiveStarReview' | 'verified' | 'profileComplete', number>>,
  earned?: Partial<Record<'bookings' | 'reviews' | 'verified' | 'profile', number>>,
): PointsRow[] {
  if (!rules) return [];
  const rows: Array<PointsRow | null> = [
    rules.completedBooking != null ? { label: i18n.t('ui.pointsRules.each_finished_booking'), points: rules.completedBooking, earned: earned?.bookings } : null,
    rules.review != null ? { label: i18n.t('ui.pointsRules.each_guest_review'), points: rules.review, earned: earned?.reviews } : null,
    rules.fiveStarReview != null ? { label: i18n.t('ui.pointsRules.each_five_star_review', { n: rules.review ?? 0 }), points: rules.fiveStarReview } : null,
    rules.verified != null ? { label: i18n.t('ui.pointsRules.getting_verified'), points: rules.verified, earned: earned?.verified } : null,
    rules.profileComplete != null ? { label: i18n.t('ui.pointsRules.completing_profile'), points: rules.profileComplete, earned: earned?.profile } : null,
  ];
  return rows.filter((r): r is PointsRow => r !== null);
}
