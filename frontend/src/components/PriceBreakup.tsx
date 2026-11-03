import React from 'react';
import { useTranslation } from 'react-i18next';
import { rupees, type PriceBreakup as Breakup } from '@/lib/prices';

/**
 * The lines of a payment before it opens: the plan, pass or fee, 18% GST, the 2% payment gateway
 * fee (host plans only) and the total that will be charged. `wasBase` shows the usual price struck
 * through beside a launch price. The app shows the same box (src/components/PriceBreakup.tsx).
 */
export default function PriceBreakup({ breakup, label, wasBase, compact = false, className = '' }: {
  breakup: Breakup;
  /** What the base price is for, e.g. "Host plan · first year". */
  label: string;
  /** The usual price, in paise, struck through before the base. */
  wasBase?: number;
  compact?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const row = 'flex items-center justify-between gap-3';
  return (
    <dl className={`${compact ? 'text-xs' : 'text-sm'} rounded-xl border border-[var(--line)] bg-white p-3 space-y-1.5 ${className}`} data-testid="price-breakup">
      <div className={row}>
        <dt className="text-ink-soft">{label}</dt>
        <dd className="tabular-nums text-ink">
          {wasBase && wasBase > breakup.base && (
            <s className="mr-1.5 text-ink-soft" data-testid="price-was">{rupees(wasBase)}</s>
          )}
          {rupees(breakup.base)}
        </dd>
      </div>
      <div className={row}><dt className="text-ink-soft">{t('price.gst', { rate: breakup.gst_rate })}</dt><dd className="tabular-nums text-ink">{rupees(breakup.gst)}</dd></div>
      {breakup.platform_fee > 0 && (
        <div className={row}><dt className="text-ink-soft">{t('price.platform_fee', { rate: breakup.platform_fee_rate })}</dt><dd className="tabular-nums text-ink">{rupees(breakup.platform_fee)}</dd></div>
      )}
      <div className={`${row} border-t border-[var(--line)] pt-1.5 font-bold text-ink`} data-testid="price-total">
        <dt>{t('price.total')}</dt><dd className="tabular-nums">{rupees(breakup.total)}</dd>
      </div>
    </dl>
  );
}
