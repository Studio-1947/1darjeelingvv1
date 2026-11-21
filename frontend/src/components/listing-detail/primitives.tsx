import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ag/Icon';
import SmartImg from '@/components/SmartImg';
import { listingImage } from '@/lib/listingContent';
import { Box, cx } from '@/components/ag';

/**
 * One block of the listing page (red /7 item view): a Box with an h2, inside the 720px column.
 * Every section of the page is one of these, so they line up and space the same way.
 */
export function Section({ title, eyebrow, note, action, testid, id, className, tone, children }: {
  title?: React.ReactNode;
  eyebrow?: React.ReactNode;
  note?: React.ReactNode;
  /** Right of the title, e.g. a small button. */
  action?: React.ReactNode;
  testid?: string;
  id?: string;
  className?: string;
  tone?: 'blush';
  children?: React.ReactNode;
}) {
  return (
    <Box as="section" tone={tone} data-testid={testid} id={id} className={cx('scroll-mt-20', className)}>
      {(title != null || eyebrow != null) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex flex-col gap-0.5">
            {eyebrow != null && <span className="ag-eyebrow">{eyebrow}</span>}
            {title != null && <h2>{title}</h2>}
            {note != null && <p className="ag-small">{note}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </Box>
  );
}

/** A priced line (prototype `.sum` rows): name and a small line on the left, price and unit right. */
export function PriceRow({ name, sub, price, unit, photo, testid }: {
  name: React.ReactNode;
  sub?: React.ReactNode;
  price?: number;
  unit?: React.ReactNode;
  icon?: React.ReactNode;
  photo?: string;
  testid?: string;
}) {
  return (
    <div className="flex items-start gap-3 py-1.5 text-[16px] leading-6 text-[var(--ink7)]" data-testid={testid}>
      {photo && <img src={photo} alt="" loading="lazy" className="w-12 h-12 rounded-[12px] object-cover flex-none bg-[var(--creme2)]" />}
      <span className="flex-1 min-w-0">
        {name}
        {sub != null && <span className="ag-small block">{sub}</span>}
      </span>
      {price != null && price > 0 && (
        <span className="flex-none text-right tabular-nums">
          <b className="font-medium text-[var(--ink-strong)]">₹{price.toLocaleString('en-IN')}</b>
          {unit != null && <span className="ag-small"> {unit}</span>}
        </span>
      )}
    </div>
  );
}

/** One fact: red icon, small label, the value. */
export function Fact({ icon, label, value, testid }: { icon: React.ReactNode; label: React.ReactNode; value: React.ReactNode; testid?: string }) {
  return (
    <li className="flex items-start gap-3" data-testid={testid}>
      <span className="ag-micon">{icon}</span>
      <span className="min-w-0 flex flex-col pt-0.5">
        <span className="ag-small !text-[13px] !leading-[18px]">{label}</span>
        <span className="text-[15px] leading-[22px] text-[var(--ink-strong)] whitespace-pre-line">{value}</span>
      </span>
    </li>
  );
}

/** Real photo if it loads, otherwise the initial on the brand tint - never a broken face. */
export function Avatar({ photo, initial, size = 64 }: { photo?: string; initial: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (!photo || failed) {
    return (
      <span style={style} className="flex-none rounded-full grid place-items-center bg-[var(--r-tint)] text-[var(--r)] text-[24px] font-medium" aria-hidden="true">
        {initial}
      </span>
    );
  }
  return <img src={photo} alt="" style={style} onError={() => setFailed(true)} className="flex-none rounded-full object-cover bg-[var(--creme2)]" />;
}

/** The person behind a listing: portrait, name, verified, place, then their story and facts. */
export function PersonCard({ testid, title, name, photo, verified, place, chips, bio, children }: {
  testid: string;
  title: string;
  name: string;
  photo?: string;
  verified?: boolean;
  place?: string;
  chips?: string[];
  bio?: string;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Section title={title} testid={testid}>
      <div className="flex items-center gap-3">
        <Avatar photo={photo} size={56} initial={(name || '?').trim().charAt(0).toUpperCase()} />
        <div className="min-w-0 flex flex-col gap-1">
          <span className="text-[18px] leading-6 font-medium text-[var(--ink-strong)]">{name}</span>
          {verified && <span className="ag-listing-tag ok self-start">{t('listing.verified', 'Verified')}</span>}
          {place && <span className="ag-small inline-flex items-center gap-1"><Icon name="pin" size={14} className="text-[var(--r)]" /> {place}</span>}
        </div>
      </div>
      {chips && chips.length > 0 && (
        <div className="ag-listing-langrow">
          {chips.map((c) => <span key={c} className="ag-listing-langchip">{c}</span>)}
        </div>
      )}
      {bio && <p className="m-0 text-[15px] leading-[22px] text-[var(--ink7)] whitespace-pre-line">{bio}</p>}
      {children}
    </Section>
  );
}

/** A small listing card (`.ag-card`) for the nearby and recommended rows. */
export function MiniCard({ item, badge }: { item: any; badge?: string }) {
  const { t } = useTranslation();
  const unit = item.type === 'homestay' ? t('common.per_head') : item.type === 'driver' || item.type === 'guide' ? t('common.per_day') : '';
  return (
    <Link to={`/listing/${item.id}`} className="ag-card flex flex-col">
      <span className="relative block">
        <SmartImg src={listingImage(item, 500, 375)} alt="" className="img" />
        {badge && (
          <span className="absolute left-2 bottom-2 ag-status !bg-[var(--surface)] !text-[var(--ink-strong)]">
            <Icon name="pin" size={14} className="text-[var(--r)]" />{badge}
          </span>
        )}
      </span>
      <span className="body">
        <span className="name line-clamp-1">{item.title}</span>
        <span className="meta line-clamp-1">{item.location}</span>
        {Number(item.price) > 0 && (
          <span className="ag-price">₹{Number(item.price).toLocaleString('en-IN')} {unit && <span className="unit">{unit}</span>}</span>
        )}
      </span>
    </Link>
  );
}

