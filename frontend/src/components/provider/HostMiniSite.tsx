import React from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, WhatsappLogo, NavigationArrow, SealCheck, Star, PlayCircle, Globe, CrownSimple } from '@phosphor-icons/react';

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

export default function HostMiniSite({ data, compact = false, actions }: { data: MiniSiteData; compact?: boolean; actions?: MiniSiteActions }) {
  const { t } = useTranslation();
  const initial = (data.hostName || data.name || '?').trim().charAt(0).toUpperCase();
  const joined = data.joinedAt ? new Date(data.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const stars = Math.round(data.rating || 0);
  const pad = compact ? 'px-4' : 'px-5 md:px-8';

  return (
    <div className="bg-white overflow-hidden" data-testid="host-mini-site">
      {/* Address bar */}
      <div className={`flex items-center gap-2 ${pad} py-2 bg-mist text-[11px] text-ink-soft border-b border-[var(--line)]`}>
        <Globe size={13} />
        <span className="truncate" data-testid="mini-site-address">aanganerp.in/{data.type}/{data.slug || miniSiteSlug(data.name)}</span>
      </div>

      {/* Cover */}
      <div className={`relative ${compact ? 'h-32' : 'h-48 md:h-64'} bg-gradient-to-br from-pine to-pine-dark`}>
        {data.cover && <img src={data.cover} alt="" className="absolute inset-0 w-full h-full object-cover" />}
        {!data.available && (
          <span className="absolute top-3 right-3 rounded-full bg-white/95 px-3 py-1 text-[11px] font-bold text-ink">{t('miniSite.not_taking')}</span>
        )}
      </div>

      {/* Identity */}
      <div className={`${pad} -mt-10 relative`}>
        <div className={`${compact ? 'w-20 h-20' : 'w-24 h-24'} rounded-2xl overflow-hidden ring-4 ring-white shadow-md bg-pine text-white grid place-items-center font-display font-extrabold text-3xl`}>
          {data.avatar ? <img src={data.avatar} alt="" className="w-full h-full object-cover" /> : initial}
        </div>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <h3 className={`font-display font-extrabold text-ink ${compact ? 'text-xl' : 'text-2xl md:text-3xl'}`}>{data.name || t('miniSite.your_business')}</h3>
          {/* Two marks: a blue tick once aangan has checked the documents, and Member while the
              paid plan is live. */}
          {data.verified && (
            <span title={t('miniSite.verified_title')} data-testid="badge-verified" className="inline-flex items-center text-[#1D9BF0]">
              <SealCheck size={compact ? 20 : 24} weight="fill" />
              <span className="sr-only">{t('kyc.verified')}</span>
            </span>
          )}
          {data.member && (
            <span data-testid="badge-member" className="inline-flex items-center gap-1 rounded-full bg-gold/20 text-[#7a5d00] font-bold px-2 py-0.5 text-[11px]">
              <CrownSimple size={12} weight="fill" /> {t('miniSite.member')}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-ink-soft">
          {t(`categories.${data.type}`, { defaultValue: data.type })}
          {data.experienceYears ? ` · ${t('profile.experience_years', { count: data.experienceYears })}` : ''}
          {data.location ? ` · ${data.location}` : ''}
        </p>
        {joined && <p className="text-xs text-ink-soft">{t('miniSite.joined', { date: joined })}</p>}
        <div className="mt-1.5 flex items-center gap-0.5" aria-label={t('miniSite.rating', { count: data.reviewCount || 0 })}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} size={15} weight={i <= stars ? 'fill' : 'regular'} className={i <= stars ? 'text-gold' : 'text-ink-soft/40'} />
          ))}
          <span className="ml-1.5 text-xs text-ink-soft">
            {data.reviewCount ? t('miniSite.reviews', { count: data.reviewCount }) : t('miniSite.new')}
          </span>
        </div>

        {/* Call / WhatsApp / Direction */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { key: 'call', Icon: Phone, label: t('miniSite.call'), cls: 'bg-[#1F6656] text-white', href: actions?.call },
            { key: 'whatsapp', Icon: WhatsappLogo, label: t('miniSite.whatsapp'), cls: 'bg-[#25D366] text-white', href: actions?.whatsapp },
            { key: 'direction', Icon: NavigationArrow, label: t('miniSite.direction'), cls: 'bg-white border border-[var(--line)] text-ink', href: actions?.direction },
          ].map(({ key, Icon, label, cls, href }) => {
            const inner = <><Icon size={15} /> {label}</>;
            const base = `inline-flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold ${cls}`;
            return href ? (
              <a key={key} href={href} target={key === 'call' ? undefined : '_blank'} rel="noreferrer" data-testid={`mini-site-${key}`} className={`${base} btn-hover`}>{inner}</a>
            ) : (
              <span key={key} className={`${base} ${actions ? 'opacity-50' : ''}`}>{inner}</span>
            );
          })}
        </div>
        {actions?.locked && <div className="mt-2 text-xs text-ink-soft" data-testid="mini-site-locked">{actions.locked}</div>}
      </div>

      {/* About */}
      {(data.about || data.hostName || data.languages?.length) && (
        <section className={`${pad} mt-6`}>
          <h4 className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">{t('miniSite.about')}</h4>
          {data.hostName && <p className="mt-1 font-bold text-ink">{data.hostName}</p>}
          {data.about && <p className="mt-1 text-sm text-ink leading-relaxed whitespace-pre-line">{data.about}</p>}
          {data.languages && data.languages.length > 0 && (
            <p className="mt-2 text-xs text-ink-soft">{t('detail.speaks')}: {data.languages.join(', ')}</p>
          )}
          {data.homeDelivery && <p className="mt-1 text-xs font-semibold text-pine">{t('miniSite.home_delivery')}</p>}
        </section>
      )}

      {/* Intro video */}
      {data.video && (
        <section className={`${pad} mt-6`}>
          <h4 className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">{t('miniSite.video')}</h4>
          {isVideoFile(data.video) ? (
            <video src={data.video} controls playsInline preload="metadata" className="mt-2 w-full rounded-2xl bg-ink aspect-video" />
          ) : (
            <a href={data.video} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-pine">
              {t('profile.watch_intro')} <PlayCircle size={16} />
            </a>
          )}
        </section>
      )}

      {/* Services: photos + rates */}
      {data.items.length > 0 && (
        <section className={`${pad} mt-6`}>
          <h4 className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">{t(`miniSite.items_${data.type}`, { defaultValue: t('miniSite.items') })}</h4>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {data.items.map((it, i) => (
              <div key={i} className="rounded-2xl border border-[var(--line)] overflow-hidden bg-white">
                <div className="aspect-[4/3] bg-mist">
                  {(it.photo || data.gallery[i]) && <img src={it.photo || data.gallery[i]} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="p-2.5">
                  <p className="text-sm font-bold text-ink truncate">{it.name}</p>
                  {it.price > 0 && (
                    <p className="text-xs text-ink-soft">
                      <span className="font-bold text-ink">₹{it.price.toLocaleString('en-IN')}</span>{' '}
                      {it.unit ? t(`profile.unit_${it.unit}`, { defaultValue: '' }) : ''}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Gallery */}
      {data.gallery.length > 0 && (
        <section className={`${pad} mt-6 pb-6`}>
          <h4 className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">{t('miniSite.photos')}</h4>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {data.gallery.slice(0, compact ? 6 : 12).map((src, i) => (
              <img key={i} src={src} alt="" className="aspect-square w-full rounded-lg object-cover bg-mist" />
            ))}
          </div>
        </section>
      )}
      {!data.gallery.length && <div className="pb-6" />}
    </div>
  );
}
