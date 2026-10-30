import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, ShareNetwork as Share2, Heart, Star, ArrowRight, Phone, Storefront as Store, Coffee, Ticket, Leaf, Mountains as Mountain, Check, X } from '@phosphor-icons/react';
import SmartImg from '@/components/SmartImg';
import { listingImage } from '@/lib/listingContent';
import { useFavorites } from '@/context/FavoritesContext';
import { useLoginGate } from '@/components/LoginGate';
import { shareLink } from '@/lib/share';

// The icon gives each listing type a distinct visual cue while every card keeps
// the same clear destination label: View details.
const CTA_MAP = {
  homestay: ArrowRight,
  driver: Phone,
  shop: Store,
  cafe: Coffee,
  event: Ticket,
  biodiversity: Leaf,
  spot: Mountain,
};

/**
 * Instagram-post-style feed card with contextual CTA button.
 *
 * `tripSuffix` carries the dates and guest count from a search through to the
 * listing page, so the booking form opens filled in - see lib/tripParams.
 */
export default function FeedCard({ item, priority = false, tripSuffix = '' }) {
  const { t } = useTranslation();
  const { isFavorite, toggle } = useFavorites();
  const { requireAuth } = useLoginGate();
  const saved = isFavorite(item.id);
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');

  // Saving, sharing and rating all need an account, so each one asks the gate first - it explains
  // why and offers sign-in rather than yanking the visitor off the feed mid-scroll.
  const handleSave = () => {
    if (!requireAuth('save')) return;
    toggle(item.id).catch(() => {});
  };

  // Native share sheet where available, clipboard otherwise; shareLink() also covers the
  // non-HTTPS case where neither API exists, which is why this looked dead on phones.
  const handleShare = async () => {
    if (!requireAuth('share')) return;
    const outcome = await shareLink({
      title: item.title,
      text: item.description,
      url: `${window.location.origin}/listing/${item.id}`,
    });
    // The native sheet gives its own feedback; only the fallbacks need a pill.
    if (outcome === 'copied' || outcome === 'failed') {
      setShareState(outcome);
      setTimeout(() => setShareState('idle'), outcome === 'copied' ? 1600 : 2400);
    }
  };

  // A homestay is priced per person, not per night - see the note on common.per_head.
  const unit = item.type === 'homestay' ? t('common.per_head') : item.type === 'driver' ? t('common.per_day') : '';
  const cat = t(`categories.${item.type}`);
  const cta = CTA_MAP[item.type] || CTA_MAP.spot;
  const CtaIcon = cta;
  const img = listingImage(item, 900, 900);
  const href = `/listing/${item.id}${tripSuffix}`;

  return (
    <article className="bg-white rounded-3xl border border-[var(--line)] overflow-hidden max-w-xl mx-auto md:mx-0 w-full h-full flex flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-1" data-testid={`feed-card-${item.id}`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-3.5 flex-shrink-0">
        <div className="w-10 h-10 rounded-full p-[2px] bg-gradient-to-tr from-pine via-gold to-flag flex-shrink-0">
          <div className="w-full h-full rounded-full bg-white p-[2px]">
            <div className="w-full h-full rounded-full overflow-hidden bg-mist">
              <SmartImg src={img} alt="" className="w-full h-full object-cover" loading={priority ? 'eager' : 'lazy'} />
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-ink truncate">{item.location}</div>
          <div className="text-[11px] text-ink-soft font-semibold uppercase tracking-wider">{cat}</div>
        </div>
      </div>

      {/* Image */}
      <Link to={href} className="block relative bg-mist flex-shrink-0 group overflow-hidden" data-testid={`feed-card-image-${item.id}`}>
        <div className="aspect-square w-full overflow-hidden">
          <SmartImg src={img} alt={item.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading={priority ? 'eager' : 'lazy'} />
        </div>
        {item.price > 0 && (
          <div className="absolute bottom-3 left-3 px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md text-white border border-white/20 text-sm font-extrabold shadow-lg">
            ₹{item.price}<span className="text-xs text-white/80 font-semibold">{unit}</span>
          </div>
        )}
      </Link>

      {/* Review summary */}
      <div className="flex items-center gap-4 px-3.5 pt-3 flex-shrink-0">
        <div
          data-testid={`feed-rating-${item.id}`}
          className="flex items-center gap-1 text-sm"
          aria-label={item.review_count > 0
            ? t('feed.rated_aria', { rating: item.rating, count: item.review_count })
            : t('feed.no_reviews_aria')}
        >
          <Star size={18} weight={item.review_count > 0 ? 'fill' : 'regular'} className={item.review_count > 0 ? 'text-gold' : 'text-ink-soft'} />
          {item.review_count > 0 ? (
            <span className="font-bold text-ink">{Number(item.rating).toFixed(1)}
              <span className="font-normal text-ink-soft"> ({item.review_count})</span>
            </span>
          ) : (
            <span className="text-ink-soft text-xs font-semibold">{t('feed.no_reviews')}</span>
          )}
        </div>
      </div>
      {shareState !== 'idle' && (
        <p role="status" data-testid={`feed-share-msg-${item.id}`}
          className={`px-3.5 pt-1.5 text-xs font-bold ${shareState === 'copied' ? 'text-pine' : 'text-flag'}`}>
          {shareState === 'copied' ? t('detail.share_copied') : t('detail.share_failed')}
        </p>
      )}

      {/* Caption */}
      <div className="px-3.5 py-3 flex-1 flex flex-col">
        <Link to={href} className="font-display font-extrabold text-lg text-ink leading-tight hover:underline line-clamp-1">
          {item.title}
        </Link>
        <p className="mt-1 text-xs text-ink-soft flex items-center gap-1 truncate"><MapPin size={11} className="flex-shrink-0" /> {item.location}</p>
        <p className="mt-2 text-sm text-ink leading-relaxed line-clamp-2 min-h-[2.75rem]">{item.description}</p>
        <div className="mt-2 text-xs text-pine font-semibold truncate min-h-[1rem]">
          {item.tags?.slice(0, 3).map((tg) => `#${tg.replace(/-/g, '')}`).join('  ')}
        </div>

        {/* Card actions */}
        <div className="mt-auto pt-3.5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
            <Link
              to={href}
              data-testid={`feed-cta-${item.id}`}
              className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full bg-pine px-3 py-2.5 text-sm font-bold text-white btn-hover"
            >
              <CtaIcon size={16} /> <span className="truncate">{t('common.view_details')}</span>
            </Link>
            <button
              type="button"
              onClick={handleSave}
              data-testid={`feed-save-${item.id}`}
              aria-label={t('common.like')}
              aria-pressed={saved}
              className={`inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-2.5 text-sm font-bold btn-hover ${saved ? 'border-pine bg-pine/10 text-pine' : 'border-[var(--line)] text-ink hover:bg-mist'}`}
            >
              <Heart size={17} weight={saved ? 'fill' : 'regular'} /> <span>{t('common.like')}</span>
            </button>
            <button
              type="button"
              onClick={handleShare}
              data-testid={`feed-share-${item.id}`}
              aria-label={t('common.share')}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-2.5 text-sm font-bold text-ink btn-hover hover:bg-mist"
            >
              {shareState === 'copied'
                ? <Check size={17} className="text-pine" />
                : shareState === 'failed'
                  ? <X size={17} className="text-flag" />
                  : <Share2 size={17} />}
              <span>{t('common.share')}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
