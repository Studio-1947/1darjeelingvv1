import React from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, WhatsappLogo, NavigationArrow, SealCheck, Star, PlayCircle, Globe, CrownSimple } from '@phosphor-icons/react';
import { Box, ButtonA, SecHead, Status, cx } from '@/components/ag';
import { themeVars, useMode } from '@/lib/theme';
import SmartImg from '@/components/SmartImg';
import FaceImg from '@/components/FaceImg';

/**
 * A host's mini website, laid out like the board's mock-up (Aangan Blue Print, "Profile: all
 * profiles should look like individual websites"): the address, a cover photo, the host's photo,
 * name, type, badge, experience and joining date, a rating, Call / WhatsApp / Direction, the
 * story, an intro video, and a grid of what they offer with photos and rates.
 *
 * Pure layout over `MiniSiteData`, so the business profile editor shows it as a live preview of
 * what is being typed, and the public page renders the same thing from the saved profile.
 * The app has the same component (src/components/HostMiniSite.tsx).
 */

export type MiniSiteItem = { name: string; price: number; unit?: string; photo?: string };

export type MiniSiteData = {
  type: string;
  name: string;
  hostName?: string;
  avatar?: string;
  cover?: string;
  /** Documents checked by aangan: the blue tick. */
  verified: boolean;
  /** Paid plan live: the Member badge. */
  member?: boolean;
  /** The saved page address; the preview falls back to one made from the name. */
  slug?: string | null;
  experienceYears?: number;
  joinedAt?: string | null;
  rating?: number | null;
  reviewCount?: number;
  location?: string;
  about?: string;
  video?: string;
  languages?: string[];
  items: MiniSiteItem[];
  gallery: string[];
  available: boolean;
  homeDelivery?: boolean;
  /** The business theme colour (palette key or "#RRGGBB", profile.theme); none keeps the viewer's own. */
  theme?: string | null;
};

/** The address a host's page will have: aanganerp.in/<type>/<business-name>. */
export function miniSiteSlug(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'my-business';
}

const isVideoFile = (url: string) => /\.(mp4|mov|webm)(\?|$)/i.test(url) || /\/videos\//.test(url);

/** Real targets for the three buttons on the public page; the editor preview leaves them out. */
export type MiniSiteActions = {
  call?: string | null;
  whatsapp?: string | null;
  direction?: string | null;
  /** Shown instead of Call / WhatsApp when the number is held back (book first, or take the pass). */
  locked?: React.ReactNode;
};

