import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, ShareNetwork, SealCheck, Star, Globe, CrownSimple, Info } from '@phosphor-icons/react';
import { Box, SecHead, Status, cx } from '@/components/ag';
import { toast } from 'sonner';
import { themeVars, useMode } from '@/lib/theme';
import SmartImg from '@/components/SmartImg';
import FaceImg from '@/components/FaceImg';
import PhotoViewer, { type ViewerPhoto } from '@/components/PhotoViewer';

/**
 * A host's mini website, laid out like the board's mock-up (Aangan Blue Print, "Profile: all
 * profiles should look like individual websites"): the address, a cover photo, the host's photo,
 * name, type, badge, experience and joining date, a rating, the page's actions (filled by the public
 * page), what they offer with photos and rates, the story and photos (tap to enlarge).
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

/**
 * Slots the public page fills (the editor preview leaves them empty):
 * - copyUrl: the page's live address; the address pill gets a Copy button.
 * - underAddress: under the address, e.g. the owner's "Your view / Guest view" switch.
 * - actions: the action row, right under the name (Ask to book, Save, Share; Edit page for the owner).
 */
export default function HostMiniSite({ data, copyUrl, underAddress, actions }: {
  data: MiniSiteData; copyUrl?: string; underAddress?: React.ReactNode; actions?: React.ReactNode;
}) {
  // Re-render when dark mode is switched, so the business colour follows it.
  const [colourMode] = useMode();
  const { t } = useTranslation();
  // The (i) beside the badges: what the blue tick and the Business Pass each mean for this host.
  const [badgeInfo, setBadgeInfo] = React.useState(false);
  const infoId = React.useId();
  // The photo open full screen: the host's face, the cover, or one from the gallery.
  // The viewer gets a set: the face alone, or the cover and the photos together to browse.
  const [zoom, setZoom] = React.useState<{ photos: ViewerPhoto[]; index: number } | null>(null);
  const pictures: ViewerPhoto[] = [data.cover, ...data.gallery.slice(0, 12)]
    .filter((u, i, all): u is string => !!u && all.indexOf(u) === i)
    .map((u) => ({ src: u, alt: data.name }));
  const openPicture = (src: string) => setZoom({ photos: pictures, index: Math.max(0, pictures.findIndex((x) => x.src === src)) });
  const [copied, setCopied] = React.useState(false);
  const address = `aanganerp.in/${data.type}/${data.slug || miniSiteSlug(data.name)}`;
  const copy = () => {
    if (!copyUrl) return;
    navigator.clipboard?.writeText(copyUrl)
      .then(() => { setCopied(true); toast.success(t('ui.hostPage.link_copied')); window.setTimeout(() => setCopied(false), 1600); })
      .catch(() => {});
  };
  // The phone's share sheet where there is one (WhatsApp and the rest); otherwise the link is copied.
  const share = async () => {
    if (!copyUrl) return;
    const text = t('ui.hostPage.share_text', { name: data.name, url: copyUrl });
    try {
      if (navigator.share) await navigator.share({ title: data.name, text, url: copyUrl });
      else copy();
    } catch { /* the sheet was closed */ }
  };
  // relative + z-index: the cover is positioned, so a static photo would be painted under it.
  const avatarCls = 'relative z-[1] -mt-12 grid h-24 w-24 flex-none place-items-center overflow-hidden rounded-full border-4 border-[var(--surface)] bg-[var(--r-tint)] text-4xl font-medium text-[var(--r)] shadow-sm';
  const initial = (data.hostName || data.name || '?').trim().charAt(0).toUpperCase();
  const joined = data.joinedAt ? new Date(data.joinedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const stars = Math.round(data.rating || 0);
  const typeLabel = t(`categories.${data.type}`, { defaultValue: data.type });

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4" style={themeVars(data.theme, colourMode)} data-testid="host-mini-site">
      {/* The page's address, highlighted, with Copy on the live page. */}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2 self-start max-w-full rounded-full border border-[rgb(var(--r-rgb)/.35)] bg-[var(--r-tint)] py-1 pl-3 pr-1 text-[var(--ink-strong)]">
          <Globe size={16} className="flex-none text-[var(--r)]" aria-hidden="true" />
          <span className="min-w-0 truncate text-sm font-medium underline decoration-[var(--r)] decoration-1 underline-offset-4" data-testid="mini-site-address">{address}</span>
          {copyUrl ? (
            <span className="flex flex-none gap-1">
              <button type="button" onClick={copy} data-testid="host-page-copy"
                aria-label={t('listing.copylink', 'Copy link')} title={t('listing.copylink', 'Copy link')}
                className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface)] text-[var(--r)] hover:bg-[var(--r)] hover:text-[var(--on-r)]">
                {copied ? <Check size={16} weight="bold" aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              </button>
              <button type="button" onClick={share} data-testid="host-page-share"
                aria-label={t('ui.hostPage.share')} title={t('ui.hostPage.share')}
                className="grid h-8 w-8 place-items-center rounded-full bg-[var(--surface)] text-[var(--r)] hover:bg-[var(--r)] hover:text-[var(--on-r)]">
                <ShareNetwork size={16} aria-hidden="true" />
              </button>
            </span>
          ) : <span className="w-2" />}
        </div>
        {underAddress}
      </div>

      {/* Cover */}
      <div className="relative aspect-[16/9] overflow-hidden rounded-[var(--r-card)] border border-[var(--warmline)] bg-[var(--creme2)]">
        {data.cover && (
          <button type="button" onClick={() => openPicture(data.cover!)} data-testid="mini-site-cover"
            aria-label={t('miniSite.view_photo')} title={t('miniSite.view_photo')} className="absolute inset-0 cursor-zoom-in p-0">
            <SmartImg src={data.cover} alt="" className="h-full w-full object-cover" />
          </button>
        )}
        {!data.available && <Status className="absolute right-3 top-3">{t('miniSite.not_taking')}</Status>}
      </div>

      {/* Identity: photo, name with the two marks, type and joining date, stars, place */}
      <div className="flex items-start gap-4">
        {data.avatar ? (
          // Tap the photo to see it full screen.
          <button type="button" onClick={() => setZoom({ photos: [{ src: data.avatar!, alt: data.hostName || data.name }], index: 0 })} aria-label={t('miniSite.view_photo')} title={t('miniSite.view_photo')}
            data-testid="host-avatar" className={cx(avatarCls, 'cursor-zoom-in p-0 transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--r)]')}>
            <FaceImg src={data.avatar} initial={initial} className="h-full w-full object-cover" />
          </button>
        ) : (
          <div className={avatarCls}>{initial}</div>
        )}
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="m-0 text-[28px] font-medium leading-[34px] tracking-[-.02em] text-[var(--ink7)]">{data.name || t('miniSite.your_business')}</h1>
            {/* A blue tick once aangan has checked the documents, and Member while the paid plan is live. */}
            {data.verified && (
              <span title={t('miniSite.verified_title')} data-testid="badge-verified" className="inline-flex items-center text-sky-500">
                <SealCheck size={24} weight="fill" aria-hidden="true" />
                <span className="sr-only">{t('miniSite.docs_verified')}</span>
              </span>
            )}
            {data.member && (
              <Status tone="info" data-testid="badge-member"><CrownSimple size={14} weight="fill" aria-hidden="true" /> {t('miniSite.member')}</Status>
            )}
            {(data.verified || data.member) && (
              <button type="button" onClick={() => setBadgeInfo((v) => !v)} aria-expanded={badgeInfo} aria-controls={infoId}
                aria-label={t('miniSite.badges_info')} title={t('miniSite.badges_info')} data-testid="badge-info"
                className="grid h-8 w-8 place-items-center rounded-full border border-[var(--hairline)] bg-[var(--surface)] text-[var(--ink-muted)] hover:text-[var(--ink-strong)]">
                <Info size={18} weight={badgeInfo ? 'fill' : 'regular'} aria-hidden="true" />
              </button>
            )}
          </div>
          {badgeInfo && (data.verified || data.member) && (
            <Box flat id={infoId} className="!gap-2 text-sm" data-testid="badge-info-panel">
              {data.verified && (
                <p className="flex items-start gap-2">
                  <SealCheck size={18} weight="fill" className="mt-0.5 flex-none text-sky-500" aria-hidden="true" />
                  <span><b className="font-medium text-[var(--ink-strong)]">{t('miniSite.docs_verified')}</b><br /><span className="ag-small">{t('miniSite.docs_verified_body')}</span></span>
                </p>
              )}
              <p className="flex items-start gap-2">
                <CrownSimple size={18} weight={data.member ? 'fill' : 'regular'} className={cx('mt-0.5 flex-none', data.member ? 'text-[var(--r)]' : 'text-[var(--ink-muted)]')} aria-hidden="true" />
                <span>
                  <b className="font-medium text-[var(--ink-strong)]">{t(data.member ? 'miniSite.pass_active' : 'miniSite.pass_none')}</b><br />
                  <span className="ag-small">{t(data.member ? 'miniSite.pass_active_body' : 'miniSite.pass_none_body')}</span>
                </span>
              </p>
            </Box>
          )}
          <p className="ag-small">
            {typeLabel}
            {data.experienceYears ? ` · ${t('profile.experience_years', { count: data.experienceYears })}` : ''}
          </p>
          {data.hostName && data.hostName !== data.name && <p className="ag-small">{data.hostName}</p>}
        </div>
      </div>

      {/* Rating, place and joining date: under the photo, from the left edge. */}
      <div className="-mt-2 grid gap-1" data-testid="mini-site-facts">
        <div className="flex items-center gap-1" aria-label={data.reviewCount ? `${(data.rating || 0).toFixed(1)} / 5` : t('miniSite.new')}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} size={16} weight={i <= stars ? 'fill' : 'regular'} className={i <= stars ? 'text-[var(--star)]' : 'text-[var(--ink-faint)]'} aria-hidden="true" />
          ))}
          {data.reviewCount ? <b className="ml-1 text-sm font-medium text-[var(--ink-strong)]">{(data.rating || 0).toFixed(1)}</b> : null}
          <span className="ag-small ml-1">{data.reviewCount ? `(${t('miniSite.reviews', { count: data.reviewCount })})` : t('miniSite.new')}</span>
        </div>
        {data.location && <p className="ag-small">{data.location}</p>}
        {joined && <p className="ag-small">{t('miniSite.joined', { date: joined })}</p>}
      </div>

      {actions}

      {zoom && <PhotoViewer photos={zoom.photos} index={zoom.index} caption={data.hostName || data.name} onClose={() => setZoom(null)} testid="host-avatar-viewer" />}

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
            <div className="flex flex-wrap items-center gap-1.5" data-testid="mini-site-languages">
              <span className="ag-small mr-1">{t('detail.speaks')}</span>
              {data.languages.map((l) => (
                <span key={l} className="rounded-full border border-[var(--hairline)] bg-[var(--surface)] px-3 py-1 text-[13px] leading-[18px] text-[var(--ink-strong)]">{l}</span>
              ))}
            </div>
          )}
          {data.homeDelivery && <Status tone="ok" className="self-start">{t('miniSite.home_delivery')}</Status>}
        </Box>
      )}

      {/* Photos strip */}
      {data.gallery.length > 0 && (
        <section>
          <SecHead title={t('miniSite.photos')} className="!mt-0" />
          <div className="-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {data.gallery.slice(0, 12).map((src, i) => (
              <button key={i} type="button" onClick={() => openPicture(src)} data-testid={`mini-site-photo-${i}`}
                aria-label={t('miniSite.view_photo')} className="flex-none snap-start cursor-zoom-in p-0">
                <SmartImg src={src} alt="" className="aspect-[4/3] w-44 rounded-[18px] border border-[var(--warmline)] bg-[var(--creme2)] object-cover" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
