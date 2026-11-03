/**
 * Where a host is on the way to going live, as four steps both apps show the same way:
 *
 *   1. Plan paid  →  2. Documents sent  →  3. Team reviewing  →  4. Live
 *
 * The server says where the documents are (GET /providers/me/profile → `verification.status`);
 * whether the plan is paid comes from the provider. A rejected document sends the host back to
 * step 2, marked as needing attention, with the team's reason shown alongside.
 *
 * The app has the same file (src/lib/verificationSteps.ts). Keep them identical.
 */

export type VerificationStatus = 'not_ready' | 'submitted' | 'in_review' | 'changes_requested' | 'approved';
export type StepKey = 'paid' | 'sent' | 'review' | 'live';
export type StepState = 'done' | 'current' | 'attention' | 'todo';
export type Headline = 'pay' | 'send' | 'waiting' | 'reviewing' | 'changes' | 'live';

export const STEP_KEYS: StepKey[] = ['paid', 'sent', 'review', 'live'];

export function verificationSteps(
  status: VerificationStatus | undefined,
  paid: boolean
): { steps: { key: StepKey; state: StepState }[]; done: number; total: number; headline: Headline } {
  const s: VerificationStatus = status ?? 'not_ready';
  let done: number;
  let current: StepKey | null;
  let headline: Headline;
  let attention = false;

  if (!paid) {
    done = 0; current = 'paid'; headline = 'pay';
  } else if (s === 'approved') {
    done = 4; current = null; headline = 'live';
  } else if (s === 'changes_requested') {
    done = 1; current = 'sent'; headline = 'changes'; attention = true;
  } else if (s === 'in_review') {
    done = 2; current = 'review'; headline = 'reviewing';
  } else if (s === 'submitted') {
    done = 2; current = 'review'; headline = 'waiting';
  } else {
    done = 1; current = 'sent'; headline = 'send';
  }

  const steps = STEP_KEYS.map((key, i) => ({
    key,
    state: (i < done ? 'done' : key === current ? (attention ? 'attention' : 'current') : 'todo') as StepState,
  }));
  return { steps, done, total: STEP_KEYS.length, headline };
}
