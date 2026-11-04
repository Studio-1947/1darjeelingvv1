import React from 'react';
import { CaretDown } from '@phosphor-icons/react';

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
  if (!rows.length) return null;
  const muted = tone === 'dark' ? 'text-white/75' : 'text-current opacity-75';
  const line = tone === 'dark' ? 'border-white/15' : 'border-black/10';
  return (
    <details className="group mt-3" data-testid={testId}>
      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-bold [&::-webkit-details-marker]:hidden">
        How points work
        <CaretDown size={12} weight="bold" className="transition-transform group-open:rotate-180" />
      </summary>
      <ul className="mt-2 min-w-[15rem] max-w-xs space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className={`flex items-baseline justify-between gap-3 border-t pt-1.5 text-xs ${line}`}>
            <span>
              <span className="font-extrabold">+{r.points}</span> <span className={muted}>{r.label}</span>
            </span>
            {r.earned !== undefined && <span className="shrink-0 font-bold">{r.earned.toLocaleString('en-IN')}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Traveller rows, from GET /users/me/dashboard. */
export function travellerPointsRows(
  rules?: Partial<Record<'completedTrip' | 'review' | 'referral' | 'profileComplete' | 'pass', number>>,
  earned?: Partial<Record<'trips' | 'reviews' | 'referrals' | 'profile' | 'pass', number>>,
): PointsRow[] {
  if (!rules) return [];
  const rows: Array<PointsRow | null> = [
    rules.completedTrip != null ? { label: 'each finished trip', points: rules.completedTrip, earned: earned?.trips } : null,
    rules.review != null ? { label: 'each review you write', points: rules.review, earned: earned?.reviews } : null,
    rules.referral != null ? { label: 'each friend who joins with your code', points: rules.referral, earned: earned?.referrals } : null,
    rules.profileComplete != null ? { label: 'completing your profile (once)', points: rules.profileComplete, earned: earned?.profile } : null,
    rules.pass != null ? { label: 'taking the aangan pass (once)', points: rules.pass, earned: earned?.pass } : null,
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
    rules.completedBooking != null ? { label: 'each finished booking', points: rules.completedBooking, earned: earned?.bookings } : null,
    rules.review != null ? { label: 'each guest review', points: rules.review, earned: earned?.reviews } : null,
    rules.fiveStarReview != null ? { label: `each 5-star review (instead of ${rules.review ?? 0})`, points: rules.fiveStarReview } : null,
    rules.verified != null ? { label: 'getting verified (once)', points: rules.verified, earned: earned?.verified } : null,
    rules.profileComplete != null ? { label: 'completing your profile (once)', points: rules.profileComplete, earned: earned?.profile } : null,
  ];
  return rows.filter((r): r is PointsRow => r !== null);
}
