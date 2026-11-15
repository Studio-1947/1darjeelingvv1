import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MapEmbed from '@/components/MapEmbed';
import SmartImg from '@/components/SmartImg';
import api from '@/lib/api';
import { optionLabel } from '@/lib/optionLabel';
import { RouteFare } from '@/lib/routeFares';
import { distanceTo, kmLabel } from '@/lib/places';
import { mapPinFor } from '@/lib/listingContent';
import {
  NavigationArrow, CalendarStar, Path as Route, Crosshair, Clock, Ticket, Mountains as Mountain, Check, Compass, MapPin,
  PersonSimpleHike,
} from '@phosphor-icons/react';
import { Button, ButtonLink, SecHead, SeeAll } from '@/components/ag';
import { Section, PriceRow, Fact, PersonCard, MiniCard } from './primitives';
import { HostFacts } from './profileSections';

// The blocks of the listing page, top to bottom as the page lays them out. The page decides which
// blocks a listing type gets; each block only renders it.

/** "About this": the description and the listing's tags (prototype: box "About this"). */
export function AboutSection({ item, about, label }: { item: any; about?: string; label?: string }) {
  const { t } = useTranslation();
  if (!about && !(item.tags?.length > 0)) return null;
  return (
    <Section title={label || t('detail.about')} testid="detail-about">
      {/* whitespace-pre-line so an `about` written as multiple paragraphs keeps its breaks. */}
      {about && <p className="m-0 text-[16px] leading-6 text-[var(--ink7)] whitespace-pre-line">{about}</p>}
      {item.tags?.length > 0 && (
        <div className="ag-chips">
          {item.tags.map((tg: string) => <span key={tg} className="ag-chip !h-8 !px-3 !text-[13px] cursor-default">{optionLabel(t, tg)}</span>)}
        </div>
      )}
    </Section>
  );
}

