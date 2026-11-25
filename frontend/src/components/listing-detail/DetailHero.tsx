import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SmartImg from '@/components/SmartImg';
import { listingImage } from '@/lib/listingContent';
import { Icon } from '@/components/ag/Icon';
import { Status } from '@/components/ag';
import { Link } from 'react-router-dom';
import { useFavorites } from '@/context/FavoritesContext';
import { useLoginGate } from '@/components/LoginGate';
import type { ShareOutcome } from '@/lib/share';
import PhotoViewer, { type ViewerPhoto } from '@/components/PhotoViewer';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';

/** The prototype's guide kinds (gtypeTag): its label key and icon. */
const GUIDE_TAG: Record<string, string> = {
  trekking: 'trek', heritage: 'flag', tea: 'leaf', nature: 'leaf', culture: 'flag', photography: 'sun', story: 'news', storyteller: 'news',
};

/**
 * Top of the listing page (prototype V.item): the 16:10 photo, the photo strip, then the name, the
 * guide kind, the place, the verified tag with the rating, and the host line. Tapping the big photo
 * or any photo in the strip opens it full screen.
 */
export default function DetailHero({ item, photos, stripLabel, stripTestid = 'detail-photos', host }: {
  item: any;
  photos: { src: string; tag?: string; groupTestid?: string }[];
  stripLabel?: string;
  stripTestid?: string;
  /** "Host: Name ↗", already built by the page. */
  host?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const heroSrc = listingImage(item, 1440, 900);
  const rated = Number(item.review_count) > 0;
  const guideKinds: string[] = item.type === 'guide' && Array.isArray(item.extras?.guide_types) ? item.extras.guide_types : [];
  // The full-screen viewer browses the big photo and the strip together, from the one tapped.
  const gallery: ViewerPhoto[] = [
    { src: heroSrc, alt: item.title },
    ...photos.filter((p) => p.src !== heroSrc).map((p, i) => ({ src: p.src, alt: t('detail.gallery_alt', { index: i + 1 }) + (item?.title ? ` · ${item.title}` : '') })),
  ];
  const [zoomAt, setZoomAt] = useState<number | null>(null);
  const openPhoto = (src: string) => setZoomAt(Math.max(0, gallery.findIndex((g) => g.src === src)));

  return (
    <>
      <span className="ag-listing-hero" data-testid="detail-hero">
        <SmartImg src={heroSrc} alt={item.title} className="w-full h-full" />
        <button type="button" className="absolute inset-0 cursor-zoom-in" onClick={() => setZoomAt(0)}
          aria-label={t('miniSite.view_photo', 'View photo')} data-testid="detail-hero-zoom" />
      </span>

      {photos.length > 0 && (
        <PhotoStrip label={stripLabel || t('listing.photos', 'Photos')} testid={stripTestid}>
          {photos.map((p, i) => (
            <StripTile key={p.src + i} src={p.src} tag={p.tag} testid={p.groupTestid}
              alt={t('detail.gallery_alt', { index: i + 1 }) + (item?.title ? ` · ${item.title}` : '')}
              onOpen={openPhoto} />
          ))}
        </PhotoStrip>
      )}

      <div className="ag-listing-stack">
        <h1 data-testid="listing-title">{item.title}</h1>
        {guideKinds.length > 0 && (
          <span className="ag-listing-gtag">
            <Icon name={(GUIDE_TAG[guideKinds[0]] as any) || 'trek'} />
            {t(`profile.guide_type_${guideKinds[0]}`, { defaultValue: guideKinds[0] })}
          </span>
        )}
        {item.location && <p className="ag-listing-place"><Icon name="pin" /> {item.location}</p>}
        {(item.provider_verified || rated) && (
          <p className="ag-listing-row">
            {item.provider_verified && <span className="ag-listing-tag ok">{t('listing.verified', 'Verified')}</span>}
            {rated && (
              <>
                <a href="#reviews" className="ag-listing-starline" aria-label={t('reviews.out_of_5', { value: Number(item.rating).toFixed(1) })}>
                  <Icon name="star" />{Number(item.rating).toFixed(1)}
                </a>
                <span className="ag-small">({item.review_count})</span>
              </>
            )}
          </p>
        )}
        {host}
      </div>

      {zoomAt != null && <PhotoViewer photos={gallery} index={zoomAt} caption={item.title} onClose={() => setZoomAt(null)} testid="detail-photo-viewer" />}
    </>
  );
}

/**
 * The photo strip with ‹ › arrows over its ends, each shown only while there is more to scroll that
 * way (a finger still swipes it; the arrows are for a mouse and for seeing that there is more).
 */
function PhotoStrip({ label, testid, children }: { label: string; testid: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [ends, setEnds] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEnds({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    const el = ref.current;
    el?.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    // Photos load after the first measure and widen the strip.
    const late = window.setTimeout(measure, 600);
    return () => { el?.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); window.clearTimeout(late); };
  }, [measure, children]);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * Math.max(160, (ref.current.clientWidth || 300) * 0.8), behavior: 'smooth' });
  return (
    <div className="ag-listing-stripwrap">
      <div ref={ref} className="ag-listing-strip" role="list" aria-label={label} data-testid={testid}>{children}</div>
      {ends.left && (
        <button type="button" className="ag-listing-striparrow left" onClick={() => scroll(-1)} data-testid={`${testid}-prev`}
          aria-label={t('common.previous', 'Previous')} title={t('common.previous', 'Previous')}>
          <CaretLeft weight="bold" aria-hidden="true" />
        </button>
      )}
      {ends.right && (
        <button type="button" className="ag-listing-striparrow right" onClick={() => scroll(1)} data-testid={`${testid}-next`}
          aria-label={t('common.next', 'Next')} title={t('common.next', 'Next')}>
          <CaretRight weight="bold" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/**
 * One photo of the strip, a button that opens it full screen. A photo that fails to load leaves the
 * strip instead of showing a blank tile.
 */
function StripTile({ src, alt, tag, testid, onOpen }: { src: string; alt: string; tag?: string; testid?: string; onOpen: (src: string) => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div role="listitem" data-testid={testid}>
      <button type="button" className="block h-full w-full cursor-zoom-in p-0" onClick={() => onOpen(src)} aria-label={alt}>
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      </button>
      {tag && <span className="ag-listing-tag pointer-events-none">{tag}</span>}
    </div>
  );
}

/**
 * The one row of pills under the price: Website (the host's own page, when there is one), Direction,
 * then save and share as round outlined icon buttons. Kept on a single line.
 */
export function ItemActions({ item, website, onDirections, onShare }: {
  item: any;
  website?: string | null;
  onDirections: () => void;
  onShare: () => Promise<ShareOutcome>;
}) {
  const { t } = useTranslation();
  const { isFavorite, toggle } = useFavorites();
  const { requireAuth } = useLoginGate();
  const liked = isFavorite(item.id);
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');

  // Saving and sharing need an account; the gate explains that before sending anyone to sign in.
  const handleLike = () => {
    if (!requireAuth('save')) return;
    toggle(item.id).catch(() => {});
  };
  const handleShare = async () => {
    if (!requireAuth('share')) return;
    const outcome = await onShare();
    // A native share sheet gives its own feedback; only the clipboard fallback and failure need one.
    if (outcome === 'copied' || outcome === 'failed') {
      setShareState(outcome);
      setTimeout(() => setShareState('idle'), outcome === 'copied' ? 1600 : 2400);
    }
  };

  return (
    <>
      <div className="ag-listing-acts" data-testid="detail-actions">
        {website && (
          <Link to={website} className="ag-btn tonal ag-listing-web" data-testid="listing-website">
            <Icon name="globe" /> {t('listing.pf_site', 'Website')}
          </Link>
        )}
        <button type="button" className={`ag-listing-rowic${liked ? ' on' : ''}`} aria-pressed={liked}
          aria-label={liked ? t('listing.saved', 'Saved') : t('listing.save', 'Save')} title={liked ? t('listing.saved', 'Saved') : t('listing.save', 'Save')}
          onClick={handleLike} data-testid="detail-like">
          <Icon name="heart" />
        </button>
        <button type="button" className="ag-btn tonal ag-listing-dir" onClick={onDirections} data-testid="detail-directions">
          <Icon name="pin" /> {t('listing.direction', 'Direction')}
        </button>
        <button type="button" className="ag-listing-rowic" aria-label={t('listing.share', 'Share')} title={t('listing.share', 'Share')}
          onClick={handleShare} data-testid="detail-share">
          <Icon name="share" />
        </button>
      </div>
      {shareState !== 'idle' && (
        <Status role="status" data-testid="detail-share-feedback" tone={shareState === 'copied' ? 'ok' : 'no'} className="self-start">
          {shareState === 'copied' ? <><Icon name="check" size={14} /> {t('detail.share_copied')}</> : t('detail.share_failed')}
        </Status>
      )}
    </>
  );
}
