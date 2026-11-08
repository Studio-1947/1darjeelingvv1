import React from 'react';
import { useTranslation } from 'react-i18next';
import { Browser, House, MapTrifold, Storefront } from '@phosphor-icons/react';
import PriceBreakup from '@/components/PriceBreakup';
import { isSmallHostType, rupees, useHostPlanPrice } from '@/lib/prices';

export type StartMode = 'later' | 'now';

/** Which pricing card a business type sees: homestays and drivers, shops and restaurants, guides. */
export function planCardKind(type?: string | null): 'full' | 'small' | 'guide' {
  if (type === 'guide') return 'guide';
  return isSmallHostType(type) ? 'small' : 'full';
}

/**
 * The host pricing card (pricing cards, 2026-11-08): ₹499 a year for homestays and drivers, ₹99 for
 * shops, restaurants and guides, billed once a year. The host picks Pay later (go live free, pay
 * after the first bookings) or Pay now. GST and the 2% fee are added at checkout, so the breakup
 * shows under Pay now before anything is charged. The app shows the same card
 * (src/provider/form/HostPlanOffer.tsx).
 */
export default function HostPlanOffer({ type, mode, onMode, graceBookings, onStart, blocked, busy }: {
  type?: string;
  mode: StartMode;
  onMode: (mode: StartMode) => void;
  graceBookings: number;
  onStart: () => void;
  blocked: boolean;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const plan = useHostPlanPrice(type);
  const kind = planCardKind(type);
  const price = rupees(plan.base);
  const Icon = kind === 'full' ? House : kind === 'guide' ? MapTrifold : Storefront;
  const option = (value: StartMode) =>
    `w-full text-left flex items-start gap-3 rounded-2xl border p-4 transition-colors ${
      mode === value ? 'border-2 border-[var(--button)] bg-[#EEF4F1]' : 'border-[var(--line)] bg-white hover:bg-mist/40'
    }`;
  const dot = (value: StartMode) => (
    <span aria-hidden="true" className={`mt-0.5 grid place-items-center w-5 h-5 shrink-0 rounded-full border-2 ${mode === value ? 'border-[var(--button)]' : 'border-ink-soft/50'}`}>
      {mode === value && <span className="w-2.5 h-2.5 rounded-full bg-[var(--button)]" />}
    </span>
  );

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm border border-[var(--line)]" data-testid="host-plan-offer" data-kind={kind}>
      <div className="flex items-center gap-3">
        <span className="grid place-items-center w-10 h-10 rounded-xl bg-[var(--button)] text-white shrink-0"><Icon size={20} weight="bold" /></span>
        <span className="font-display font-bold text-ink">{t(`plan_card.eyebrow_${kind}`)}</span>
      </div>
      <h3 className="mt-4 font-display font-extrabold text-2xl md:text-[28px] leading-tight text-ink">{t(`plan_card.title_${kind}`)}</h3>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <span className="font-display font-extrabold text-4xl md:text-5xl text-[var(--button)]" data-testid="host-plan-price">{price}</span>
        <span className="text-sm text-ink-soft">{t('plan_card.per_year')}</span>
      </div>
      {kind !== 'full' && <p className="mt-3 text-sm text-ink leading-relaxed">{t(`plan_card.body_${kind}`)}</p>}

      <p className="mt-5 text-xs font-bold uppercase tracking-widest text-ink-soft">{t('plan_card.choose')}</p>
      <div className="mt-2 space-y-2.5" role="radiogroup" aria-label={t('plan_card.choose')}>
        <button type="button" role="radio" aria-checked={mode === 'later'} onClick={() => onMode('later')} className={option('later')} data-testid="plan-later">
          {dot('later')}
          <span>
            <span className="block font-bold text-ink">{t('plan_card.later_title')}</span>
            <span className="block mt-0.5 text-sm font-normal text-ink-soft">
              {t(kind === 'small' ? 'plan_card.later_body_small' : 'plan_card.later_body', { price, count: graceBookings })}
            </span>
          </span>
        </button>
        <button type="button" role="radio" aria-checked={mode === 'now'} onClick={() => onMode('now')} className={option('now')} data-testid="plan-now">
          {dot('now')}
          <span>
            <span className="block font-bold text-ink">{t('plan_card.now_title')}</span>
            <span className="block mt-0.5 text-sm font-normal text-ink-soft">{t('plan_card.now_body', { price })}</span>
          </span>
        </button>
      </div>
      {mode === 'now' && (
        <PriceBreakup breakup={plan} label={t('price.host_first_year')} compact className="mt-3" />
      )}

      <div className="mt-4 flex items-start gap-3 rounded-2xl bg-[#FAF1E1] p-4">
        <Browser size={22} className="text-[#8B5A16] shrink-0 mt-0.5" />
        <p className="text-sm text-ink leading-relaxed">
          <strong>{t('plan_card.site_lead')}</strong> {t(`plan_card.site_${kind}`)}
        </p>
      </div>

      <button type="button" onClick={onStart} disabled={blocked || busy} data-testid="onboard-submit"
        className="mt-5 w-full py-4 rounded-2xl bg-[var(--button)] text-white font-extrabold text-base btn-hover disabled:opacity-60">
        {busy ? t('common.processing') : mode === 'later' ? t(`plan_card.cta_later_${kind}`) : t(`plan_card.cta_now_${kind}`, { price })}
      </button>
    </div>
  );
}
