import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import SmartImg from '@/components/SmartImg';
import { listingImage, fallbackFor } from '@/lib/listingContent';
import VerifiedBadge from '@/components/provider/VerifiedBadge';
import { MapPin, ArrowLeft, Share2, Heart, ChevronDown, Check } from 'lucide-react';
import { SCREEN_H } from './primitives';
import { useAuth } from '@/context/AuthContext';
import { useFavorites } from '@/context/FavoritesContext';

/** Outcome of a share attempt, so the hero can show feedback next to the button. */
export type ShareOutcome = 'shared' | 'copied' | 'failed';

/** Full-screen hero: cover image, back/like/share, and the title block. */
export default function DetailHero({ item, unit, onShare }: {
  item: any;
  unit: string;
  onShare: () => Promise<ShareOutcome>;
}) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const { user } = useAuth();
  const { isFavorite, toggle } = useFavorites();
  const liked = isFavorite(item.id);
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const heroRef = useRef<HTMLElement>(null);
  const heroContentRef = useRef<HTMLDivElement>(null);

  // Saving requires an account (favorites are per-user). Send a logged-out visitor to sign in and
  // bring them right back to this listing, matching how the booking flow gates on auth.
  const handleLike = () => {
    if (!user) {
      nav(`/login?next=${encodeURIComponent(`/listing/${item.id}`)}`);
      return;
    }
    toggle(item.id).catch(() => {});
  };

  // `nav(-1)` goes nowhere when this is the first entry in the SPA's history - i.e. the visitor
  // landed here directly via a shared link, a new tab, or a refresh (React Router marks that entry
  // with key 'default'). In that case send them to the home feed instead of leaving them on a dead
  // button (or bouncing them off the site entirely).
  const goBack = () => {
    if (loc.key === 'default') nav('/');
    else nav(-1);
  };

  const handleShare = async () => {
    const outcome = await onShare();
    // A successful native share sheet gives its own feedback, so only surface a pill for the
    // clipboard-copy fallback (and for outright failure).
    if (outcome === 'copied' || outcome === 'failed') {
      setShareState(outcome);
      setTimeout(() => setShareState('idle'), outcome === 'copied' ? 1600 : 2400);
    }
  };

  // On landing, only the hero image shows; then the title block rises up from
  // below into place on its own. The page scrolls normally throughout.
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        heroContentRef.current,
        { yPercent: 55, autoAlpha: 0 },
        { yPercent: 0, autoAlpha: 1, duration: 1.1, delay: 0.35, ease: 'power3.out' },
      );
    }, heroRef);
    return () => ctx.revert();
  }, []);

  // A distinct per-listing hero (provider image kept; shared seed images replaced).
  const heroSrc = listingImage(item, 2000, 1200);
  const fallbackImg = fallbackFor(item.type);

  return (
    <section ref={heroRef} className={`relative ${SCREEN_H} h-[calc(100svh-var(--header-h))] w-full overflow-hidden bg-mist`} data-testid="detail-hero">
      <SmartImg src={heroSrc} fallback={fallbackImg} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/45" />

      {/* Below lg the sticky header supplies the back control - avoid two. */}
      <button onClick={goBack} data-testid="detail-back"
        className="absolute z-10 top-4 left-4 md:top-6 md:left-8 hidden lg:inline-flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-white/95 backdrop-blur text-sm font-bold text-ink btn-hover">
        <ArrowLeft size={16} /> {t('common.back')}
      </button>

      <div className="absolute z-10 top-4 right-4 md:top-6 md:right-8 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <button onClick={handleLike} data-testid="detail-like"
            aria-label={t('common.save')} aria-pressed={liked}
            className="w-11 h-11 rounded-full bg-white/95 backdrop-blur grid place-items-center btn-hover">
            <Heart size={18} className={liked ? 'fill-flag text-flag' : 'text-ink'} />
          </button>
          <button onClick={handleShare} data-testid="detail-share" aria-label={t('feed.share')}
            className="w-11 h-11 rounded-full bg-white/95 backdrop-blur grid place-items-center btn-hover">
            <Share2 size={18} className="text-ink" />
          </button>
        </div>
        {shareState !== 'idle' && (
          <span
            role="status"
            data-testid="detail-share-feedback"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-md ${
              shareState === 'copied' ? 'bg-white/95 text-ink' : 'bg-flag text-white'
            }`}
          >
            {shareState === 'copied' ? <><Check size={13} /> {t('detail.share_copied')}</> : t('detail.share_failed')}
          </span>
        )}
      </div>

      {/* Left-aligned hero content. It spans the whole hero, so it has to stay
          click-through or it swallows the back/like/share buttons underneath. */}
      <div ref={heroContentRef} style={{ opacity: 0 }} className="absolute inset-0 pointer-events-none flex flex-col items-start justify-center text-left px-4 md:px-8 lg:px-16">
        <span className="chip bg-white/90 capitalize">{t(`categories.${item.type}`)}</span>
        <h1 className="mt-5 font-display font-extrabold text-5xl sm:text-6xl md:text-8xl text-white leading-[0.95] max-w-4xl"
          data-testid="listing-title">{item.title}</h1>
        {item.provider_verified && (
          <span className="mt-3 inline-flex rounded-full bg-white/90 backdrop-blur p-0.5">
            <VerifiedBadge size="md" />
          </span>
        )}
        <div className="mt-5 flex flex-wrap justify-start items-center gap-x-6 gap-y-2 text-white/90 text-base md:text-lg font-semibold">
          <span className="flex items-center gap-1.5"><MapPin size={18} /> {item.location}</span>
          {item.price > 0 && (
            <span className="flex items-center gap-1.5">
              ₹{item.price}<span className="font-normal text-white/75">{unit || ` ${t('detail.onwards')}`}</span>
            </span>
          )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-6 hidden md:flex justify-center text-white/70">
        <ChevronDown size={26} className="animate-bounce" />
      </div>
    </section>
  );
}
