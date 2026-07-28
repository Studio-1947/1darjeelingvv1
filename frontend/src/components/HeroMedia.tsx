import React, { useEffect, useRef, useState } from 'react';
import { sizedImage } from '@/lib/listingContent';

/**
 * The landing hero's background: a resolution-matched video, or just a still.
 *
 * The source video is 20 MB. Shipping that one file to every device meant a
 * 390px phone downloaded exactly what a 1440px laptop did - 93% of the landing
 * page's weight, for decoration. This picks a Cloudinary-transcoded variant
 * sized to the viewport, and skips the video entirely for anyone who has said
 * (explicitly or by their connection) that they don't want it.
 */

const VIDEO_BASE = 'https://res.cloudinary.com/drgb8w8ak/video/upload';
const VIDEO_ID = 'v1783579758/S_47_July_26_web_cover_video_e1wiyd.mp4';

/**
 * Widest viewport each variant serves, narrowest first. Measured transfer
 * sizes against the 20.2 MB original:
 *   w_640   ~0.9 MB   w_1024  ~1.6 MB   w_1440  ~2.4 MB
 *
 * Keyed on CSS pixels, not device pixels: multiplying by DPR would push every
 * modern phone onto the 1024 variant and undo most of the saving, and this
 * footage sits under a heavy dark gradient where the softness doesn't read.
 */
const LADDER = [
  { upTo: 640, tx: 'f_auto,q_auto,w_640,br_800k' },
  { upTo: 1024, tx: 'f_auto,q_auto,w_1024,br_1500k' },
  { upTo: Infinity, tx: 'f_auto,q_auto,w_1440,br_2500k' },
];

export function videoSrcFor(width: number): string {
  const rung = LADDER.find((r) => width <= r.upTo) ?? LADDER[LADDER.length - 1];
  return `${VIDEO_BASE}/${rung.tx}/${VIDEO_ID}`;
}

/** True when the visitor has asked for less data or less motion. */
function prefersStill(): boolean {
  if (typeof window === 'undefined') return true;

  // matchMedia is the only reliable signal here; the CSS `motion-reduce:hidden`
  // this replaced still mounted the <video>, so the file downloaded in full and
  // was then hidden - the exact cost the preference exists to avoid.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;

  // Vendor-prefixed on older Android Chrome; absent entirely on Safari/Firefox,
  // where we simply fall through to serving the video.
  const nav = navigator as any;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return ['slow-2g', '2g', '3g'].includes(conn.effectiveType);
}

export default function HeroMedia({ poster }: { poster: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Resolved after mount so the first paint is always the poster, and so the
  // decision reads real viewport/connection values rather than a build-time
  // guess. `null` means "not decided yet" - the video must not render then.
  const [src, setSrc] = useState<string | null>(null);
  const [posterWidth, setPosterWidth] = useState(800);

  useEffect(() => {
    const w = window.innerWidth;
    setPosterWidth(w <= 640 ? 640 : w <= 1024 ? 1024 : 1600);
    if (prefersStill()) return;
    // Decided once. Re-picking on resize would restart playback and re-download
    // a second copy - worse than a slightly soft video after a window drag.
    setSrc(videoSrcFor(w));
  }, []);

  // A hero scrolled out of view keeps decoding frames, spending main-thread and
  // GPU budget the feed below needs.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.05 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [src]);

  const posterSrc = sizedImage(poster, posterWidth);

  return (
    <div className="absolute inset-0 z-0">
      {/* Always present: it is the poster while the video buffers, and the whole
          background when there is no video. */}
      <img
        src={posterSrc}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {src && (
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
          preload="metadata"
          poster={posterSrc}
          // One resolved src rather than a <source media> ladder: per the HTML
          // spec `media` is only honoured on <source> inside <picture> and is
          // ignored in <video>. Chrome happens to respect it today, which makes
          // it a trap - on a browser that doesn't, every device silently takes
          // the first listed source.
          src={src}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Full-height dark gradient so the hero copy stays legible at any size. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/45 to-black/75" />
    </div>
  );
}
