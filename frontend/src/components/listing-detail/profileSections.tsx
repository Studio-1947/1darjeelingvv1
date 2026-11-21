import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InstagramLogo, FacebookLogo, YoutubeLogo, Globe, PlayCircle } from '@phosphor-icons/react';
import { Icon, type IconName } from '@/components/ag/Icon';
import api from '@/lib/api';
import { Box, ButtonA, SecHead } from '@/components/ag';
import { Section, PriceRow, PersonCard, MiniCard } from './primitives';
import { roomFit } from '@/lib/roomFit';

/**
 * Sections for what hosts fill in on their business profile (backend lib/hostProfile.ts): the
 * guide's own sections, rooms and food for a homestay, the drivers a homestay recommends, and the
 * facts every host can add about themselves. Each renders nothing when the host left it empty.
 */

const SOCIAL = [
  { key: 'instagram', Icon: InstagramLogo, href: (v: string) => (/^https?:/i.test(v) ? v : `https://instagram.com/${v.replace(/^@/, '')}`) },
  { key: 'facebook', Icon: FacebookLogo, href: (v: string) => (/^https?:/i.test(v) ? v : `https://facebook.com/${v}`) },
  { key: 'youtube', Icon: YoutubeLogo, href: (v: string) => (/^https?:/i.test(v) ? v : `https://youtube.com/${v}`) },
  { key: 'website', Icon: Globe, href: (v: string) => (/^https?:/i.test(v) ? v : `https://${v}`) },
] as const;

/** An uploaded intro video (played here) rather than an older YouTube or Instagram link. */
const isVideoFile = (url: string) => /\.(mp4|mov|webm)(\?|$)/i.test(url) || /\/videos\//.test(url);

/** A small line with a red icon (seasons, experience, delivery, hours). */
function Line({ icon, children, testid }: { icon: IconName; children: React.ReactNode; testid?: string }) {
  return (
    <p className="m-0 flex items-center gap-2 text-[15px] leading-[22px] text-[var(--ink7)]" data-testid={testid}>
      <Icon name={icon} size={18} className="text-[var(--r)]" /><span className="min-w-0">{children}</span>
    </p>
  );
}

/** Languages (prototype "Speaks" chips), years of experience, an intro video and social links. */
export function HostFacts({ extras, noLanguages }: { extras: any; noLanguages?: boolean }) {
  const { t } = useTranslation();
  const languages: string[] = !noLanguages && Array.isArray(extras?.languages) ? extras.languages : [];
  const years = Number(extras?.experience_years);
  const social = extras?.social && typeof extras.social === 'object' ? extras.social : {};
  const links = SOCIAL.filter((s) => typeof social[s.key] === 'string' && social[s.key]);
  const video = typeof extras?.intro_video === 'string' && extras.intro_video ? extras.intro_video : '';
  if (!languages.length && !(years > 0) && !links.length && !video) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="host-facts">
      {languages.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="ag-listing-langlab"><Icon name="globe" />{t('listing.speaks', 'Speaks')}</span>
          {languages.map((l) => <span key={l} className="ag-listing-langchip">{l}</span>)}
        </div>
      )}
      {years > 0 && <Line icon="badge">{t('profile.experience_years', { count: years })}</Line>}
      {video && isVideoFile(video) && (
        <video src={video} controls playsInline preload="metadata" className="w-full rounded-[16px] bg-[var(--ink-strong)] aspect-video" data-testid="host-intro-video" />
      )}
      {((video && !isVideoFile(video)) || links.length > 0) && (
        <div className="ag-row">
          {video && !isVideoFile(video) && (
            <ButtonA size="sm" href={video} target="_blank" rel="noreferrer" icon={<PlayCircle />}>{t('profile.watch_intro')}</ButtonA>
          )}
          {links.map(({ key, Icon, href }) => (
            <a key={key} href={href(social[key])} target="_blank" rel="noreferrer" aria-label={t(`profile.social_${key}`)} title={t(`profile.social_${key}`)}
              className="ag-iconbtn"><Icon /></a>
          ))}
        </div>
      )}
    </div>
  );
}

