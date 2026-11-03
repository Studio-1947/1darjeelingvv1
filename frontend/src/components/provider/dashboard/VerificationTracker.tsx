import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Phone } from '@phosphor-icons/react';
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
const prettyPhone = (p: string) => (/^\+91\d{10}$/.test(p) ? `+91 ${p.slice(3, 8)} ${p.slice(8)}` : p);

const HEADLINES: Record<Headline, [string, string]> = {
  pay: ['verify.title_pay', 'verify.body_pay'],
  send: ['verify.title_send', 'verify.body_send'],
  waiting: ['verify.title_waiting', 'verify.body_waiting'],
  reviewing: ['verify.title_reviewing', 'verify.body_reviewing'],
  changes: ['verify.title_changes', 'verify.body_changes'],
  live: ['verify.title_live', 'verify.body_live'],
};

export default function VerificationTracker({ verification, paid, phone, onOpen }: {
  verification?: Verification | null;
  paid: boolean;
  phone?: string | null;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  // Never claim a human review started until the server says so.
  const status = verification?.status ?? 'submitted';
  const { steps, done, total, headline } = verificationSteps(status, paid);
  const [titleKey, bodyKey] = HEADLINES[headline];
  const cta = headline === 'send' ? t('verify.cta_send') : headline === 'changes' ? t('verify.cta_changes') : t('verify.cta_view');
  const label = (k: StepKey) => t(`verify.step_${k}`);

  return (
    <div className="mt-8 rounded-2xl border border-gold bg-white p-5 md:p-6" data-testid="verification-tracker">
      <h2 className="font-display font-extrabold text-lg text-ink">{t(titleKey)}</h2>
      <p className="mt-1 text-sm text-ink-soft">{t(bodyKey)}</p>

      <div className="mt-4 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest">
        <span className="text-pine">{t('verify.progress')}</span>
        <span className="text-ink-soft">{done}/{total}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-mist overflow-hidden">
        <div className="h-full rounded-full bg-pine transition-all" style={{ width: `${(done / total) * 100}%` }} />
      </div>

      <ol className="mt-4 grid gap-2 sm:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2" data-testid={`verification-step-${s.key}-${s.state}`}>
            <span className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold flex-shrink-0 ${
              s.state === 'done' ? 'bg-pine text-white'
                : s.state === 'attention' ? 'bg-flag text-white'
                : 'bg-mist text-ink-soft border border-[var(--line)]'}`}>
              {s.state === 'done' ? '✓' : s.state === 'attention' ? '!' : i + 1}
            </span>
            <span className={`text-sm ${s.state === 'attention' ? 'font-bold text-flag' : s.state === 'current' ? 'font-bold text-ink' : 'text-ink-soft'}`}>
              {label(s.key)}
            </span>
          </li>
        ))}
      </ol>

      {headline === 'changes' && (
        <div className="mt-4 rounded-xl bg-[#FFF1EC] px-4 py-3" data-testid="verification-action">
          <p className="text-[11px] font-bold uppercase tracking-widest text-flag">{t('verify.action_needed')}</p>
          {verification?.action_document && <p className="mt-1 text-sm font-bold text-ink">{verification.action_document}</p>}
          {verification?.action_message && <p className="mt-0.5 text-sm text-ink">{verification.action_message}</p>}
        </div>
      )}

      {headline !== 'live' && headline !== 'pay' && (
        <div className="mt-4 rounded-xl bg-pine/5 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-pine">{t('verify.keep_phone_title')}</p>
          <p className="mt-1 text-sm text-ink-soft">{t('verify.keep_phone_body', { phone: phone ? prettyPhone(phone) : t('verify.phone_missing') })}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={onOpen} data-testid="verification-cta"
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#1F6656] text-white font-bold text-sm btn-hover">
          {cta} <ArrowRight size={14} />
        </button>
        {verification?.support_phone && (
          <a href={`tel:${verification.support_phone}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-pine">
            <Phone size={16} /> {t('verify.call_support')}
          </a>
        )}
      </div>
    </div>
  );
}
