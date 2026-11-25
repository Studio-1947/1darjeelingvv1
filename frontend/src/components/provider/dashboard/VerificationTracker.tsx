import React from 'react';
import { useTranslation } from 'react-i18next';
import { missingLabel } from '@/lib/serverText';
import { Box } from '@/components/ag';
import NextStepCard from './NextStepCard';
import { verificationSteps, type Headline, type VerificationStatus } from '@/lib/verificationSteps';

/**
 * Where a host is on the way to going live: plan paid, documents sent, team reviewing, live
 * (lib/verificationSteps.ts). A rejected document sends them back to "Documents sent" with the
 * team's reason. The app shows the same tracker (src/components/ApprovalNotice.tsx).
 */

export type Verification = {
  status: VerificationStatus;
  action_message: string | null;
  action_document?: string | null;
  /** A document (required or optional) the team turned down and wants sent again. */
  action_required?: boolean;
  support_phone?: string | null;
};

/** "+919800022233" → "+91 98000 22233". */
const NBSP = '\u00a0'; // keeps the number on one line
const prettyPhone = (p: string) => (/^\+91\d{10}$/.test(p) ? `+91${NBSP}${p.slice(3, 8)}${NBSP}${p.slice(8)}` : p);

const HEADLINES: Record<Headline, [string, string]> = {
  pay: ['verify.title_pay', 'verify.body_pay'],
  send: ['verify.title_send', 'verify.body_send'],
  waiting: ['verify.title_waiting', 'verify.body_waiting'],
  reviewing: ['verify.title_reviewing', 'verify.body_reviewing'],
  changes: ['verify.title_changes', 'verify.body_changes'],
  live: ['verify.title_live', 'verify.body_live'],
};

export default function VerificationTracker({ verification, paid, freeStart = false, profileMissing = [], businessType, onOpenProfile, phone, onOpen }: {
  verification?: Verification | null;
  paid: boolean;
  /** On the free start (pay later): the first step is done, but nothing was paid. */
  freeStart?: boolean;
  /** What the business profile still lacks: documents are refused until it is complete. */
  profileMissing?: { key: string; label: string; min?: number; have?: number }[];
  businessType?: string;
  onOpenProfile?: () => void;
  phone?: string | null;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  // Never claim a human review started until the server says so.
  const status = verification?.status ?? 'submitted';
  const { done, total, headline } = verificationSteps(status, paid);
  const [titleKey, bodyKey] = HEADLINES[headline];
  const cta = headline === 'send' ? t('verify.cta_send') : headline === 'changes' ? t('verify.cta_changes') : t('verify.cta_view');
  // Documents are refused until the profile is complete (server 409 profile_incomplete), so that
  // comes first rather than a "Upload documents" button that cannot work yet (persona test 2026-11-09).
  const profileFirst = headline === 'send' && profileMissing.length > 0 && !!onOpenProfile;
  const body = profileFirst ? 'verify.body_profile' : headline === 'send' && freeStart ? 'verify.body_send_free' : bodyKey;

  // The prototype's "Next step · n/4" box (dash.js sdnext), in two lines: the ring with n/4, what to
  // do and one line of detail (the first thing the profile lacks, "+N more" for the rest).
  const detail = profileFirst ? (
    <span data-testid="verification-profile-missing">
      {missingLabel(t, profileMissing[0], businessType)}
      {profileMissing.length > 1 && ` · ${t('host.n_more', { count: profileMissing.length - 1 })}`}
    </span>
  ) : headline === 'reviewing' || headline === 'waiting'
    // While the team checks, the phone matters more than the general wording.
    ? t('verify.keep_phone_body', { phone: phone ? prettyPhone(phone) : t('verify.phone_missing') })
    : t(body);
  const canGo = profileFirst || headline !== 'pay';
  return (
    <NextStepCard testId="verification-tracker" done={done} total={total}
      title={profileFirst ? t('host.finish', 'Finish your profile') : t(titleKey)} detail={detail}
      goLabel={profileFirst ? t('host.finish', 'Finish your profile') : cta}
      onGo={canGo ? (profileFirst ? onOpenProfile : onOpen) : undefined}
      supportPhone={verification?.support_phone}>
      {/* A required document to redo (changes), or an optional one the team turned down: either way, say which and why. */}
      {(headline === 'changes' || verification?.action_required) && (
        <Box tone="blush" flat className="w-full" data-testid="verification-action">
          <span className="ag-eyebrow">{t('verify.action_needed')}</span>
          {verification?.action_document && <b className="text-[var(--ink-strong)]">{verification.action_document}</b>}
          {verification?.action_message && <p className="text-sm text-[var(--ink7)]">{verification.action_message}</p>}
        </Box>
      )}
    </NextStepCard>
  );
}