/** "Meet your guide": portrait, name, the kinds of guiding they do, and the facts. */
export function GuideSection({ item, photo }: { item: any; photo?: string }) {
  const { t } = useTranslation();
  const e = item.extras || {};
  const types: string[] = Array.isArray(e.guide_types) ? e.guide_types : [];
  const seasons: string[] = Array.isArray(e.seasons) ? e.seasons : [];
  const chips = [
    ...types.map((g) => t(`profile.guide_type_${g}`, { defaultValue: g })),
    ...(Number(e.age) > 0 ? [t('profile.age_years', { count: Number(e.age) })] : []),
    ...(e.gender ? [t(`profile.gender_${e.gender}`, { defaultValue: e.gender })] : []),
  ];
  return (
    <PersonCard testid="detail-guide" title={t('detail.meet_guide')} name={e.host_name || item.title} photo={photo}
      verified={!!item.provider_verified} place={item.location} chips={chips} bio={e.host_bio}>
      {seasons.length > 0 && (
        <Line icon="hourglass">
          {t('profile.seasons_label')}: {seasons.map((s) => t(`profile.season_${s}`, { defaultValue: s })).join(', ')}
        </Line>
      )}
      <HostFacts extras={e} noLanguages />
    </PersonCard>
  );
}

type Priced = { name: string; price: number; unit?: string; photo?: string };

/** A guide's services, each with its charge. */
export function ServicesSection({ services }: { services: Priced[] }) {
  const { t } = useTranslation();
  if (!services.length) return null;
  return (
    <Section title={t('detail.services_title')} testid="detail-services">
      <div className="flex flex-col">
        {services.map((s, i) => (
          <PriceRow key={i} photo={s.photo} name={s.name} price={Number(s.price) || 0} unit={t(`profile.unit_${s.unit || 'day'}`)} />
        ))}
      </div>
    </Section>
  );
}

/** A homestay's rooms and food, each with its charge (prototype box "Rooms"). */
export function RoomsFoodSection({ rooms, meals }: { rooms: Priced[]; meals: Priced[] }) {
  const { t } = useTranslation();
  if (!rooms.length && !meals.length) return null;
  return (
    <Section title={meals.length && !rooms.length ? t('profile.meals') : t('listing.rooms', 'Rooms')} testid="detail-rooms">
      {rooms.length > 0 && (
        <div className="flex flex-col">
          {rooms.map((r, i) => {
            const size = Number((r as any).occ || (r as any).capacity);
            // "2 people · +1 on extra mattress (₹400)": what the room sleeps and how many more fit (lib/roomFit.ts).
            const fit = roomFit(r);
            const extra = fit.extraBeds > 0
              ? ` · ${t('listing.extra_mattress', { count: fit.extraBeds })}${fit.extraBedPrice > 0 ? ` (₹${fit.extraBedPrice.toLocaleString('en-IN')})` : ''}`
              : '';
            return (
              <PriceRow key={i} photo={r.photo} name={r.name} sub={size > 0 ? `${size} ${t('listing.ppl', 'people')}${extra}` : undefined}
                price={Number(r.price) || 0} unit={t(`profile.unit_${r.unit || 'night'}`)} />
            );
          })}
        </div>
      )}
      {meals.length > 0 && (
        <div className="flex flex-col">
          {rooms.length > 0 && <span className="ag-eyebrow mt-2">{t('profile.meals')}</span>}
          {meals.map((m, i) => (
            <PriceRow key={i} photo={m.photo} name={m.name} price={Number(m.price) || 0} unit={t(`profile.unit_${m.unit || 'meal'}`)} />
          ))}
        </div>
      )}
    </Section>
  );
}

