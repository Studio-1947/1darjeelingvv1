import React from 'react';
import { useTranslation } from 'react-i18next';
import FaceImg from '@/components/FaceImg';
import { sizedImage } from '@/lib/listingContent';

export type CardHost = { name?: string; avatar?: string | null } | null | undefined;

/** True when the server sent a host name for this listing (backend lib/hostCard.ts). */
export const hasHost = (host: CardHost) => Boolean(host?.name?.trim());

/**
 * "Hosted by Pema" with the host's face, laid over the bottom-left of the card's photo, the same on
 * every listing card: homestays, drivers, guides, cafes and shops. The parent photo box must be
 * `position: relative`. Nothing is drawn when the host gave no name.
 */
export default function HostLine({ host }: { host: CardHost }) {
  const { t } = useTranslation();
  const name = host?.name?.trim();
  if (!name) return null;
  return (
    <span className="ag-hostbadge" data-testid="card-host">
      <span className="face" aria-hidden="true">
        <FaceImg src={host?.avatar ? sizedImage(host.avatar, 120) : ''} initial={name.charAt(0).toUpperCase()} />
      </span>
      <span className="who">
        <span className="lab">{t('home.hosted_by_label', 'Hosted by')}</span>
        <b className="truncate">{name}</b>
      </span>
    </span>
  );
}