/** "Why go" bullets for a tourist spot, written by an admin in the console (extras.highlights). */
export function HighlightsSection({ highlights }: { highlights: string[] }) {
  const { t } = useTranslation();
  return (
    <Section title={t('detail.highlights')} note={t('detail.highlights_note')} testid="detail-highlights">
      <ul className="grid gap-2.5">
        {/* Keyed by position, not by text: nothing stops an admin entering the same bullet twice. */}
        {highlights.map((h, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[15px] leading-[22px] text-[var(--ink-strong)]">
            <Check weight="bold" className="mt-1 w-4 h-4 flex-none text-[var(--r)]" aria-hidden="true" />
            <span>{h}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * The facts list under the title: practical visitor information for a tourist spot (each fact
 * only when the admin filled it in), or the season of a festival.
 */
export function VisitInfoSection({ facts, howToReach }: {
  facts: { timings?: string; entryFee?: string; bestTime?: string; altitude?: string };
  howToReach?: string;
}) {
  const { t } = useTranslation();
  const rows = [
    { key: 'timings', icon: <Clock />, label: t('detail.timings'), value: facts.timings },
    { key: 'entry_fee', icon: <Ticket />, label: t('detail.entry_fee'), value: facts.entryFee },
    { key: 'best_time', icon: <CalendarStar />, label: t('detail.best_time'), value: facts.bestTime },
    { key: 'altitude', icon: <Mountain />, label: t('detail.altitude'), value: facts.altitude },
  ].filter((r) => !!r.value);
  return (
    <Section title={t('detail.plan_visit')} testid="detail-visit-info">
      <ul className="grid gap-3">
        {rows.map((r) => <Fact key={r.key} icon={r.icon} label={r.label} value={r.value} testid={`detail-fact-${r.key}`} />)}
        {howToReach && <Fact icon={<Compass />} label={t('detail.how_to_reach')} value={howToReach} testid="detail-how-to-reach" />}
      </ul>
      {rows.length > 0 && (
        <p className="ag-small !text-[12px] !leading-4">
          * {t('detail.ticket_disclaimer', 'Note: Entry fees, ticket charges, and timings are set by local administration and subject to seasonal revision. We strive to keep details updated.')}
        </p>
      )}
    </Section>
  );
}

/** When to go, for a festival. */
export function BestTimeSection({ bestTime }: { bestTime: string }) {
  const { t } = useTranslation();
  return (
    <Section testid="detail-besttime">
      <ul className="grid"><Fact icon={<CalendarStar />} label={t('detail.best_time')} value={bestTime} /></ul>
    </Section>
  );
}

/**
 * The swipeable strip of photos under the title (prototype `.strip`): 150px tiles, 4:3, each
 * labelled with what it shows when the host said (front, outside, room).
 */
export function PhotoStrip({ item, photos, label, testid = 'detail-photos' }: {
  item: any;
  photos: { src: string; tag?: string; groupTestid?: string }[];
  label?: string;
  testid?: string;
}) {
  const { t } = useTranslation();
  if (!photos.length) return null;
  return (
    <div role="list" aria-label={label || t('detail.photos')} data-testid={testid}
      className="-mx-4 px-4 flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {photos.map((p, i) => (
        <div key={p.src + i} role="listitem" data-testid={p.groupTestid}
          className="relative flex-none w-[150px] aspect-[4/3] rounded-[12px] overflow-hidden bg-[var(--creme2)] snap-start">
          <SmartImg src={p.src} alt={t('detail.gallery_alt', { index: i + 1 }) + (item?.title ? ` · ${item.title}` : '')} className="w-full h-full object-cover" />
          {p.tag && <span className="absolute left-1.5 bottom-1.5 ag-status !bg-[var(--surface)] !text-[var(--ink-strong)]">{p.tag}</span>}
        </div>
      ))}
    </div>
  );
}

/** "Facilities" (prototype `.facgrid`): three across, a red icon over each label. */
export function OffersSection({ amenities, title }: { amenities: { Icon: any; label: string; labelKey?: string }[]; title?: string }) {
  const { t } = useTranslation();
  return (
    <Section title={title || t('detail.offers')} testid="detail-offers">
      <div className="grid grid-cols-3 gap-2">
        {amenities.map(({ Icon, label, labelKey }) => (
          <div key={label} className="flex flex-col items-center justify-center gap-1.5 min-h-[96px] p-2 rounded-[16px] border border-[var(--blush2)] bg-[var(--blush)] text-center">
            <span className="ag-micon !w-9 !h-9 !bg-[var(--surface)]"><Icon aria-hidden="true" /></span>
            {/* Amenities are stored in English; only the display is localised. */}
            <span className="text-[12px] leading-4 text-[var(--ink-strong)] line-clamp-2">{labelKey ? t(labelKey) : optionLabel(t, label)}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** "Meet your host" (homestays). */
export function HostSection({ item, host, personSrc }: { item: any; host: any; personSrc?: string }) {
  const { t } = useTranslation();
  const ownLanguages = Array.isArray(item.extras?.languages) && item.extras.languages.length > 0;
  return (
    <PersonCard testid="detail-host" title={t('detail.host')} name={host.name} photo={personSrc} verified={host.verified}
      place={item.location} bio={host.bio}>
      <HostFacts extras={ownLanguages ? item.extras : { ...item.extras, languages: host.languages }} />
    </PersonCard>
  );
}

/** "Meet your driver" (drivers): the car and seats as chips. */
export function DriverSection({ item, about, personSrc }: { item: any; about?: string; personSrc?: string }) {
  const { t } = useTranslation();
  const e = item.extras || {};
  const chips = [
    e.car_model,
    e.vehicle_type,
    Number(e.seats) > 0 ? t('profile.seats_count', { count: Number(e.seats) }) : '',
    e.gender ? t(`profile.gender_${e.gender}`, { defaultValue: e.gender }) : '',
  ].filter(Boolean) as string[];
  return (
    <PersonCard testid="detail-driver" title={t('detail.meet_driver')} name={item.title} photo={personSrc} verified={!!item.provider_verified}
      place={item.location} chips={chips} bio={about}>
      <HostFacts extras={e} />
    </PersonCard>
  );
}

/** Routes a driver operates, each with its own fare (prototype "Trips and fares"). */
export function RoutesSection({ routes }: { routes: RouteFare[] }) {
  const { t } = useTranslation();
  return (
    <Section title={t('detail.routes_title')} note={t('detail.routes_note')} testid="detail-routes">
      <div className="flex flex-col">
        {/* Editorial routes carry no quote, so the fare is simply omitted rather than shown as ₹0. */}
        {routes.map((r, i) => (
          <PriceRow key={i} icon={<Route />} name={optionLabel(t, r.route)} price={r.price} unit={t(`widgets.per_${r.unit}`)} />
        ))}
      </div>
    </Section>
  );
}

/** Where it is: the map, the place, and a directions button. Biodiversity lists where it is seen. */
export function LocationSection({ item, coords, spotted, onOpenMaps }: {
  item: any;
  coords?: [number, number];
  spotted?: string[];
  onOpenMaps: () => void;
}) {
  const { t } = useTranslation();
  const isBio = item.type === 'biodiversity';
  return (
    <Section title={isBio ? t('detail.spotted') : t('detail.location')} note={isBio ? t('detail.spotted_note') : undefined}
      testid={isBio ? 'detail-spotted' : 'detail-location'}>
      <div className="rounded-[16px] overflow-hidden border border-[var(--warmline)]">
        <MapEmbed coords={coords!} title={item.location} className="w-full h-[220px]" />
      </div>
      {isBio && spotted && spotted.length > 0 ? (
        <div className="ag-chips">
          {spotted.map((s) => (
            <span key={s} className="ag-chip !h-8 !px-3 !text-[13px] cursor-default"><Crosshair aria-hidden="true" className="text-[var(--r)]" /> {s}</span>
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          <span className="ag-lead">{item.location}</span>
          {item.extras?.address && <span className="ag-small">{item.extras.address}</span>}
        </div>
      )}
      <Button size="sm" className="self-start" onClick={onOpenMaps} data-testid="detail-open-maps" icon={<NavigationArrow />}>
        {t('cta.get_directions')}
      </Button>
    </Section>
  );
}

/** Within 40 km of the place, nearest first (prototype nearbyFor). */
const NEAR_KM = 40;

function useNearby(type: string, from?: [number, number]) {
  const [rows, setRows] = useState<{ item: any; km: number; approx: boolean }[] | null>(null);
  useEffect(() => {
    if (!from) { setRows([]); return undefined; }
    let cancelled = false;
    api.get('/listings', { params: { type, limit: 60 } })
      .then(({ data }) => {
        const here = { lat: from[0], lng: from[1] };
        const near = ((data?.items || []) as any[])
          .filter((l) => l?.extras?.available !== false)
          .map((l) => ({ item: l, d: distanceTo(here, l) }))
          .filter((r) => r.d && r.d.km <= NEAR_KM)
          .sort((a, b) => a.d!.km - b.d!.km)
          .slice(0, 4)
          .map((r) => ({ item: r.item, km: r.d!.km, approx: r.d!.approx }));
        if (!cancelled) setRows(near);
      })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [type, from?.[0], from?.[1]]);
  return rows;
}

function NearRow({ type, eyebrow, title, seeAll, from }: { type: string; eyebrow: string; title: string; seeAll: string; from?: [number, number] }) {
  const { t } = useTranslation();
  const rows = useNearby(type, from);
  if (rows === null) return null;
  const badge = (r: { km: number; approx: boolean }) => (r.km < 1 && !r.approx ? t('detail.under_1km', 'under 1 km') : kmLabel(r));
  return (
    <section data-testid={`detail-near-${type}`}>
      <SecHead eyebrow={eyebrow} title={title} action={<SeeAll to={seeAll}>{t('detail.see_all', 'See all')}</SeeAll>} className="!mt-0" />
      {rows.length ? (
        <div className="grid grid-cols-2 gap-2.5">
          {rows.map((r) => <MiniCard key={r.item.id} item={r.item} badge={badge(r)} />)}
        </div>
      ) : (
        <p className="ag-small">{t('detail.nothing_near', 'Nothing within 40 km yet.')}</p>
      )}
    </section>
  );
}

/**
 * A place to visit leads on to the rest of the trip: stays and drivers within 40 km of its pin
 * (the same public listings the category pages read), and the guides.
 */
export function NearbySection({ item }: { item: any }) {
  const { t } = useTranslation();
  const pin = mapPinFor(item);
  const place = encodeURIComponent(item.location || item.title);
  return (
    <div className="flex flex-col gap-4" data-testid="detail-getting-there">
      {pin && <NearRow type="homestay" eyebrow={t('detail.stay_near', 'Stay nearby')} title={t('categories.homestay')} seeAll="/homestays" from={pin} />}
      {pin && <NearRow type="driver" eyebrow={t('detail.ride_near', 'Drivers nearby')} title={t('categories.driver')} seeAll={`/drivers?to=${place}`} from={pin} />}
      <div className="ag-row">
        <ButtonLink go to={`/drivers?to=${place}`} data-testid="getting-there-drivers">{t('detail.find_driver_here')}</ButtonLink>
        <ButtonLink go to="/guides" icon={<PersonSimpleHike />} data-testid="getting-there-guides">{t('detail.find_guide')}</ButtonLink>
      </div>
    </div>
  );
}
