import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import SmartImg from '@/components/SmartImg';
import { listingImage, fallbackFor } from '@/lib/listingContent';
import { MapPin, ArrowLeft, Share2, Heart, ChevronDown } from 'lucide-react';
import { SCREEN_H } from './primitives';

/** Full-screen hero: cover image, back/like/share, and the title block. */
export default function DetailHero({ item, unit, onShare }: {
  item: any;
  unit: string;
  onShare: () => void;
}) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [liked, setLiked] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const heroContentRef = useRef<HTMLDivElement>(null);

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
    <section ref={heroRef} className={`relative ${SCREEN_H} h-[calc(100svh-3.5rem)] md:h-[calc(100svh-4rem)] w-full overflow-hidden bg-mist`} data-testid="detail-hero">
      <SmartImg src={heroSrc} fallback={fallbackImg} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/45" />

      <button onClick={() => nav(-1)} data-testid="detail-back"
        className="absolute top-4 left-4 md:top-6 md:left-8 inline-flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-white/95 backdrop-blur text-sm font-bold text-ink btn-hover">
        <ArrowLeft size={16} /> {t('common.back')}
      </button>

      <div className="absolute top-4 right-4 md:top-6 md:right-8 flex gap-2">
        <button onClick={() => setLiked(!liked)} data-testid="detail-like" aria-label={t('common.save')}
          className="w-11 h-11 rounded-full bg-white/95 backdrop-blur grid place-items-center btn-hover">
          <Heart size={18} className={liked ? 'fill-flag text-flag' : 'text-ink'} />
        </button>
        <button onClick={onShare} data-testid="detail-share" aria-label="Share"
          className="w-11 h-11 rounded-full bg-white/95 backdrop-blur grid place-items-center btn-hover">
          <Share2 size={18} className="text-ink" />
        </button>
      </div>

      {/* Left-aligned hero content */}
      <div ref={heroContentRef} style={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-start justify-center text-left px-4 md:px-8 lg:px-16">
        <span className="chip bg-white/90 capitalize">{t(`categories.${item.type}`)}</span>
        <h1 className="mt-5 font-display font-extrabold text-5xl sm:text-6xl md:text-8xl text-white leading-[0.95] max-w-4xl"
          data-testid="listing-title">{item.title}</h1>
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
