import React from 'react';
import { useTranslation } from 'react-i18next';
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
    <div className={`text-left ${className}`} data-testid="pass-offer">
      {!compact && <p className="font-display font-bold text-ink">{t('pass_card.title')}</p>}
      <p className={`${compact ? '' : 'mt-1'} font-display font-extrabold text-[var(--button)] ${compact ? 'text-xl' : 'text-3xl'}`} data-testid="pass-offer-price">
        {renewing ? t('pass_card.yearly', { price: rupees(yearly.total) }) : t('pass_card.first_year', { price: rupees(first.total) })}
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        {renewing ? t('pass_card.billed') : t('pass_card.then', { price: rupees(yearly.total) })}
      </p>
      <p className="mt-3 text-sm text-ink">{t('pass_card.what')}</p>
      <p className="mt-2 text-sm font-bold text-ink">{t('pass_card.no_hidden')}</p>
      <p className="mt-1 text-sm text-ink">{t('pass_card.pay_host')}</p>
    </div>
  );
}
