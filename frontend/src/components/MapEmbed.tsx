import React from 'react';

/**
 * Real, interactive map via OpenStreetMap's embed — no API key required.
 * Centres on [lat, lng] with a marker.
 */
export default function MapEmbed({ coords, title = 'Map', className = '' }: { coords: [number, number], title?: string, className?: string }) {
  const [lat, lng] = coords;
  const d = 0.02; // ~2km half-window
  const bbox = [lng - d, lat - d, lng + d, lat + d].map((n) => n.toFixed(5)).join('%2C');
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(5)}%2C${lng.toFixed(5)}`;
  return (
    <iframe
      title={title}
      src={src}
      loading="lazy"
      className={className}
      style={{ border: 0 }}
    />
  );
}
