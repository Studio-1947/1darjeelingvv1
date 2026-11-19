/*
 * Listing cards and category tiles for Home, the category lists and Explore (Aangan 2.0 red /7).
 * Three card shapes, as the prototype uses them:
 *   StayCard  - photo on top, name, place, guests and rating, price, a red button and a heart
 *   SpotCard  - a tall photo with a round entry sticker and the name over it (spots, nature, festivals)
 *   GuideCard / ShopCard - the small three-across cards Home uses for guides, cafes and shops
 *   ListRow  - a 104px square photo beside the text (search across every category, list view)
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArrowUpRight, MapPin, SealCheck, House, Car, Mountains, ForkKnife, PersonSimpleHike, Confetti } from '@phosphor-icons/react';
import { Icon } from '@/components/ag/Icon';
import SmartImg from '@/components/SmartImg';
import { cx } from '@/components/ag';
import { listingImage, sizedImage } from '@/lib/listingContent';
import { kmLabel } from '@/lib/places';
import { cardCtaKey } from '@/lib/cardCta';
import { useFavorites } from '@/context/FavoritesContext';
import { useLoginGate } from '@/components/LoginGate';

type Km = { km: number; approx: boolean } | null | undefined;

/** The price line: amount plus its unit, or what stands in for a price. */
export function priceParts(it: any, t: TFunction): { amount?: string; unit?: string; lead?: string; text?: string } {
  if (Number(it.price) > 0) {
    const amount = `₹${Number(it.price).toLocaleString('en-IN')}`;
    // A homestay is priced per person, not per night - see the note on common.per_head.
    if (it.type === 'homestay') return { amount, unit: t('common.per_head') };
    if (it.type === 'driver') return { amount, unit: t('common.per_day') };
    if (['guide', 'cafe', 'shop'].includes(it.type)) return { lead: t('common.starting_from'), amount };
    return { amount };
  }
  if (it.extras?.entry_fee) return { text: it.extras.entry_fee };
  if (['spot', 'biodiversity', 'event'].includes(it.type)) return { text: t('common.entry_varies') };
  // A host who has not set a rate yet: say so, rather than a card with no price at all.
  if (['homestay', 'driver', 'guide'].includes(it.type)) return { text: t('common.price_on_request') };
  return {};
}

function Price({ it }: { it: any }) {
  const { t } = useTranslation();
  const p = priceParts(it, t);
  if (p.text) return <span className="ag-price">{p.text}</span>;
  if (!p.amount) return null;
  return (
    <span className="ag-price">
      {p.lead && <span className="unit">{p.lead} </span>}
      {p.amount}
      {p.unit && <span className="unit"> {p.unit}</span>}
    </span>
  );
}

/** "≈ 3 km · Ghum, Darjeeling": the release walk reads distances in exactly this shape. */
function Where({ it, km }: { it: any; km?: Km }) {
  return (
    <span className="meta flex items-start gap-1">
      <MapPin size={14} className="mt-0.5 flex-none text-[var(--r)]" aria-hidden="true" />
      <span className="line-clamp-2">{km ? `${kmLabel(km)} · ` : ''}{it.location}</span>
    </span>
  );
}

export function SaveHeart({ id, testId, className }: { id: string; testId?: string; className?: string }) {
  const { t } = useTranslation();
  const { isFavorite, toggle } = useFavorites();
  const { requireAuth } = useLoginGate();
  const saved = isFavorite(id);
  return (
    <button
      type="button"
      aria-label={t('common.save')}
      aria-pressed={saved}
      data-testid={testId}
      className={cx('ag-home-heart', saved && 'on', className)}
      onClick={() => { if (requireAuth('save')) toggle(id).catch(() => {}); }}
    >
      <Icon name="heart" />
    </button>
  );
}

const BIKE = 'M5.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM5.5 15.5h5l3-6h3l2 6M13.5 9.5L12 6H9';
const firstText = (v: unknown): string => (Array.isArray(v) ? v.find((x) => typeof x === 'string' && x.trim()) || '' : '');

