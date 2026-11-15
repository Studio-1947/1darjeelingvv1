import React from 'react';
import { useTranslation } from 'react-i18next';

/** A thin red progress bar with a percentage label. */
export default function ProfileCompletionBar({ percent }: { percent: number }) {
  const { t } = useTranslation();
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="grid w-full gap-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-[var(--ink-strong)]">{t('kyc.profileCompletion')}</span>
        <b className="font-medium text-[var(--r)] tabular-nums">{clamped}%</b>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-[3px] bg-[var(--hairline)]">
        <div
          className="h-full rounded-[3px] bg-[var(--r)] transition-all duration-500"
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-label={t('kyc.profileCompletion')}
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
