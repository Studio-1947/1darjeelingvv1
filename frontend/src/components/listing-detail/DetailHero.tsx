import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SmartImg from '@/components/SmartImg';
import { listingImage } from '@/lib/listingContent';
import { Icon } from '@/components/ag/Icon';
import { Status } from '@/components/ag';
import AudioGuide from '@/components/AudioGuide';
import { useFavorites } from '@/context/FavoritesContext';
import { useLoginGate } from '@/components/LoginGate';
import type { ShareOutcome } from '@/lib/share';

/** The prototype's guide kinds (gtypeTag): its label key and icon. */
const GUIDE_TAG: Record<string, string> = {
  trekking: 'trek', heritage: 'flag', tea: 'leaf', nature: 'leaf', culture: 'flag', photography: 'sun', story: 'news', storyteller: 'news',
};

/**
 * Top of the listing page (prototype V.item): the 16:10 photo, the photo strip, then the name, the
 * guide kind, the place, the verified tag with the rating, and the host line.
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

  return (
    <>
      <span className="ag-listing-hero" data-testid="detail-hero">
        <SmartImg src={heroSrc} alt={item.title} className="w-full h-full" />
      </span>

      {photos.length > 0 && (
        <div className="ag-listing-strip" role="list" aria-label={stripLabel || t('listing.photos', 'Photos')} data-testid={stripTestid}>
          {photos.map((p, i) => (
            <StripTile key={p.src + i} src={p.src} tag={p.tag} testid={p.groupTestid}
              alt={t('detail.gallery_alt', { index: i + 1 }) + (item?.title ? ` · ${item.title}` : '')} />
          ))}
        </div>
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
    </>
  );
}

/** One photo of the strip; a photo that fails to load leaves the strip instead of showing a blank tile. */
function StripTile({ src, alt, tag, testid }: { src: string; alt: string; tag?: string; testid?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div role="listitem" data-testid={testid}>
      <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
      {tag && <span className="ag-listing-tag">{tag}</span>}
    </div>
  );
}

/**
 * The row under the price (prototype .itembtns): Listen, Direction, then save and share as round
 * outlined icon buttons.
 */
export function ItemActions({ item, about, onDirections, onShare }: {
  item: any;
  about: string;
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
        <AudioGuide title={item.title} aboutText={about} />
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
