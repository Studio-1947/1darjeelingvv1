/*
 * Listing cards and category tiles for Home, the category lists and Explore (Aangan 2.0 red /7).
 * Three card shapes, as the prototype uses them:
 *   StayCard - photo on top, name, place, price, one button and a heart (stays, drivers, guides, food)
 *   SpotCard - a tall photo with the name over it (spots, nature, festivals)
 *   ListRow  - a 104px square photo beside the text (search across every category, list view)
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArrowUpRight, Heart, MapPin, SealCheck, House, Car, Mountains, ForkKnife, PersonSimpleHike, Confetti } from '@phosphor-icons/react';
import SmartImg from '@/components/SmartImg';
import { ButtonLink, IconButton, cx } from '@/components/ag';
import { listingImage } from '@/lib/listingContent';
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

function SaveHeart({ id, testId, className }: { id: string; testId?: string; className?: string }) {
  const { t } = useTranslation();
  const { isFavorite, toggle } = useFavorites();
  const { requireAuth } = useLoginGate();
  const saved = isFavorite(id);
  return (
    <IconButton
      label={t('common.save')}
      on={saved}
      aria-pressed={saved}
      data-testid={testId}
      className={className}
      onClick={() => { if (requireAuth('save')) toggle(id).catch(() => {}); }}
    >
      <Heart weight={saved ? 'fill' : 'regular'} />
    </IconButton>
  );
}

/** Stays, drivers, guides, cafes and shops: photo, name, place, price, button and heart. */
export function StayCard({ it, href, km, testId, ctaTestId, saveTestId, ctaLabel }: {
  it: any; href: string; km?: Km; testId?: string; ctaTestId?: string; saveTestId?: string; ctaLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="ag-card flex flex-col" data-testid={testId}>
      <div className="relative">
        <Link to={href} tabIndex={-1} aria-hidden="true" className="block">
          <SmartImg src={listingImage(it, 600, 450)} alt="" className="img !flex" />
        </Link>
        <SaveHeart id={it.id} testId={saveTestId} className="!absolute right-2 top-2" />
      </div>
      <div className="body flex-1">
        <Link to={href} className="name line-clamp-2 no-underline">
          {it.title}
          {it.provider_verified && (
            <SealCheck size={16} weight="fill" className="ml-1 inline-block align-[-2px] text-[var(--r)]" aria-label={t('kyc.verified')} />
          )}
        </Link>
        <Where it={it} km={km} />
        <Price it={it} />
        <ButtonLink to={href} size="sm" block center className="mt-auto" data-testid={ctaTestId}>
          {ctaLabel || t(cardCtaKey(it.type))}
        </ButtonLink>
      </div>
    </div>
  );
}

/** Spots, nature and festivals: a tall photo, the place in small caps, the name over it. */
export function SpotCard({ it, href, km, testId, className }: { it: any; href: string; km?: Km; testId?: string; className?: string }) {
  const { t } = useTranslation();
  const p = priceParts(it, t);
  const tag = p.amount ? `${p.lead ? `${p.lead} ` : ''}${p.amount}` : p.text;
  return (
    <Link to={href} data-testid={testId}
      className={cx('relative block aspect-[3/4] overflow-hidden rounded-[var(--r-card)] border border-[var(--warmline)] bg-[var(--creme2)] text-white no-underline shadow-[var(--warmshadow)]', className)}>
      <SmartImg src={listingImage(it, 600, 800)} alt={it.title} className="absolute inset-0 h-full w-full object-cover" />
      <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" aria-hidden="true" />
      {tag && <span className="ag-status absolute right-2 top-2 max-w-[80%] truncate">{tag}</span>}
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3">
        <span className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider">
          <MapPin size={12} weight="fill" aria-hidden="true" />
          <span className="truncate">{km ? `${kmLabel(km)} · ` : ''}{it.location}</span>
        </span>
        <b className="line-clamp-2 text-base font-medium leading-snug">{it.title}</b>
      </span>
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
