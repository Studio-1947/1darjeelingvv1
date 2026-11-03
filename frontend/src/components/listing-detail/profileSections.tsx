import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Translate as Languages, Medal, InstagramLogo, FacebookLogo, YoutubeLogo, Globe, PlayCircle,
  Compass, Bed, ForkKnife, Car, ArrowRight, CalendarBlank, MoonStars, Storefront, Moped, UsersThree,
} from '@phosphor-icons/react';
import api from '@/lib/api';
import { listingImage } from '@/lib/listingContent';
import VerifiedBadge from '@/components/provider/VerifiedBadge';
import { Screen, SectionHead, Avatar, ALIGN_TEXT, ALIGN_ROW, ALIGN_BLOCK } from './primitives';

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

/** Languages, years of experience, an intro video and social links, as one block of facts. */
export function HostFacts({ extras }: { extras: any }) {
  const { t } = useTranslation();
  const languages: string[] = Array.isArray(extras?.languages) ? extras.languages : [];
  const years = Number(extras?.experience_years);
  const social = extras?.social && typeof extras.social === 'object' ? extras.social : {};
  const links = SOCIAL.filter((s) => typeof social[s.key] === 'string' && social[s.key]);
  const video = typeof extras?.intro_video === 'string' && extras.intro_video ? extras.intro_video : '';
  if (!languages.length && !(years > 0) && !links.length && !video) return null;
  return (
    <div className={`mt-6 space-y-3 ${ALIGN_TEXT}`} data-testid="host-facts">
      {languages.length > 0 && (
        <p className={`text-ink-soft flex items-center ${ALIGN_ROW} gap-2`}>
          <Languages size={18} className="text-pine flex-shrink-0" /> {t('detail.speaks')}: {languages.join(', ')}
        </p>
      )}
      {years > 0 && (
        <p className={`text-ink-soft flex items-center ${ALIGN_ROW} gap-2`}>
          <Medal size={18} className="text-pine flex-shrink-0" /> {t('profile.experience_years', { count: years })}
        </p>
      )}
      {(video || links.length > 0) && (
        <div className={`flex flex-wrap items-center ${ALIGN_ROW} gap-2 pt-1`}>
          {video && (
            <a href={video} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--line)] bg-white text-sm font-bold text-ink btn-hover">
              {t('profile.watch_intro')} <PlayCircle size={16} className="text-pine" />
            </a>
          )}
          {links.map(({ key, Icon, href }) => (
            <a key={key} href={href(social[key])} target="_blank" rel="noreferrer" aria-label={t(`profile.social_${key}`)}
              className="w-9 h-9 rounded-full border border-[var(--line)] bg-white grid place-items-center text-ink btn-hover">
              <Icon size={18} />
            </a>
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
  const name = e.host_name || item.title;
  const types: string[] = Array.isArray(e.guide_types) ? e.guide_types : [];
  const seasons: string[] = Array.isArray(e.seasons) ? e.seasons : [];
  const chips = [
    ...types.map((g) => t(`profile.guide_type_${g}`, { defaultValue: g })),
    ...(Number(e.age) > 0 ? [t('profile.age_years', { count: Number(e.age) })] : []),
    ...(e.gender ? [t(`profile.gender_${e.gender}`, { defaultValue: e.gender })] : []),
  ];
  return (
    <Screen tone="bg" testid="detail-guide">
      <SectionHead label={t('detail.meet_guide')} title={t('detail.meet_guide')} />
      <div className={`mt-10 ${ALIGN_TEXT} max-w-2xl ${ALIGN_BLOCK}`}>
        <Avatar photo={photo} initial={(name || '?').trim().charAt(0).toUpperCase()} />
        <div className={`mt-6 flex items-center ${ALIGN_ROW} gap-2 flex-wrap`}>
          <span className="font-display font-extrabold text-2xl md:text-3xl text-ink">{name}</span>
          {item.provider_verified && <VerifiedBadge size="sm" />}
        </div>
        {chips.length > 0 && (
          <div className={`mt-3 flex items-center ${ALIGN_ROW} gap-2 flex-wrap`}>
            {chips.map((c) => (
              <span key={c} className="chip bg-white border border-[var(--line)] text-ink font-bold text-xs">{c}</span>
            ))}
          </div>
        )}
        {e.host_bio && <p className="mt-6 text-lg text-ink leading-relaxed whitespace-pre-line">{e.host_bio}</p>}
        {seasons.length > 0 && (
          <p className={`mt-4 text-ink-soft flex items-center ${ALIGN_ROW} gap-2`}>
            <CalendarBlank size={18} className="text-pine flex-shrink-0" />
            {t('profile.seasons_label')}: {seasons.map((s) => t(`profile.season_${s}`, { defaultValue: s })).join(', ')}
          </p>
        )}
        <HostFacts extras={e} />
      </div>
    </Screen>
  );
}

type Priced = { name: string; price: number; unit?: string };

function PriceRows({ rows, Icon, unitLabel }: { rows: Priced[]; Icon: any; unitLabel: (u?: string) => string }) {
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-4 p-5 rounded-2xl border border-[var(--line)] bg-white text-left">
          <Icon size={22} className="text-pine flex-shrink-0" />
          <span className="flex-1 text-ink font-semibold">{r.name}</span>
          {r.price > 0 && (
            <span className="flex-shrink-0 text-right">
              <span className="font-display font-extrabold text-lg text-ink">₹{r.price.toLocaleString('en-IN')}</span>
              <span className="block text-xs font-semibold text-ink-soft">{unitLabel(r.unit)}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** A guide's services, each with its charge. */
export function ServicesSection({ services }: { services: Priced[] }) {
  const { t } = useTranslation();
  if (!services.length) return null;
  return (
    <Screen tone="mist" testid="detail-services">
      <SectionHead label={t('detail.services_label')} title={t('detail.services_title')} note={t('detail.services_note')} />
      <div className={`mt-10 max-w-2xl ${ALIGN_BLOCK}`}>
        <PriceRows rows={services} Icon={Compass} unitLabel={(u) => t(`profile.unit_${u || 'day'}`)} />
      </div>
    </Screen>
  );
}

/** A homestay's rooms and food, each with its charge. */
export function RoomsFoodSection({ rooms, meals, homeDelivery }: { rooms: Priced[]; meals: Priced[]; homeDelivery?: boolean }) {
  const { t } = useTranslation();
  if (!rooms.length && !meals.length) return null;
  return (
    <Screen tone="mist" testid="detail-rooms">
      <SectionHead label={t('detail.rooms_label')} title={t('detail.rooms_title')} />
      <div className={`mt-10 max-w-2xl ${ALIGN_BLOCK} space-y-8`}>
        {rooms.length > 0 && (
          <div>
            <h3 className={`mb-3 text-xs font-bold uppercase tracking-widest text-ink-soft ${ALIGN_TEXT}`}>{t('profile.rooms')}</h3>
            <PriceRows rows={rooms} Icon={Bed} unitLabel={(u) => t(`profile.unit_${u || 'night'}`)} />
          </div>
        )}
        {meals.length > 0 && (
          <div>
            <h3 className={`mb-3 text-xs font-bold uppercase tracking-widest text-ink-soft ${ALIGN_TEXT}`}>{t('profile.meals')}</h3>
            <PriceRows rows={meals} Icon={ForkKnife} unitLabel={(u) => t(`profile.unit_${u || 'meal'}`)} />
          </div>
        )}
        {homeDelivery && (
          <p className={`text-ink-soft flex items-center ${ALIGN_ROW} gap-2`}>
            <MoonStars size={18} className="text-pine" /> {t('profile.home_delivery_on')}
          </p>
        )}
      </div>
    </Screen>
  );
}

/** A cafe's menu or a shop's goods, each with its price, and whether they deliver. */
export function PriceListSection({ kind, rows, homeDelivery, capacity = 0 }: { kind: 'menu' | 'goods'; rows: Priced[]; homeDelivery?: boolean; capacity?: number }) {
  const { t } = useTranslation();
  if (!rows.length && !homeDelivery && !(capacity > 0)) return null;
  return (
    <Screen tone="mist" testid={`detail-${kind}`}>
      <SectionHead label={t(`detail.${kind}_label`)} title={t(`detail.${kind}_title`)} note={t(`detail.${kind}_note`)} />
      <div className={`mt-10 max-w-2xl ${ALIGN_BLOCK} space-y-6`}>
        {rows.length > 0 && (
          <PriceRows rows={rows} Icon={kind === 'menu' ? ForkKnife : Storefront}
            unitLabel={(u) => t(`profile.unit_${u || (kind === 'menu' ? 'plate' : 'item')}`)} />
        )}
        {homeDelivery && (
          <p className={`text-ink-soft flex items-center ${ALIGN_ROW} gap-2`} data-testid="detail-home-delivery">
            <Moped size={18} className="text-pine" /> {kind === 'menu' ? t('profile.home_delivery_on') : t('profile.home_delivery_shop')}
          </p>
        )}
        {capacity > 0 && (
          <p className={`text-ink-soft flex items-center ${ALIGN_ROW} gap-2`} data-testid="detail-capacity">
            <UsersThree size={18} className="text-pine" /> {t(kind === 'menu' ? 'profile.capacity_cafe' : 'profile.capacity_shop', { count: capacity })}
          </p>
        )}
      </div>
    </Screen>
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
    <Screen tone="white" testid="detail-recommended-drivers">
      <SectionHead label={t('detail.recommended_label')} title={t('detail.recommended_title')} note={t('detail.recommended_note')} />
      <div className="mt-10 grid sm:grid-cols-2 gap-4">
        {drivers.map((d) => (
          <Link key={d.id} to={`/listing/${d.id}`} className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--line)] bg-white btn-hover text-left">
            <img src={listingImage(d, 200, 200)} alt="" className="w-16 h-16 rounded-xl object-cover bg-mist" />
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-ink truncate">{d.title}</span>
              <span className="block text-sm text-ink-soft truncate">{d.location}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-bold text-pine">
              {t('common.view')} <ArrowRight size={14} />
            </span>
          </Link>
        ))}
      </div>
    </Screen>
  );
}

/** Shown in the reserve area when a host has switched availability off. */
export function UnavailableNotice() {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-5 text-left" data-testid="host-unavailable">
      <p className="font-bold text-ink flex items-center gap-2"><Car size={18} className="text-ink-soft" /> {t('detail.unavailable_title')}</p>
      <p className="mt-1 text-sm text-ink-soft">{t('detail.unavailable_body')}</p>
    </div>
  );
}
