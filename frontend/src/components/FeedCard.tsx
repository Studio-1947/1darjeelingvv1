import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, Share2, Bookmark, Star, ArrowRight, Phone, Store, Coffee, Ticket, Leaf, Mountain, Check, X } from 'lucide-react';
import SmartImg from '@/components/SmartImg';
import { listingImage, fallbackFor } from '@/lib/listingContent';
import { useFavorites } from '@/context/FavoritesContext';
import { useLoginGate } from '@/components/LoginGate';
import { shareLink } from '@/lib/share';

const CTA_MAP = {
  homestay: { key: 'book_now', Icon: ArrowRight, color: 'bg-flag text-white' },
  driver: { key: 'talk_to_driver', Icon: Phone, color: 'bg-pine text-white' },
  shop: { key: 'contact_shop', Icon: Store, color: 'bg-ink text-white' },
  cafe: { key: 'visit_cafe', Icon: Coffee, color: 'bg-ink text-white' },
  event: { key: 'join_event', Icon: Ticket, color: 'bg-flag text-white' },
  biodiversity: { key: 'learn_more', Icon: Leaf, color: 'bg-pine text-white' },
  spot: { key: 'explore', Icon: Mountain, color: 'bg-pine text-white' },
};

/**
 * Instagram-post-style feed card with contextual CTA button.
 */
export default function FeedCard({ item, priority = false }) {
  const { t } = useTranslation();
  const nav = useNavigate();
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

  // Rating lives on the detail page, so this is a navigation rather than an action - but it still
  // gates, since an anonymous visitor landing on the review form can't do anything with it.
  const handleRate = () => {
    if (!requireAuth('review')) return;
    nav(`/listing/${item.id}#reviews`);
  };
  const unit = item.type === 'homestay' ? t('common.per_night') : item.type === 'driver' ? t('common.per_day') : '';
  const cat = t(`categories.${item.type}`);
  const cta = CTA_MAP[item.type] || CTA_MAP.spot;
  const CtaIcon = cta.Icon;
  const img = listingImage(item, 900, 900);
  const fallbackImg = fallbackFor(item.type);

  return (
    <article className="bg-white rounded-3xl border border-[var(--line)] overflow-hidden max-w-xl mx-auto md:mx-0 w-full h-full flex flex-col" data-testid={`feed-card-${item.id}`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-3.5 flex-shrink-0">
        <div className="w-10 h-10 rounded-full p-[2px] bg-gradient-to-tr from-pine via-gold to-flag flex-shrink-0">
          <div className="w-full h-full rounded-full bg-white p-[2px]">
            <div className="w-full h-full rounded-full overflow-hidden bg-mist">
              <SmartImg src={img} fallback={fallbackImg} alt="" className="w-full h-full object-cover" loading={priority ? 'eager' : 'lazy'} />
            </div>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-ink truncate">{item.location}</div>
          <div className="text-[11px] text-ink-soft font-semibold uppercase tracking-wider">{cat}</div>
        </div>
      </div>

      {/* Image */}
      <Link to={`/listing/${item.id}`} className="block relative bg-mist flex-shrink-0" data-testid={`feed-card-image-${item.id}`}>
        <div className="aspect-square w-full overflow-hidden">
          <SmartImg src={img} fallback={fallbackImg} alt={item.title} className="w-full h-full object-cover" loading={priority ? 'eager' : 'lazy'} />
        </div>
        {item.price > 0 && (
          <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur text-ink text-sm font-extrabold shadow-sm">
            ₹{item.price}<span className="text-xs text-ink-soft font-semibold">{unit}</span>
          </div>
        )}
      </Link>

      {/* Actions */}
      <div className="flex items-center gap-4 px-3.5 pt-3 flex-shrink-0">
        <button onClick={handleShare} data-testid={`feed-share-${item.id}`} className="btn-hover" aria-label={t('feed.share')}>
          {shareState === 'copied'
            ? <Check size={20} className="text-pine" />
            : shareState === 'failed'
              ? <X size={20} className="text-flag" />
              : <Share2 size={20} className="text-ink" />}
        </button>
        {/* Read-only average rating from real reviews; tapping jumps to the reviews on the detail page. */}
        <button
          type="button"
          onClick={handleRate}
          data-testid={`feed-rating-${item.id}`}
          className="flex items-center gap-1 text-sm btn-hover"
          aria-label={item.review_count > 0
            ? t('feed.rated_aria', { rating: item.rating, count: item.review_count })
            : t('feed.no_reviews_aria')}
        >
          <Star size={18} className={item.review_count > 0 ? 'fill-gold text-gold' : 'text-ink-soft'} />
          {item.review_count > 0 ? (
            <span className="font-bold text-ink">{Number(item.rating).toFixed(1)}
              <span className="font-normal text-ink-soft"> ({item.review_count})</span>
            </span>
          ) : (
            <span className="text-ink-soft text-xs font-semibold">{t('feed.no_reviews')}</span>
          )}
        </button>
        <button onClick={handleSave} data-testid={`feed-save-${item.id}`} className="ml-auto btn-hover" aria-label={t('common.save')} aria-pressed={saved}>
          <Bookmark size={22} className={saved ? 'fill-pine text-pine' : 'text-ink'} />
        </button>
      </div>
      {shareState !== 'idle' && (
        <p role="status" data-testid={`feed-share-msg-${item.id}`}
          className={`px-3.5 pt-1.5 text-xs font-bold ${shareState === 'copied' ? 'text-pine' : 'text-flag'}`}>
          {shareState === 'copied' ? t('detail.share_copied') : t('detail.share_failed')}
        </p>
      )}

      {/* Caption */}
      <div className="px-3.5 py-3 flex-1 flex flex-col">
        <Link to={`/listing/${item.id}`} className="font-display font-extrabold text-lg text-ink leading-tight hover:underline line-clamp-1">
          {item.title}
        </Link>
        <p className="mt-1 text-xs text-ink-soft flex items-center gap-1 truncate"><MapPin size={11} className="flex-shrink-0" /> {item.location}</p>
        <p className="mt-2 text-sm text-ink leading-relaxed line-clamp-2 min-h-[2.75rem]">{item.description}</p>
        <div className="mt-2 text-xs text-pine font-semibold truncate min-h-[1rem]">
          {item.tags?.slice(0, 3).map((tg) => `#${tg.replace(/-/g, '')}`).join('  ')}
        </div>

        {/* CTA */}
        <div className="mt-auto pt-3.5">
          <Link
            to={`/listing/${item.id}`}
            data-testid={`feed-cta-${item.id}`}
            className={`w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-full font-bold text-sm btn-hover ${cta.color}`}
          >
            <CtaIcon size={16} /> {t(`cta.${cta.key}`)}
          </Link>
        </div>
      </div>
    </article>
  );
}
