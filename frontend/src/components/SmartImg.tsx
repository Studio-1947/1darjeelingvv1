import React, { useEffect, useState } from 'react';

/**
 * Shown in place of a photo that is missing or refuses to load.
 *
 * Deliberately branded and obviously not a photograph. The previous behaviour -
 * swapping in a shared stock image of a Himalayan peak - meant an image-host
 * outage looked exactly like a working site: every listing kept showing *a*
 * photo, just not one of itself, so four different homestays and a monastery all
 * appeared under the same mountain. That reads as fabricated inventory to a
 * visitor and is invisible to us. A placeholder that says "no photo" is honest,
 * and makes a CDN going down something we can see from the page.
 */
export function ImageFallback({ className = '', label = '' }: { className?: string; label?: string }) {
  return (
    <span
      // A decorative image (alt="") stays decorative when it fails: role="img"
      // with no accessible name would announce as an unlabelled graphic.
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      data-testid="image-fallback"
      className={`flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-pine to-pine-dark text-white/90 ${className}`}
    >
      {/* Inline rather than <img src="/logo.svg">: the placeholder must not itself
          depend on a network fetch that could be the very thing failing. */}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
        aria-hidden="true" className="w-1/4 max-w-10 min-w-5 opacity-80">
        <path d="M3 18l5.5-7 4 5 3-3.5L21 18" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="8" cy="7.5" r="1.6" />
        <rect x="2.5" y="3.5" width="19" height="17" rx="3" />
      </svg>
    </span>
  );
}

/**
 * <img> that falls back to a branded placeholder rather than a broken-image box.
 *
 * `fallback` is an optional second source tried once before giving up - use it
 * only where a genuine alternate photo of the same subject exists (editorial
 * pages). Listing surfaces pass no fallback: a stand-in photo of somewhere else
 * is worse than admitting there is no photo. See ImageFallback above.
 */
export default function SmartImg({
  src, fallback, alt = '', className = '', ...rest
}: { src?: string, fallback?: string, alt?: string, className?: string } & React.ImgHTMLAttributes<HTMLImageElement>) {
  const [current, setCurrent] = useState(src);
  const [failed, setFailed] = useState(false);

  // Cards are recycled as the feed pages and filters change, so the same element
  // can be handed a new listing's photo. Without this the component would keep
  // rendering the previous src - or stay stuck on the placeholder after one bad
  // image, blanking a listing whose photo is perfectly fine.
  useEffect(() => { setCurrent(src); setFailed(false); }, [src]);

  if (!current || failed) return <ImageFallback className={className} label={alt} />;

  return (
    <img
      src={current}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => {
        if (fallback && current !== fallback) { setCurrent(fallback); return; }
        setFailed(true);
      }}
      {...rest}
    />
  );
}