/**
 * Stays, drivers, guides, cafes and shops (the prototype's staycard): photo with the distance on it,
 * name, place, guests and rating, price, then a red button and a round heart.
 * `wide` lays the first card of a Home section across both columns, photo beside the text.
 * `selfie` puts the driver's face (or initial) over the photo's corner.
 */
export function StayCard({ it, href, km, testId, ctaTestId, saveTestId, ctaLabel, wide, selfie }: {
  it: any; href: string; km?: Km; testId?: string; ctaTestId?: string; saveTestId?: string; ctaLabel?: string; wide?: boolean; selfie?: boolean;
}) {
  const { t } = useTranslation();
  const ex = it.extras || {};
  const isCar = it.type === 'driver';
  const seats = Number(ex.seats) || Number(it.max_guests) || 0;
  const feat = isCar ? '' : firstText(ex.amenities) || firstText(ex.highlights);
  const rating = Number(it.rating) > 0 ? Number(it.rating).toFixed(1) : '';
  const avatar = typeof ex.host_avatar === 'string' && ex.host_avatar ? ex.host_avatar : '';
  return (
    <div className={cx('ag-home-stay', wide && 'wide')} data-testid={testId}>
      <Link to={href} tabIndex={-1} aria-hidden="true" className="ag-home-stayimg">
        <SmartImg src={listingImage(it, wide ? 700 : 500, wide ? 700 : 380)} alt="" className="ag-home-photo" />
        {km && <span className="ag-home-distb"><Icon name="pin" />{kmLabel(km)}</span>}
        {selfie && (
          <span className="ag-home-selfie">
            {avatar ? <img src={sizedImage(avatar, 120)} alt="" loading="lazy" /> : <b>{String(it.title || '?').trim().charAt(0).toUpperCase()}</b>}
          </span>
        )}
      </Link>
      <div className="ag-home-staybody">
        <Link to={href} className="name">
          <span className="truncate">{it.title}</span>
          {it.provider_verified && (
            <span className="ag-home-vb" role="img" aria-label={t('kyc.verified')}><Icon name="check" /></span>
          )}
        </Link>
        <span className="meta"><Icon name="pin" /><span className="truncate">{it.location}</span></span>
        {['homestay', 'driver', 'guide'].includes(it.type) && (
          <span className="metarow">
            {seats > 0 && (
              <span className="meta"><Icon name="person" />
                {isCar ? `${seats} ${t('home.seats', 'seats')}` : `${t('home.upto', 'Up to')} ${seats}`}
              </span>
            )}
            {isCar && ex.vehicle_type ? (
              <span className="meta car"><Icon name="car" />{String(ex.vehicle_type)}</span>
            ) : (
              <span className={cx('meta star', rating && 'on')}><Icon name="star" />{rating || t('home.new', 'New')}</span>
            )}
          </span>
        )}
        {feat && <span className="meta feat"><Icon name="leaf" /><span className="truncate">{feat}</span></span>}
        <Price it={it} />
        <div className="stayact">
          <Link to={href} className="ag-home-reserve" data-testid={ctaTestId}>
            <span className="truncate">{ctaLabel || t(cardCtaKey(it.type))}</span>
            <span className="go" aria-hidden="true"><Icon name="arrowne" /></span>
          </Link>
          <SaveHeart id={it.id} testId={saveTestId} />
        </div>
      </div>
    </div>
  );
}

