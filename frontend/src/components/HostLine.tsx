import React from 'react';
import { useTranslation } from 'react-i18next';
import FaceImg from '@/components/FaceImg';
import { sizedImage } from '@/lib/listingContent';

/**
 * "Hosted by Pema" with the host's face (or initial), the same on every listing card: homestays,
 * drivers, guides, cafes and shops. The server sends `host` as name and photo only
 * (backend lib/hostCard.ts). With no host name the row stays, empty, so card buttons line up.
 */
export default function HostLine({ host, className = '' }: { host?: { name?: string; avatar?: string | null } | null; className?: string }) {
  const { t } = useTranslation();
  const name = host?.name?.trim();
  if (!name) return <span className={`ag-hostline empty ${className}`} aria-hidden="true">{' '}</span>;
  return (
    <span className={`ag-hostline ${className}`} data-testid="card-host">
      <span className="face" aria-hidden="true">
        <FaceImg src={host?.avatar ? sizedImage(host.avatar, 64) : ''} initial={name.charAt(0).toUpperCase()} />
      </span>
      <span className="truncate">{t('home.hosted_by', { name, defaultValue: 'Hosted by {{name}}' })}</span>
    </span>
  );
}
