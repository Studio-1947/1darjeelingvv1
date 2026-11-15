import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SmartImg from '@/components/SmartImg';
import { listingImage } from '@/lib/listingContent';
import VerifiedBadge from '@/components/provider/VerifiedBadge';
import { MapPin, ShareNetwork as Share2, Heart, Check, Star } from '@phosphor-icons/react';
import { IconButton, Status } from '@/components/ag';
import { useFavorites } from '@/context/FavoritesContext';
import { useLoginGate } from '@/components/LoginGate';
import type { ShareOutcome } from '@/lib/share';

/** The area each listing type belongs to: the eyebrow over its title (prototype DESIGN.md). */
const EYEBROW: Record<string, [string, string]> = {
  homestay: ['detail.eye_homestay', 'Stay local'],
  driver: ['detail.eye_driver', 'Ride local'],
  spot: ['detail.eye_spot', 'Must visit'],
  cafe: ['detail.eye_cafe', 'Eat local'],
  shop: ['detail.eye_shop', 'Eat local'],
  guide: ['detail.eye_guide', 'Go with a local'],
  event: ['detail.eye_event', 'Celebrate'],
  biodiversity: ['detail.eye_biodiversity', 'Wild side'],
};

/**
 * Top of the listing page (prototype item view): the 16:10 photo with save and share on it (Back is
 * the header's),
 * then the eyebrow, the name, the place and the verified / rating line.
 */
export default function DetailHero({ item, onShare, children }: {
  item: any;
  onShare: () => Promise<ShareOutcome>;
  /** Under the title block: the host line and the price. */
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { isFavorite, toggle } = useFavorites();
  const { requireAuth } = useLoginGate();
  const liked = isFavorite(item.id);
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');

  // Saving requires an account (favorites are per-user). The gate explains that before sending
  // anyone to sign in, matching how the feed cards behave.
  const handleLike = () => {
    if (!requireAuth('save')) return;
    toggle(item.id).catch(() => {});
  };

  const handleShare = async () => {
    if (!requireAuth('share')) return;
    const outcome = await onShare();
    // A successful native share sheet gives its own feedback, so only surface a pill for the
    // clipboard-copy fallback (and for outright failure).
    if (outcome === 'copied' || outcome === 'failed') {
      setShareState(outcome);
      setTimeout(() => setShareState('idle'), outcome === 'copied' ? 1600 : 2400);
    }
  };

  // A distinct per-listing hero (provider image kept; shared seed images replaced).
  const heroSrc = listingImage(item, 1440, 900);
  const [eyeKey, eyeEn] = EYEBROW[item.type] || EYEBROW.spot;
  const rated = Number(item.review_count) > 0;

  return (
    <>
      <div className="relative w-full aspect-[16/10] rounded-[20px] overflow-hidden bg-[var(--creme2)]" data-testid="detail-hero">
        <SmartImg src={heroSrc} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <IconButton label={liked ? t('detail.saved', 'Saved') : t('common.save')} on={liked} aria-pressed={liked} onClick={handleLike} data-testid="detail-like">
              <Heart weight={liked ? 'fill' : 'regular'} />
            </IconButton>
            <IconButton label={t('feed.share')} onClick={handleShare} data-testid="detail-share"><Share2 /></IconButton>
          </div>
          {shareState !== 'idle' && (
            <Status role="status" data-testid="detail-share-feedback" tone={shareState === 'copied' ? 'ok' : 'no'}>
              {shareState === 'copied' ? <><Check weight="bold" aria-hidden="true" /> {t('detail.share_copied')}</> : t('detail.share_failed')}
            </Status>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="ag-pagehead">
          <span className="ag-eyebrow">{t(eyeKey, eyeEn)}</span>
          <h1 data-testid="listing-title">{item.title}</h1>
        </div>
        {item.location && (
          <p className="m-0 inline-flex items-center gap-1.5 text-[16px] leading-6 text-[var(--ink-muted)]">
            <MapPin className="w-5 h-5 flex-none" aria-hidden="true" /> {item.location}
          </p>
        )}
        {(item.provider_verified || rated) && (
          <div className="ag-row">
            {item.provider_verified && <VerifiedBadge size="sm" />}
            {rated && (
              <a href="#reviews" className="inline-flex items-center gap-1 text-[var(--r)] no-underline"
                aria-label={t('reviews.out_of_5', { value: Number(item.rating).toFixed(1) })}>
                <Star weight="fill" className="w-[18px] h-[18px]" aria-hidden="true" />
                <span className="font-medium">{Number(item.rating).toFixed(1)}</span>
                <span className="ag-small">({item.review_count})</span>
              </a>
            )}
          </div>
        )}
        {children}
      </div>
    </>
  );
}