/** The prototype's sticker outline: a 16-point scalloped disc. */
const STICK = (() => {
  const n = 16; const R = 46; const r = 40; const c = 50; let d = '';
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI * 2; const a1 = ((i + 0.5) / n) * Math.PI * 2; const a2 = ((i + 1) / n) * Math.PI * 2;
    const p0 = [c + r * Math.cos(a0), c + r * Math.sin(a0)];
    const p1 = [c + (R + 4) * Math.cos(a1), c + (R + 4) * Math.sin(a1)];
    const p2 = [c + r * Math.cos(a2), c + r * Math.sin(a2)];
    d += (i ? '' : `M${p0[0].toFixed(1)} ${p0[1].toFixed(1)}`) + `Q${p1[0].toFixed(1)} ${p1[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return `${d}Z`;
})();

/** The round entry sticker on a place's photo: "₹150 entry ticket", the host's own fee text, or "Entry varies". */
function Sticker({ it }: { it: any }) {
  const { t } = useTranslation();
  const paid = Number(it.price) > 0;
  const fee = typeof it.extras?.entry_fee === 'string' ? it.extras.entry_fee.trim() : '';
  // A price of 0 means nobody has set one, not that the place is free, so it never says "Free".
  const [big, small] = paid
    ? [`₹${Number(it.price).toLocaleString('en-IN')}`, t('home.stick_ticket', 'Entry ticket')]
    : fee ? [fee, t('home.stick_entry', 'entry')] : [t('home.stick_entry_big', 'Entry'), t('home.stick_varies', 'varies')];
  return (
    <span className={cx('ag-home-stick', paid && 'paid')} aria-hidden="true">
      <svg viewBox="0 0 100 100"><path d={STICK} /><circle cx="50" cy="50" r="33" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" /></svg>
      <span className="stxt"><b>{big}</b><i>{small}</i></span>
    </span>
  );
}

/** Spots, nature and festivals: a tall photo, a round entry sticker, the place in small caps, the name over it. */
export function SpotCard({ it, href, km, testId, className }: { it: any; href: string; km?: Km; testId?: string; className?: string }) {
  const { t } = useTranslation();
  const ex = it.extras || {};
  const when = it.type === 'event' ? (ex.month || ex.event_date || ex.date) : ex.best_time;
  return (
    <Link to={href} data-testid={testId} aria-label={it.title} className={cx('ag-home-spot', className)}>
      <SmartImg src={listingImage(it, 600, 800)} alt="" className="ag-home-photo" />
      {it.type !== 'event' && <Sticker it={it} />}
      <span className="info">
        <span className="loc"><Icon name="pin" /><span className="truncate">{km ? `${kmLabel(km)} · ` : ''}{it.location}</span></span>
        <b>{it.title}</b>
        {when && (
          <span className="best"><Icon name={it.type === 'event' ? 'party' : 'hourglass'} />
            <span className="truncate">{it.type === 'event' ? String(when) : `${t('home.best_time', 'Best time')}: ${String(when)}`}</span>
          </span>
        )}
      </span>
    </Link>
  );
}

/** Tour guides on Home (the prototype's gcard): square photo, first name, what they offer, place, price a day. */
export function GuideCard({ it, href, testId }: { it: any; href: string; testId?: string }) {
  const { t } = useTranslation();
  const service = Array.isArray(it.extras?.services) ? it.extras.services.find((x: any) => x && x.name) : null;
  return (
    <Link to={href} className="ag-home-gcard" data-testid={testId}>
      <SmartImg src={listingImage(it, 300, 300)} alt="" className="gimg" />
      <b>{String(it.title || '').split(' ')[0]}</b>
      {service && <span className="gtag"><Icon name="trek" /><span className="truncate">{service.name}</span></span>}
      <span className="small">{it.location}</span>
      {Number(it.price) > 0 && (
        <span className="gprice">₹{Number(it.price).toLocaleString('en-IN')}<span className="small"> {t('home.per_day', 'per day')}</span></span>
      )}
    </Link>
  );
}

/** Cafes and shops on Home: square photo, name, kind, place and whether they deliver. */
export function ShopCard({ it, href, testId }: { it: any; href: string; testId?: string }) {
  const { t } = useTranslation();
  const ex = it.extras || {};
  const cafe = it.type === 'cafe';
  const kind = cafe ? t('home.sk_food', 'Food') : (typeof ex.shop_kind === 'string' && ex.shop_kind.trim()) || t('home.sk_shop', 'Shop');
  return (
    <Link to={href} className="ag-home-gcard shop" data-testid={testId}>
      <SmartImg src={listingImage(it, 300, 300)} alt="" className="gimg" />
      <b>{it.title}</b>
      <span className="gtag"><Icon name={cafe ? 'cup' : 'bag'} /><span className="truncate">{kind}</span></span>
      <span className="small"><Icon name="pin" /><span className="truncate">{it.location}</span></span>
      {ex.home_delivery && (
        <span className="small gdl"><svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d={BIKE} /></svg>{t('home.delivers', 'Home delivery')}</span>
      )}
    </Link>
  );
}

/** One line per result: 104px square photo, name, place, price. */
export function ListRow({ it, href, km, testId }: { it: any; href: string; km?: Km; testId?: string }) {
  const { t } = useTranslation();
  return (
    <Link to={href} data-testid={testId} className="ag-card grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3.5 p-2.5 no-underline">
      <SmartImg src={listingImage(it, 300, 300)} alt="" className="!flex aspect-square w-[104px] rounded-[14px] bg-[var(--creme2)] object-cover" />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="name line-clamp-2">
          {it.title}
          {it.provider_verified && <SealCheck size={16} weight="fill" className="ml-1 inline-block align-[-2px] text-[var(--r)]" aria-label={t('kyc.verified')} />}
        </span>
        <Where it={it} km={km} />
        <Price it={it} />
      </span>
    </Link>
  );
}

/* ---------- category tiles ---------- */

export type Tile = { key: string; to: string; Icon: React.ElementType; title: [string, string]; sub: [string, string] };

/** The six on Home and Explore. Feed and Nature are reached from the tab bar and their own sections. */
export const HOME_TILES: Tile[] = [
  { key: 'stays', to: '/homestays', Icon: House, title: ['home.tile.stays', 'Homestay'], sub: ['home.tile.stays_sub', 'A room with a local family'] },
  { key: 'cars', to: '/drivers', Icon: Car, title: ['home.tile.cars', 'Car & Driver'], sub: ['home.tile.cars_sub', 'Airport, station, sightseeing'] },
  { key: 'spots', to: '/spots', Icon: Mountains, title: ['home.tile.spots', 'Offbeat Places'], sub: ['home.tile.spots_sub', 'Tiger Hill, Ghum, tea gardens'] },
  { key: 'food', to: '/cafes', Icon: ForkKnife, title: ['home.tile.food', 'Foods & Shops'], sub: ['home.tile.food_sub', 'Local food, tea and snacks'] },
  { key: 'guides', to: '/guides', Icon: PersonSimpleHike, title: ['home.tile.guides', 'Tour Guides'], sub: ['explore.guide_sub', 'Trekking, heritage and nature guides'] },
  { key: 'events', to: '/events', Icon: Confetti, title: ['home.tile.events', 'Festivals'], sub: ['explore.event_sub', 'Festivals and markets'] },
];

export function CategoryTiles({ tiles = HOME_TILES, testIdPrefix, subFor, label }: {
  tiles?: Tile[]; testIdPrefix?: string; subFor?: (key: string) => string | undefined; label?: string;
}) {
  const { t } = useTranslation();
  return (
    <nav className="ag-tiles" aria-label={label}>
      {tiles.map(({ key, to, Icon, title, sub }) => (
        <Link key={key} to={to} className="ag-tile" data-testid={testIdPrefix ? `${testIdPrefix}${key}` : undefined}>
          <Icon aria-hidden="true" />
          <b>{t(title[0], title[1])}</b>
          <span>{subFor?.(key) ?? t(sub[0], sub[1])}</span>
          <span className="ag-go" aria-hidden="true"><ArrowUpRight weight="bold" /></span>
        </Link>
      ))}
    </nav>
  );
}
