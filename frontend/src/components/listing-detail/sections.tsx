import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MapEmbed from '@/components/MapEmbed';
import api from '@/lib/api';
import { optionLabel } from '@/lib/optionLabel';
import { RouteFare } from '@/lib/routeFares';
import { distanceTo } from '@/lib/places';
import { mapPinFor } from '@/lib/listingContent';
import { Button, ButtonLink, SecHead, SeeAll } from '@/components/ag';
import { Icon, type IconName } from '@/components/ag/Icon';
import { StayCard } from '@/components/home/cards';
import { Section, PriceRow } from './primitives';

// The blocks of the listing page, top to bottom as the prototype's item view lays them out. The
// page decides which blocks a listing type gets; each block only renders it.

/** The prototype's facility icons (app.js FACI): the first pattern that matches the label wins. */
const FACI: [RegExp, IconName][] = [
  [/meal|food|kitchen|thali|momo|breakfast|dinner|cook|menu|coffee|tea\b|bakery/i, 'cup'],
  [/wi-?fi|internet|language|speaks|lingual/i, 'globe'],
  [/hot water|heat|geyser|fire|bonfire|heater|cosy|cozy/i, 'sun'],
  [/park/i, 'car'],
  [/garden|forest|tea|organic|farm|pine|nature|habitat|flora/i, 'leaf'],
  [/pet|dog|cat|wildlife/i, 'heart'],
  [/view|mountain|kanchenjunga|sunrise|photo/i, 'mountain'],
  [/family|group|kid|child|walk-in|visitor/i, 'person'],
  [/airport|pickup|drop|ride|vehicle|driver|fuel|luggage|transfer|hire/i, 'car'],
  [/balcony|room|bed|home/i, 'home'],
  [/upi|card|cash|pay|gift|made|owned|goods/i, 'bag'],
  [/first aid|medic/i, 'plus'],
  [/route|trek|walk|guide|sightseeing/i, 'trek'],
];
const facIcon = (label: string): IconName => (FACI.find(([r]) => r.test(label)) || [0, 'check' as IconName])[1];

