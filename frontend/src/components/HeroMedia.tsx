import React, { useEffect, useRef, useState } from 'react';
import { sizedImage } from '@/lib/listingContent';

/**
 * The landing hero's background: local optimized WebM video with lazy loading, or a still poster.
 *
 * Uses the local optimized file `/video-hero/S_47_July_26_web_cover_video_e1wiyd.webm`.
 * Lazy loads via IntersectionObserver so the video starts buffering only when approaching
 * the viewport, and pauses when scrolled out of view to save GPU/CPU main thread budget.
 */
const LOCAL_HERO_VIDEO = '/video-hero/S_47_July_26_web_cover_video_e1wiyd.webm';

/** True when the visitor has asked for less data or less motion. */
function prefersStill(): boolean {
  if (typeof window === 'undefined') return true;

  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true;

  const nav = navigator as any;
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (!conn) return false;
  if (conn.saveData) return true;
  return ['slow-2g', '2g', '3g'].includes(conn.effectiveType);
}

export default function HeroMedia({ poster }: { poster: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Lazy loading state: true only when hero approaches/enters viewport and motion is enabled
  const [shouldLoadVideo, setShouldLoadVideo] = useState(false);
  const [posterWidth, setPosterWidth] = useState(800);

  useEffect(() => {
    const w = window.innerWidth;
    setPosterWidth(w <= 640 ? 640 : w <= 1024 ? 1024 : 1600);
    if (prefersStill()) return;

    const container = containerRef.current;
    if (!container) {
      setShouldLoadVideo(true);
      return;
    }

    // Lazy load when container is within 200px of viewport
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoadVideo(true);
        }
      },
      { rootMargin: '200px 0px', threshold: 0.01 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Pause playback when scrolled out of view to save GPU/CPU main-thread budget
  useEffect(() => {
    if (!shouldLoadVideo) return;
    const v = videoRef.current;
    if (!v) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { threshold: 0.05 }
    );

    io.observe(v);
    return () => io.disconnect();
  }, [shouldLoadVideo]);

  const posterSrc = sizedImage(poster, posterWidth);

  return (
    <div ref={containerRef} className="absolute inset-0 z-0">
      {/* Always present: poster image while video buffers or as complete background fallback */}
      <img
        src={posterSrc}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {shouldLoadVideo && (
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden="true"
          preload="metadata"
          poster={posterSrc}
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src={LOCAL_HERO_VIDEO} type="video/webm" />
        </video>
      )}

      {/* Full-height dark gradient so the hero copy stays legible at any size */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/45 to-black/75" />
    </div>
  );
}
