import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { MapPin, SealCheck } from '@phosphor-icons/react';
import SmartImg from '@/components/SmartImg';
import { Status, cx } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import { contentFor, listingImage, listingImageBackups } from '@/lib/listingContent';
import { optionLabel } from '@/lib/optionLabel';
import { priceParts } from '@/components/home/cards';
import { useFavorites } from '@/context/FavoritesContext';
import { useLoginGate } from '@/components/LoginGate';

/** A listing as an `.ag-card`: photo, name, place, price, and an optional status tag on the photo. */
export default function ListingCard({ item, badge = null }) {
  const { t } = useTranslation();
  const p = priceParts(item, t);
  return (
    <Link to={`/listing/${item.id}`} data-testid={`listing-card-${item.id}`} className="ag-card flex flex-col no-underline">
      <span className="relative block">
        <SmartImg src={listingImage(item, 800, 600)} fallback={listingImageBackups(item, 800)} alt={item.title} className="img !flex" />
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

/* ---------- the category list's own cards (prototype `stayCard` and `spotCard`) ---------- */

export type Km = { km: number; approx: boolean } | null | undefined;

/**
 * The distance badge on a card, in the prototype's words: "under 1 km", "1.8 km", "19 km".
 * "≈" marks a distance taken from the place a listing names rather than its map pin.
 */
export function catKm(d: { km: number; approx: boolean }, t: TFunction): string {
  if (d.km < 1) return t('category.under1km', 'under 1 km');
  const n = d.km < 10 ? Number(d.km.toFixed(1)) : Math.round(d.km);
  return `${d.approx ? '≈ ' : ''}${n} km`;
}

/** The badge text, then " · " for screen readers (and the release walk, which reads "N km · "). */
function DistBadge({ km }: { km: Km }) {
  const { t } = useTranslation();
  if (!km) return null;
  return (
    <span className="ag-category-distb">
      <Icon name="pin" />
      {catKm(km, t)}
      <span className="sr-only"> · </span>
    </span>
  );
}

function VerifiedTick() {
  const { t } = useTranslation();
  return (
    <span className="ag-category-vb" role="img" aria-label={t('kyc.verified')} title={t('kyc.verified')}>
      <Icon name="check" />
    </span>
  );
}

function Heart({ id, testId }: { id: string; testId?: string }) {
  const { t } = useTranslation();
  const { isFavorite, toggle } = useFavorites();
  const { requireAuth } = useLoginGate();
  const saved = isFavorite(id);
  return (
    <button
      type="button"
      className={cx('ag-category-heart', saved && 'on')}
      aria-pressed={saved}
      aria-label={t('common.save')}
      title={t('common.save')}
      data-testid={testId}
      onClick={() => { if (requireAuth('save')) toggle(id).catch(() => {}); }}
    >
      <Icon name="heart" />
    </button>
  );
}

/** The one short fact under the meta row: an amenity, a service, a dish, or "Meals from ₹120". */
function featOf(it: any, t: TFunction): string {
  const e = it.extras || {};
  const first = (a: unknown) => (Array.isArray(a) ? a.find((x) => x && (typeof x === 'string' || x.name)) : undefined);
  if (it.type === 'cafe' || it.type === 'shop') {
    if (Number(it.price) > 0) {
      const amount = `₹${Number(it.price).toLocaleString('en-IN')}`;
      return it.type === 'cafe' ? t('category.meals_from', { amount, defaultValue: 'Meals from {{amount}}' }) : `${t('common.starting_from')} ${amount}`;
    }
    const d = first(e.menu) || first(e.goods);
    return d ? (typeof d === 'string' ? d : d.name) : '';
  }
  if (it.type === 'guide') {
    const s = first(e.services);
    if (s) return typeof s === 'string' ? s : s.name;
  }
  const a = first(e.amenities) || first(it.tags);
  return a ? optionLabel(t, typeof a === 'string' ? a : a.name) : '';
}

/**
 * Stays, drivers, guides, cafes and shops (prototype `.staycard`): a square photo with the distance
 * badge, name with a verified tick, place, who it fits and its rating, one fact, the price, then the
 * button and a heart.
 */
export function CatStayCard({ it, href, km, testId, ctaTestId, ctaLabel }: {
  it: any; href: string; km?: Km; testId?: string; ctaTestId?: string; ctaLabel: string;
}) {
  const { t } = useTranslation();
  const e = it.extras || {};
  const isCar = it.type === 'driver';
  const isFood = it.type === 'cafe' || it.type === 'shop';
  const rating = Number(it.rating) > 0 && Number(it.review_count) > 0 ? Number(it.rating).toFixed(1) : '';
  const p = priceParts(it, t);
  const feat = isCar ? '' : featOf(it, t);
  const seats = Number(e.seats) > 0 ? Number(e.seats) : Number(it.max_guests) || 0;
  const carType = e.vehicle_type || e.car_model || '';
  const avatar = typeof e.host_avatar === 'string' && e.host_avatar ? e.host_avatar : '';
  const unit = it.type === 'homestay' ? t('common.per_head') : t('category.per_day', 'per day');
  return (
    <div className={cx('ag-category-stay', isCar && 'car')} data-testid={testId}>
      <Link to={href} className="ag-category-stayimg" aria-label={it.title}>
        <SmartImg src={listingImage(it, 600, 600)} fallback={listingImageBackups(it, 600)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        {isCar && (
          // The initial is drawn by CSS (data-initial) so the card's text still starts with its name.
          <span className="ag-category-selfie" aria-hidden="true" data-initial={avatar ? undefined : (it.title || '?').trim().charAt(0).toUpperCase()}>
            {avatar && <img src={avatar} alt="" />}
          </span>
        )}
      </Link>
      <div className="ag-category-staybody">
        <Link to={href} className="name">
          {it.title}
          {it.provider_verified && <> <VerifiedTick /></>}
        </Link>
        {/* Between the name and the place in the markup ("Name, 3 km · Ghum"), drawn over the photo's corner. */}
        <DistBadge km={km} />
        <span className="meta place"><Icon name="pin" />{it.location}</span>
        <span className="metarow">
          {isCar ? (
            <>
              {seats > 0 && <span className="meta"><Icon name="person" />{t('category.seats', { count: seats, defaultValue: '{{count}} seats' })}</span>}
              {carType && <span className="meta cartype"><Icon name="car" />{optionLabel(t, carType)}</span>}
            </>
          ) : (
            <>
              {Number(it.max_guests) > 0 && (
                <span className="meta"><Icon name="person" />{t('category.up_to', { count: Number(it.max_guests), defaultValue: 'Up to {{count}}' })}</span>
              )}
              <span className={cx('meta', 'star', !rating && 'new')}><Icon name="star" />{rating || t('category.new', 'New')}</span>
            </>
          )}
        </span>
        {!isCar && <span className="meta feat">{feat ? <><Icon name="leaf" />{feat}</> : ' '}</span>}
        {isFood ? (
          // Cafes and shops keep the row empty so the buttons line up with the other cards.
          <span className="ag-category-price" aria-hidden="true">{' '}</span>
        ) : (
          <span className="ag-category-price">
            {p.text ? <span className="unit">{p.text}</span> : p.amount ? <><b>{p.amount}</b> <span className="unit">{unit}</span></> : null}
          </span>
        )}
        <div className="ag-category-stayact">
          <Link to={href} className="ag-category-reserve" data-testid={ctaTestId}>
            <span className="min-w-0 truncate">{ctaLabel}</span>
            <span className="go" aria-hidden="true"><Icon name="arrowne" /></span>
          </Link>
          <Heart id={it.id} />
        </div>
      </div>
    </div>
  );
}

/** "Free entry" or "₹150 entry ticket", on a scalloped round sticker (prototype `.stick`). */
const STICK = (() => {
  const n = 16, R = 46, r = 40, c = 50;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
    const p0 = [c + r * Math.cos(a0), c + r * Math.sin(a0)];
    const p1 = [c + (R + 4) * Math.cos(a1), c + (R + 4) * Math.sin(a1)];
    const p2 = [c + r * Math.cos(a2), c + r * Math.sin(a2)];
    d += (i ? '' : `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)}`) + `Q${p1[0].toFixed(1)} ${p1[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d}Z`;
})();

function Sticker({ it }: { it: any }) {
  const { t } = useTranslation();
  const paid = Number(it.price) > 0;
  return (
    <span className={cx('ag-category-stick', !paid && 'free')} aria-hidden="true">
      <svg viewBox="0 0 100 100"><path d={STICK} /><circle cx="50" cy="50" r="33" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
      <span className="stxt">
        {paid
          ? <><b>₹{Number(it.price).toLocaleString('en-IN')}</b><i>{t('category.ticket', 'Entry ticket')}</i></>
          : <><b>{t('category.free1', 'Free')}</b><i>{t('category.free2', 'entry')}</i></>}
      </span>
    </span>
  );
}

/** Spots and nature (prototype `.spotcard`): a 3:4 photo, the entry sticker, the place in small caps, the name. */
export function CatSpotCard({ it, href, km, testId }: { it: any; href: string; km?: Km; testId?: string }) {
  const { t } = useTranslation();
  const p = priceParts(it, t);
  const best = it.type === 'biodiversity' ? contentFor(it).bestTime : '';
  const entry = Number(it.price) > 0 ? `₹${Number(it.price).toLocaleString('en-IN')}` : (it.extras?.entry_fee || '');
  return (
    <Link to={href} className="ag-category-spot" data-testid={testId} aria-label={[it.title, it.location, entry || p.text].filter(Boolean).join(', ')}>
      <SmartImg src={listingImage(it, 600, 800)} fallback={listingImageBackups(it, 600)} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <Sticker it={it} />
      <span className="info">
        <span className="loc"><Icon name="pin" /><span className="truncate">{km ? `${catKm(km, t)} · ` : ''}{it.location}</span></span>
        <b>{it.title}</b>
        {best && <span className="best"><Icon name="hourglass" />{t('category.best_time', 'Best time')}: {best}</span>}
      </span>
    </Link>
  );
}