export default function HostMiniSite({ data, actions }: { data: MiniSiteData; actions?: MiniSiteActions }) {
  // Re-render when dark mode is switched, so the business colour follows it.
  const [colourMode] = useMode();
  const { t } = useTranslation();
  const initial = (data.hostName || data.name || '?').trim().charAt(0).toUpperCase();
  const joined = data.joinedAt ? new Date(data.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const stars = Math.round(data.rating || 0);
  const typeLabel = t(`categories.${data.type}`, { defaultValue: data.type });

  // Call (the main action), WhatsApp, Direction. The editor preview has no targets, so it shows
  // the same three as inert shapes; the public page dims any it cannot offer.
  const buttons = [
    { key: 'call', Icon: Phone, label: t('miniSite.call'), variant: 'primary', href: actions?.call },
    { key: 'whatsapp', Icon: WhatsappLogo, label: t('miniSite.whatsapp'), variant: 'std', href: actions?.whatsapp },
    { key: 'direction', Icon: NavigationArrow, label: t('miniSite.direction'), variant: 'tonal', href: actions?.direction },
  ] as const;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4" style={themeVars(data.theme, colourMode)} data-testid="host-mini-site">
      <p className="ag-small flex items-center gap-1.5 truncate">
        <Globe size={14} className="flex-none text-[var(--r)]" aria-hidden="true" />
        <span className="truncate" data-testid="mini-site-address">aanganerp.in/{data.type}/{data.slug || miniSiteSlug(data.name)}</span>
      </p>

      {/* Cover */}
      <div className="relative aspect-[16/9] overflow-hidden rounded-[var(--r-card)] border border-[var(--warmline)] bg-[var(--creme2)]">
        {data.cover && <SmartImg src={data.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        {!data.available && <Status className="absolute right-3 top-3">{t('miniSite.not_taking')}</Status>}
      </div>

      {/* Identity: photo, name with the two marks, type and joining date, stars, place */}
      <div className="flex items-start gap-4">
        <div className="-mt-12 grid h-24 w-24 flex-none place-items-center overflow-hidden rounded-full border-4 border-[var(--surface)] bg-[var(--r-tint)] text-4xl font-medium text-[var(--r)] shadow-sm">
          <FaceImg src={data.avatar} initial={initial} className="h-full w-full object-cover" />
        </div>
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="m-0 text-[28px] font-medium leading-[34px] tracking-[-.02em] text-[var(--ink7)]">{data.name || t('miniSite.your_business')}</h1>
            {/* A blue tick once aangan has checked the documents, and Member while the paid plan is live. */}
            {data.verified && (
              <span title={t('miniSite.verified_title')} data-testid="badge-verified" className="inline-flex items-center text-sky-500">
                <SealCheck size={24} weight="fill" aria-hidden="true" />
                <span className="sr-only">{t('kyc.verified')}</span>
              </span>
            )}
            {data.member && (
              <Status tone="info" data-testid="badge-member"><CrownSimple size={14} weight="fill" aria-hidden="true" /> {t('miniSite.member')}</Status>
            )}
          </div>
          <p className="ag-small">
            {typeLabel}
            {data.experienceYears ? ` · ${t('profile.experience_years', { count: data.experienceYears })}` : ''}
          </p>
          {data.hostName && data.hostName !== data.name && <p className="ag-small">{data.hostName}</p>}
          <div className="flex items-center gap-1" aria-label={data.reviewCount ? `${(data.rating || 0).toFixed(1)} / 5` : t('miniSite.new')}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} size={16} weight={i <= stars ? 'fill' : 'regular'} className={i <= stars ? 'text-[var(--star)]' : 'text-[var(--outline)]'} aria-hidden="true" />
            ))}
            {data.reviewCount ? <b className="ml-1 text-sm font-medium text-[var(--ink-strong)]">{(data.rating || 0).toFixed(1)}</b> : null}
            <span className="ag-small ml-1">{data.reviewCount ? `(${t('miniSite.reviews', { count: data.reviewCount })})` : t('miniSite.new')}</span>
          </div>
          {data.location && <p className="ag-small">{data.location}</p>}
          {joined && <p className="ag-small">{t('miniSite.joined', { date: joined })}</p>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {buttons.map(({ key, Icon, label, variant, href }) => (
          href ? (
            <ButtonA key={key} variant={variant} size="sm" center icon={<Icon />} href={href} target={key === 'call' ? undefined : '_blank'} rel="noreferrer"
              className="!gap-1.5 !px-2" data-testid={`mini-site-${key}`}>
              {label}
            </ButtonA>
          ) : (
            <span key={key} className={cx('ag-btn sm center !gap-1.5 !px-2', variant !== 'std' && variant)} aria-disabled={actions ? true : undefined}>
              <Icon />{label}
            </span>
          )
        ))}
      </div>
      {actions?.locked && <div className="ag-small" data-testid="mini-site-locked">{actions.locked}</div>}

      {/* What they offer: photo tiles with the rate */}
      {data.items.length > 0 && (
        <section>
          <SecHead title={t(`miniSite.items_${data.type}`, { defaultValue: t('miniSite.items') })} className="!mt-0" />
          <div className="grid grid-cols-2 gap-2.5">
            {data.items.map((it, i) => (
              <div key={i} className="ag-card">
                {(it.photo || data.gallery[i]) ? <SmartImg src={it.photo || data.gallery[i]} alt="" className="img" /> : <div className="img" />}
                <div className="body">
                  <span className="name truncate">{it.name}</span>
                  {it.price > 0 && (
                    <span className="ag-price">₹{it.price.toLocaleString('en-IN')} <span className="unit">{it.unit ? t(`profile.unit_${it.unit}`, { defaultValue: '' }) : ''}</span></span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* About */}
      {(data.about || data.hostName || data.languages?.length) && (
        <Box as="section">
          <h2>{t('miniSite.about')}</h2>
          {data.hostName && <b className="font-medium text-[var(--ink-strong)]">{data.hostName}</b>}
          {data.about && <p className="whitespace-pre-line text-[15px] leading-[22px] text-[var(--ink7)]">{data.about}</p>}
          {data.languages && data.languages.length > 0 && (
            <p className="ag-small">{t('detail.speaks')}: {data.languages.join(', ')}</p>
          )}
          {data.homeDelivery && <Status tone="ok" className="self-start">{t('miniSite.home_delivery')}</Status>}
        </Box>
      )}

      {/* Intro video */}
      {data.video && (
        <section>
          <SecHead title={t('miniSite.video')} className="!mt-0" />
          {isVideoFile(data.video) ? (
            <video src={data.video} controls playsInline preload="metadata" className="aspect-video w-full rounded-[var(--r-card)] bg-black" />
          ) : (
            <ButtonA href={data.video} target="_blank" rel="noreferrer" variant="text" icon={<PlayCircle />}>{t('profile.watch_intro')}</ButtonA>
          )}
        </section>
      )}

      {/* Photos strip */}
      {data.gallery.length > 0 && (
        <section>
          <SecHead title={t('miniSite.photos')} className="!mt-0" />
          <div className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {data.gallery.slice(0, 12).map((src, i) => (
              <SmartImg key={i} src={src} alt="" className="aspect-[4/3] w-44 flex-none snap-start rounded-[18px] border border-[var(--warmline)] bg-[var(--creme2)] object-cover" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
