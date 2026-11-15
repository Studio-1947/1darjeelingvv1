import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, SealCheck } from '@phosphor-icons/react';
import SmartImg from '@/components/SmartImg';
import { Status } from '@/components/ag';
import { listingImage } from '@/lib/listingContent';
import { priceParts } from '@/components/home/cards';

/** A listing as an `.ag-card`: photo, name, place, price, and an optional status tag on the photo. */
export default function ListingCard({ item, badge = null }) {
  const { t } = useTranslation();
  const p = priceParts(item, t);
  return (
    <Link to={`/listing/${item.id}`} data-testid={`listing-card-${item.id}`} className="ag-card flex flex-col no-underline">
      <span className="relative block">
        <SmartImg src={listingImage(item, 800, 600)} alt={item.title} className="img !flex" />
        {badge && <Status tone="info" className="absolute left-2 top-2">{badge}</Status>}
      </span>
      <span className="body">
        <span className="name line-clamp-2">
          {item.title}
          {item.provider_verified && <SealCheck size={16} weight="fill" className="ml-1 inline-block align-[-2px] text-[var(--r)]" aria-label={t('kyc.verified')} />}
        </span>
        <span className="meta flex items-start gap-1">
          <MapPin size={14} className="mt-0.5 flex-none text-[var(--r)]" aria-hidden="true" />
          <span className="line-clamp-1">{item.location}</span>
        </span>
        {(p.amount || p.text) && (
          <span className="ag-price">
            {p.text ?? <>{p.lead && <span className="unit">{p.lead} </span>}{p.amount}{p.unit && <span className="unit"> {p.unit}</span>}</>}
          </span>
        )}
        {item.description && <span className="meta line-clamp-2">{item.description}</span>}
      </span>
    </Link>
  );
}
