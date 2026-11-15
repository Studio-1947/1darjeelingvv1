import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from '@phosphor-icons/react';
import { rupees, usePrice } from '@/lib/prices';

/**
 * The aangan pass card (pricing cards, 2026-11-08): ₹1 for the first year, then ₹12 a year, GST
 * included, so that is exactly what the traveller pays. Someone who has held a pass before sees
 * the ₹12 yearly price. The app shows the same card (src/components/PassOffer.tsx).
 */
export default function PassOffer({ renewing, compact = false, className = '' }: {
  /** Has held a pass before: the price is ₹12 a year. */
  renewing: boolean;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const first = usePrice('platform_support');
  const yearly = usePrice('platform_support_renewal');
  return (
    <div className={`flex flex-col gap-1 text-left ${className}`} data-testid="pass-offer">
      {!compact && <span className="ag-eyebrow">{t('pass_card.title')}</span>}
      <p className={`font-medium text-[var(--r)] ${compact ? 'text-xl leading-7' : 'text-[34px] leading-[38px] tracking-[-0.03em]'}`} data-testid="pass-offer-price">
        {renewing ? t('pass_card.yearly', { price: rupees(yearly.total) }) : t('pass_card.first_year', { price: rupees(first.total) })}
      </p>
      <p className="ag-small">
        {renewing ? t('pass_card.billed') : t('pass_card.then', { price: rupees(yearly.total) })}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-[var(--ink7)]">
        <li className="flex items-start gap-2"><Check size={16} weight="bold" className="mt-0.5 flex-none text-[var(--ok)]" aria-hidden="true" />{t('pass_card.what')}</li>
        <li className="flex items-start gap-2 font-medium text-[var(--ink-strong)]"><Check size={16} weight="bold" className="mt-0.5 flex-none text-[var(--ok)]" aria-hidden="true" />{t('pass_card.no_hidden')}</li>
        <li className="flex items-start gap-2"><Check size={16} weight="bold" className="mt-0.5 flex-none text-[var(--ok)]" aria-hidden="true" />{t('pass_card.pay_host')}</li>
      </ul>
    </div>
  );
}
