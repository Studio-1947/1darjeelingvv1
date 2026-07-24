import React from 'react';

// Fallback for the first frame, before the header is in the DOM to measure.
const CHROME_FALLBACK = 60;

/** Live header height - it varies by breakpoint, so measure rather than guess. */
const chromeHeight = () =>
  (document.querySelector('[data-testid="site-header"]') as HTMLElement | null)?.offsetHeight
  || CHROME_FALLBACK;

/**
 * True while the page's `[data-hero]` banner is still sitting behind the top
 * chrome. The landing header floats over the hero video instead of on its own
 * white plate; when the hero scrolls away it takes a solid background back so
 * it stays legible over ordinary page content.
 */
export default function useHeroOverlay(enabled: boolean) {
  const [overlay, setOverlay] = React.useState(enabled);

  React.useEffect(() => {
    if (!enabled) { setOverlay(false); return; }
    let raf = 0;
    const measure = () => {
      raf = 0;
      const hero = document.querySelector('[data-hero]');
      // On a lazy route the hero can mount a tick after the header. Assume it
      // is coming rather than flashing a white bar for a frame.
      setOverlay(hero ? hero.getBoundingClientRect().bottom > chromeHeight() : true);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled]);

  return overlay;
}
