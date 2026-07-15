import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, MapPin, Share2, Bookmark, MessageCircle, ArrowRight, Phone, Store, Coffee, Ticket, Leaf, Mountain } from 'lucide-react';
import SmartImg from '@/components/SmartImg';
import { listingImage, fallbackFor } from '@/lib/listingContent';

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
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const unit = item.type === 'homestay' ? t('common.per_night') : item.type === 'driver' ? t('common.per_day') : '';
  const cat = t(`categories.${item.type}`);
  const cta = CTA_MAP[item.type] || CTA_MAP.spot;
  const CtaIcon = cta.Icon;
  const img = listingImage(item, 900, 900);
  const fallbackImg = fallbackFor(item.type);

  return (
    <article className="bg-white rounded-3xl border border-[var(--line)] overflow-hidden max-w-xl mx-auto md:mx-0" data-testid={`feed-card-${item.id}`}>
      {/* Header */}
      <div className="flex items-center gap-3 p-3.5">
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
      <Link to={`/listing/${item.id}`} className="block relative bg-mist" data-testid={`feed-card-image-${item.id}`}>
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
      <div className="flex items-center gap-4 px-3.5 pt-3">
        <button onClick={() => setLiked(!liked)} data-testid={`feed-like-${item.id}`} className="btn-hover">
          <Heart size={22} className={liked ? 'fill-flag text-flag' : 'text-ink'} />
        </button>
        <button className="btn-hover" aria-label="Comments"><MessageCircle size={22} className="text-ink" /></button>
        <button className="btn-hover" aria-label="Share"><Share2 size={20} className="text-ink" /></button>
        <button onClick={() => setSaved(!saved)} data-testid={`feed-save-${item.id}`} className="ml-auto btn-hover" aria-label="Save">
          <Bookmark size={22} className={saved ? 'fill-pine text-pine' : 'text-ink'} />
        </button>
      </div>

      {/* Caption */}
      <div className="px-3.5 py-3">
        <Link to={`/listing/${item.id}`} className="font-display font-extrabold text-lg text-ink leading-tight hover:underline">
          {item.title}
        </Link>
        <p className="mt-1 text-xs text-ink-soft flex items-center gap-1"><MapPin size={11} /> {item.location}</p>
        <p className="mt-2 text-sm text-ink leading-relaxed line-clamp-2">{item.description}</p>
        {item.tags?.length > 0 && (
          <div className="mt-2 text-xs text-pine font-semibold">
            {item.tags.slice(0, 3).map((tg) => `#${tg.replace(/-/g, '')}`).join('  ')}
          </div>
        )}

        {/* CTA */}
        <Link
          to={`/listing/${item.id}`}
          data-testid={`feed-cta-${item.id}`}
          className={`mt-3.5 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-full font-bold text-sm btn-hover ${cta.color}`}
        >
          <CtaIcon size={16} /> {t(`cta.${cta.key}`)}
        </Link>
      </div>
    </article>
  );
}
