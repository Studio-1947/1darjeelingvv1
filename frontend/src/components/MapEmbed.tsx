import React, { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

/**
 * Real, interactive map via OpenStreetMap's embed - no API key required.
 * Centres on [lat, lng] with a marker.
 *
 * The iframe's `src` is withheld until the element is both near the viewport and
 * actually has a size, because the map inside it is Leaflet and Leaflet measures
 * its container exactly once, at init. Loading it while the box was still being
 * laid out left every listing showing a white rectangle with a lone marker and
 * the OSM attribution - tiles were reachable the whole time, and the first click
 * on the zoom control made them all appear at once (QA 2.3). Since we don't own
 * the document inside the frame we can't call invalidateSize() on it, so the
 * equivalent is to not start it until the measurement it takes will be correct.
 *
 * The IntersectionObserver half also preserves the `loading="lazy"` behaviour it
 * replaces: a map below the fold still costs nothing until it is scrolled to.
 */
export default function MapEmbed({ coords, title = 'Map', className = '' }: { coords: [number, number], title?: string, className?: string }) {
  const [lat, lng] = coords;
  const d = 0.02; // ~2km half-window
  const bbox = [lng - d, lat - d, lng + d, lat + d].map((n) => n.toFixed(5)).join('%2C');
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(5)}%2C${lng.toFixed(5)}`;

  const holderRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  // Re-arm when the pin moves: the new map has to be measured afresh too.
  useEffect(() => { setLive(false); }, [src]);

  useEffect(() => {
    if (live) return;
    const el = holderRef.current;
    if (!el) return;

    // Older browsers get the map immediately rather than never.
    if (typeof IntersectionObserver === 'undefined' || typeof ResizeObserver === 'undefined') {
      setLive(true);
      return;
    }

    let near = false;
    const tryStart = () => {
      if (!near) return;
      const { width, height } = el.getBoundingClientRect();
      // Under a pixel in either direction means the section is still collapsed -
      // exactly the state that produced the blank map. Wait for the next resize.
      if (width < 1 || height < 1) return;
      setLive(true);
    };

    const io = new IntersectionObserver((entries) => {
      near = entries.some((e) => e.isIntersecting);
      tryStart();
    }, { rootMargin: '300px' });
    const ro = new ResizeObserver(tryStart);

    io.observe(el);
    ro.observe(el);
    return () => { io.disconnect(); ro.disconnect(); };
  }, [live, src]);

  return (
    <div ref={holderRef} className={`relative bg-mist ${className}`} data-testid="map-embed">
      {live ? (
        // Keyed on src so moving the pin remounts the frame rather than leaving a
        // Leaflet instance sized for the previous listing.
        <iframe
          key={src}
          title={title}
          src={src}
          className="absolute inset-0 w-full h-full"
          style={{ border: 0 }}
        />
      ) : (
        // Something deliberate rather than the white box the bug produced, so a
        // map that genuinely can't load still reads as "map here", not "broken".
        <div className="absolute inset-0 grid place-items-center text-ink-soft" aria-hidden="true">
          <MapPin size={28} className="text-pine/50" />
        </div>
      )}
    </div>
  );
}
