import React from 'react';
import { useTranslation } from 'react-i18next';
import { SealCheck } from '@phosphor-icons/react';
import { Status } from '@/components/ag';

/** Shown when a provider's kyc_status is 'verified'. */
export default function VerifiedBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  return (
    <Status tone="ok" title={t('kyc.verifiedTooltip')}>
      <SealCheck size={size === 'md' ? 16 : 14} weight="fill" aria-hidden="true" /> {t('kyc.verified')}
    </Status>
  );
}
