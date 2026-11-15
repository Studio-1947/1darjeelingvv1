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
  // The pass: the price already holds the GST, so it is one line and nothing is added on top.
  if (breakup.gst_included) {
    return (
      <dl className={`${compact ? 'text-[12px] leading-4' : 'text-sm'} rounded-[14px] border border-[var(--warmline)] bg-[var(--surface)] p-3 space-y-1.5 ${className}`} data-testid="price-breakup">
        <div className={`${row} font-medium text-[var(--ink-strong)]`} data-testid="price-total">
          <dt>{label}</dt><dd className="tabular-nums">{rupees(breakup.total)}</dd>
        </div>
        <div className={`${row} text-[var(--ink-muted)]`}>
          <dt>{t('price.gst_included', { rate: breakup.gst_rate })}</dt><dd className="tabular-nums">{rupees(breakup.gst)}</dd>
        </div>
      </dl>
    );
  }
  return (
    <dl className={`${compact ? 'text-[12px] leading-4' : 'text-sm'} rounded-[14px] border border-[var(--warmline)] bg-[var(--surface)] p-3 space-y-1.5 ${className}`} data-testid="price-breakup">
      <div className={row}>
        <dt className="text-[var(--ink-muted)]">{label}</dt>
        <dd className="tabular-nums text-[var(--ink-strong)]">
          {wasBase && wasBase > breakup.base && (
            <s className="mr-1.5 text-[var(--ink-muted)]" data-testid="price-was">{rupees(wasBase)}</s>
          )}
          {rupees(breakup.base)}
        </dd>
      </div>
      <div className={row}><dt className="text-[var(--ink-muted)]">{t('price.gst', { rate: breakup.gst_rate })}</dt><dd className="tabular-nums text-[var(--ink-strong)]">{rupees(breakup.gst)}</dd></div>
      {breakup.platform_fee > 0 && (
        <div className={row}><dt className="text-[var(--ink-muted)]">{t('price.platform_fee', { rate: breakup.platform_fee_rate })}</dt><dd className="tabular-nums text-[var(--ink-strong)]">{rupees(breakup.platform_fee)}</dd></div>
      )}
      <div className={`${row} border-t border-[var(--warmline)] pt-1.5 font-medium text-[var(--ink-strong)]`} data-testid="price-total">
        <dt>{t('price.total')}</dt><dd className="tabular-nums">{rupees(breakup.total)}</dd>
      </div>
    </dl>
  );
}
