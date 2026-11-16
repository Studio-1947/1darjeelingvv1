import React from 'react';
import { useTranslation } from 'react-i18next';
import { missingLabel } from '@/lib/serverText';
import { Check, Phone } from '@phosphor-icons/react';
import { Box, Button, ButtonA, StepBar } from '@/components/ag';
import { verificationSteps, type Headline, type StepKey, type VerificationStatus } from '@/lib/verificationSteps';

/**
 * Where a host is on the way to going live: plan paid, documents sent, team reviewing, live
 * (lib/verificationSteps.ts). A rejected document sends them back to "Documents sent" with the
 * team's reason. The app shows the same tracker (src/components/ApprovalNotice.tsx).
 */

export type Verification = {
  status: VerificationStatus;
  action_message: string | null;
  action_document?: string | null;
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
  const { steps, done, total, headline } = verificationSteps(status, paid);
  const [titleKey, bodyKey] = HEADLINES[headline];
  const cta = headline === 'send' ? t('verify.cta_send') : headline === 'changes' ? t('verify.cta_changes') : t('verify.cta_view');
  const label = (k: StepKey) => t(k === 'paid' && freeStart ? 'verify.step_free' : `verify.step_${k}`);
  // Documents are refused until the profile is complete (server 409 profile_incomplete), so that
  // comes first rather than a "Upload documents" button that cannot work yet (persona test 2026-11-09).
  const profileFirst = headline === 'send' && profileMissing.length > 0 && !!onOpenProfile;
  const body = profileFirst ? 'verify.body_profile' : headline === 'send' && freeStart ? 'verify.body_send_free' : bodyKey;

  return (
    <Box as="section" data-testid="verification-tracker">
      <div>
        <span className="ag-eyebrow">{t('verify.progress')} · {done}/{total}</span>
        <h2>{t(profileFirst ? 'verify.title_profile' : titleKey)}</h2>
        <p className="ag-small">{t(body)}</p>
      </div>
      {profileFirst && (
        <ul className="grid gap-1 text-sm text-[var(--ink-strong)]" data-testid="verification-profile-missing">
          {profileMissing.map((m) => <li key={m.key}>• {missingLabel(t, m, businessType)}</li>)}
        </ul>
      )}

      <StepBar total={total} at={done - 1} label={t('verify.progress')} />
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2" data-testid={`verification-step-${s.key}-${s.state}`}>
            <span className={`grid h-6 w-6 flex-none place-items-center rounded-full text-xs ${
              s.state === 'done' ? 'bg-[var(--r)] text-[var(--on-r)]'
                : s.state === 'attention' ? 'bg-[var(--fail)] text-[var(--on-r)]'
                : s.state === 'current' ? 'border border-[var(--r)] text-[var(--r)]'
                : 'border border-[var(--outline)] text-[var(--ink-muted)]'}`} aria-hidden="true">
              {s.state === 'done' ? <Check size={13} weight="bold" /> : s.state === 'attention' ? '!' : i + 1}
            </span>
            <span className={`text-sm ${s.state === 'attention' ? 'text-[var(--fail)]' : s.state === 'todo' ? 'text-[var(--ink-muted)]' : 'text-[var(--ink-strong)] font-medium'}`}>
              {label(s.key)}
            </span>
          </li>
        ))}
      </ol>

      {headline === 'changes' && (
        <Box tone="blush" flat data-testid="verification-action">
          <span className="ag-eyebrow">{t('verify.action_needed')}</span>
          {verification?.action_document && <b className="text-[var(--ink-strong)]">{verification.action_document}</b>}
          {verification?.action_message && <p className="text-sm text-[var(--ink7)]">{verification.action_message}</p>}
        </Box>
      )}

      {headline !== 'live' && headline !== 'pay' && (
        <div>
          <span className="ag-eyebrow">{t('verify.keep_phone_title')}</span>
          <p className="ag-small">{t('verify.keep_phone_body', { phone: phone ? prettyPhone(phone) : t('verify.phone_missing') })}</p>
        </div>
      )}

      <div className="ag-row">
        <Button variant="primary" go onClick={profileFirst ? onOpenProfile : onOpen} data-testid="verification-cta">
          {profileFirst ? t('verify.cta_profile') : cta}
        </Button>
        {verification?.support_phone && (
          <ButtonA variant="text" href={`tel:${verification.support_phone}`} icon={<Phone />}>{t('verify.call_support')}</ButtonA>
        )}
      </div>
    </Box>
  );
}