/** A cafe's menu or a shop's goods, each with its price, and whether they deliver. */
export function PriceListSection({ kind, rows, homeDelivery, capacity = 0, shopKind, openingHours = '' }: { kind: 'menu' | 'goods'; rows: Priced[]; homeDelivery?: boolean; capacity?: number; shopKind?: string; openingHours?: string }) {
  const { t } = useTranslation();
  if (!rows.length && !homeDelivery && !(capacity > 0) && !openingHours) return null;
  return (
    <Section title={t(`detail.${kind}_title`)} testid={`detail-${kind}`}>
      {shopKind && <span className="ag-listing-dlvtag self-start" data-testid="detail-shop-kind">{shopKind}</span>}
      {rows.length > 0 && (
        <div className="flex flex-col">
          {rows.map((r, i) => (
            <PriceRow key={i} photo={r.photo} name={r.name}
              price={Number(r.price) || 0} unit={t(`profile.unit_${r.unit || (kind === 'menu' ? 'plate' : 'item')}`)} />
          ))}
        </div>
      )}
      {homeDelivery && (
        <Line icon="bag" testid="detail-home-delivery">
          {kind === 'menu' ? t('profile.home_delivery_on') : t('profile.home_delivery_shop')}
        </Line>
      )}
      {openingHours && <Line icon="hourglass" testid="detail-opening-hours">{t('profile.opening_hours', { hours: openingHours })}</Line>}
      {capacity > 0 && (
        <Line icon="person" testid="detail-capacity">
          {t(kind === 'menu' ? 'profile.capacity_cafe' : 'profile.capacity_shop', { count: capacity })}
        </Line>
      )}
    </Section>
  );
}

/**
 * "Meet the owner" for a cafe or a shop: only what the owner filled in on their business profile
 * (no stand-in story), with their languages, experience, intro video and social links.
 */
export function OwnerSection({ item, verified }: { item: any; verified: boolean }) {
  const { t } = useTranslation();
  const e = item.extras || {};
  const name: string = e.host_name || '';
  const hasAnything = name || e.host_bio || e.host_avatar || e.intro_video || (Array.isArray(e.languages) && e.languages.length) || Number(e.experience_years) > 0;
  if (!hasAnything) return null;
  return (
    <PersonCard testid="detail-owner" title={t('detail.owner_title')} name={name || item.title} photo={e.host_avatar || undefined}
      verified={verified && !!name} bio={e.host_bio}>
      <HostFacts extras={e} noLanguages />
    </PersonCard>
  );
}

/** The drivers a homestay recommends, each linking to the driver's own page. */
export function RecommendedDriversSection({ ids }: { ids: string[] }) {
  const { t } = useTranslation();
  const [drivers, setDrivers] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all(ids.slice(0, 10).map((id) => api.get(`/listings/${id}`).then((r) => r.data.item).catch(() => null)))
      .then((rows) => { if (!cancelled) setDrivers(rows.filter((d) => d && d.type === 'driver')); });
    return () => { cancelled = true; };
  }, [ids.join(',')]);
  if (!drivers.length) return null;
  return (
    <section data-testid="detail-recommended-drivers">
      <SecHead eyebrow={t('detail.recommended_label')} title={t('detail.recommended_title')} className="!mt-0" />
      <p className="ag-small -mt-1 mb-2.5">{t('detail.recommended_note')}</p>
      <div className="grid grid-cols-2 gap-2.5">
        {drivers.map((d) => <MiniCard key={d.id} item={d} />)}
      </div>
    </section>
  );
}

/** Shown in the booking box when a host has switched availability off. */
export function UnavailableNotice() {
  const { t } = useTranslation();
  return (
    <Box tone="blush" flat data-testid="host-unavailable" className="!flex-row !items-start">
      <span className="ag-listing-ic40"><Icon name="hourglass" /></span>
      <div className="flex flex-col gap-1">
        <h3>{t('detail.unavailable_title')}</h3>
        <p className="ag-small">{t('detail.unavailable_body')}</p>
      </div>
    </Box>
  );
}

/** "Meet your host" (homestays): the languages are in About, so they are not repeated here. */
export function HostSection({ item, host, personSrc }: { item: any; host: any; personSrc?: string }) {
  const { t } = useTranslation();
  return (
    <PersonCard testid="detail-host" title={t('detail.host')} name={host.name} photo={personSrc} verified={host.verified}
      place={item.location} bio={item.extras?.host_bio || undefined}>
      <HostFacts extras={item.extras} noLanguages />
    </PersonCard>
  );
}

/** "Meet your driver" (drivers): the car and seats as chips. */
export function DriverSection({ item, personSrc }: { item: any; personSrc?: string }) {
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
      place={item.location} chips={chips} bio={e.host_bio || undefined}>
      <HostFacts extras={e} noLanguages />
    </PersonCard>
  );
}