/** "About this": the description, the languages spoken and when it joined aangan. */
export function AboutSection({ item, about, label, languages }: { item: any; about?: string; label?: string; languages?: string[] }) {
  const { t, i18n } = useTranslation();
  const joined = item.created_at ? new Date(item.created_at) : null;
  const joinedText = joined && !isNaN(joined.getTime())
    ? joined.toLocaleDateString(i18n.language === 'en' ? 'en-IN' : i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  if (!about && !languages?.length) return null;
  return (
    <Section title={label || t('listing.about', 'About this')} testid="detail-about">
      {about && <p className="text-[16px] leading-6 text-[var(--ink7)] whitespace-pre-line">{about}</p>}
      {languages && languages.length > 0 && (
        <div className="ag-listing-langrow">
          <span className="ag-listing-langlab"><Icon name="globe" /> {t('listing.speaks', 'Speaks')}</span>
          {languages.map((l) => <span key={l} className="ag-listing-langchip">{l}</span>)}
        </div>
      )}
      {joinedText && (
        <p className="ag-small ag-listing-joined"><Icon name="check" /> {t('listing.joinedA', 'On aangan since')} {joinedText}</p>
      )}
    </Section>
  );
}

/**
 * The facts box for a tourist spot (each fact only when the admin filled it in): timings, best
 * season, altitude and the way there, or the season of a festival.
 */
export function VisitInfoSection({ facts, howToReach }: {
  facts: { timings?: string; bestTime?: string; altitude?: string };
  howToReach?: string;
}) {
  const { t } = useTranslation();
  const rows = [
    { key: 'timings', icon: 'hourglass' as IconName, label: t('detail.timings'), value: facts.timings },
    { key: 'best_time', icon: 'sun' as IconName, label: t('detail.best_time'), value: facts.bestTime },
    { key: 'altitude', icon: 'mountain' as IconName, label: t('detail.altitude'), value: facts.altitude },
    { key: 'how_to_reach', icon: 'pin' as IconName, label: t('detail.how_to_reach'), value: howToReach },
  ].filter((r) => !!r.value);
  if (!rows.length) return null;
  return (
    <Section title={t('detail.plan_visit')} testid="detail-visit-info">
      <ul className="grid gap-3 m-0 p-0 list-none">
        {rows.map((r) => (
          <li key={r.key} className="flex items-start gap-3" data-testid={r.key === 'how_to_reach' ? 'detail-how-to-reach' : `detail-fact-${r.key}`}>
            <span className="ag-listing-ic40"><Icon name={r.icon} /></span>
            <span className="min-w-0 flex flex-col">
              <span className="ag-small">{r.label}</span>
              <span className="text-[15px] leading-[22px] text-[var(--ink-strong)] whitespace-pre-line">{r.value}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="ag-small !text-[12px] !leading-4">
        * {t('detail.ticket_disclaimer', 'Note: Entry fees, ticket charges, and timings are set by local administration and subject to seasonal revision. We strive to keep details updated.')}
      </p>
    </Section>
  );
}

/** The entry ticket box of a place to visit (prototype .tktbox). */
export function TicketBox({ price, entryFee }: { price: number; entryFee?: string }) {
  const { t } = useTranslation();
  const paid = price > 0 || !!entryFee;
  return (
    <Section className="ag-listing-tkt" testid="detail-fact-entry_fee">
      <div className="flex items-center gap-3">
        <span className="ag-listing-ic40"><Icon name="t_trip" /></span>
        <div className="min-w-0">
          <b>
            {price > 0
              ? `${t('listing.ticket2', 'Entry ticket')} ₹${price.toLocaleString('en-IN')} ${t('listing.perperson', 'per person')}`
              : entryFee ? `${t('listing.ticket2', 'Entry ticket')}: ${entryFee}` : t('listing.freeentry', 'Free entry')}
          </b>
          <p className="ag-small m-0">{paid ? t('listing.tktgate', 'Buy the ticket at the gate on the day.') : t('listing.tktfree', 'No ticket needed. Just go.')}</p>
        </div>
      </div>
      <p className="ag-small">{t('listing.nobookspot', 'Tickets for places cannot be booked on aangan yet. You can book a stay or a driver nearby below.')}</p>
    </Section>
  );
}

/** When to go, for a festival. */
export function BestTimeSection({ bestTime }: { bestTime: string }) {
  const { t } = useTranslation();
  return (
    <Section testid="detail-besttime">
      <div className="flex items-center gap-3">
        <span className="ag-listing-ic40"><Icon name="hourglass" /></span>
        <span className="flex flex-col"><span className="ag-small">{t('detail.best_time')}</span><b className="font-medium text-[var(--ink-strong)]">{bestTime}</b></span>
      </div>
    </Section>
  );
}

/**
 * "Facilities": three square cards a row with the prototype's icons; for a place to visit, a
 * two-column list with checks.
 */
export function OffersSection({ amenities, list }: { amenities: { label: string; labelKey?: string }[]; list?: boolean }) {
  const { t } = useTranslation();
  const label = (a: { label: string; labelKey?: string }) => (a.labelKey ? t(a.labelKey) : optionLabel(t, a.label));
  return (
    <Section title={t('listing.facil', 'Facilities')} testid="detail-offers">
      {list ? (
        <ul className="ag-listing-facts">
          {amenities.map((a) => <li key={a.label}><Icon name="check" />{label(a)}</li>)}
        </ul>
      ) : (
        <div className="ag-listing-facgrid">
          {/* Amenities are stored in English; only the display is localised. */}
          {amenities.map((a) => (
            <div key={a.label} className="ag-listing-facard">
              <span className="ag-listing-ic40"><Icon name={facIcon(a.label)} /></span>
              <span>{label(a)}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/** Routes a driver operates, each with its own fare (prototype "Trips and fares"). */
export function RoutesSection({ routes }: { routes: RouteFare[] }) {
  const { t } = useTranslation();
  return (
    <Section title={t('listing.fares', 'Trips and fares')} testid="detail-routes">
      <div className="flex flex-col">
        {/* Editorial routes carry no quote, so the fare is simply omitted rather than shown as ₹0. */}
        {routes.map((r, i) => (
          <PriceRow key={i} name={optionLabel(t, r.route)} price={r.price} unit={t(`listing.per_${r.unit}`, r.unit === 'day' ? 'per day' : 'per trip')} />
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
        <MapEmbed coords={coords!} title={item.location} className="w-full h-[200px]" />
      </div>
      {isBio && spotted && spotted.length > 0 ? (
        <div className="ag-listing-langrow">
          {spotted.map((s) => <span key={s} className="ag-listing-langchip">{s}</span>)}
        </div>
      ) : (
        <div className="flex flex-col">
          <span className="ag-lead">{item.location}</span>
          {item.extras?.address && <span className="ag-small">{item.extras.address}</span>}
        </div>
      )}
      <Button variant="tonal" size="sm" className="self-start" onClick={onOpenMaps} data-testid="detail-open-maps" icon={<Icon name="pin" />}>
        {t('listing.direction', 'Direction')}
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
  return (
    <section data-testid={`detail-near-${type}`}>
      <SecHead eyebrow={eyebrow} title={title} action={<SeeAll to={seeAll}>{t('listing.seeall', 'See all')}</SeeAll>} className="!mt-0" />
      {rows.length ? (
        <div className="grid grid-cols-2 gap-2.5">
          {rows.map((r) => <StayCard key={r.item.id} it={r.item} href={`/listing/${r.item.id}`} km={{ km: r.km, approx: r.approx }} />)}
        </div>
      ) : (
        <p className="ag-small">{t('detail.nothing_near', 'Nothing within 40 km yet.')}</p>
      )}
    </section>
  );
}

/**
 * A place to visit leads on to the rest of the trip: stays and drivers within 40 km of its pin
 * (prototype nearbyFor: "Stay nearby", "Drivers nearby"), and the guides.
 */
export function NearbySection({ item }: { item: any }) {
  const { t } = useTranslation();
  const pin = mapPinFor(item);
  const place = encodeURIComponent(item.location || item.title);
  return (
    <div className="flex flex-col gap-4" data-testid="detail-getting-there">
      {pin && <NearRow type="homestay" eyebrow={t('listing.stay_near', 'Stay nearby')} title={t('listing.stays', 'Homestay')} seeAll="/homestays" from={pin} />}
      {pin && <NearRow type="driver" eyebrow={t('listing.ride_near', 'Drivers nearby')} title={t('listing.cars', 'Car & Driver')} seeAll={`/drivers?to=${place}`} from={pin} />}
      <div className="ag-row">
        <ButtonLink go to={`/drivers?to=${place}`} data-testid="getting-there-drivers">{t('detail.find_driver_here')}</ButtonLink>
        <ButtonLink go to="/guides" icon={<Icon name="trek" />} data-testid="getting-there-guides">{t('detail.find_guide')}</ButtonLink>
      </div>
    </div>
  );
}
