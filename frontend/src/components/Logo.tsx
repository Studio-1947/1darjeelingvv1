import React from 'react';

/**
 * The aangan app mark (the same tile as the favicon and app icon). Single definition so the asset path, sizing behaviour
 * and decorative alt live in one place rather than being copied per surface.
 *
 * Decorative by default: every place it appears already carries the brand name
 * as adjacent text (or an aria-label on the wrapping link), so a non-empty alt
 * would make screen readers announce the name twice. Pass `alt` where the mark
 * stands alone.
 */
export default function Logo({ className = '', alt = '' }: { className?: string; alt?: string }) {
  return (
    <img
      src="/faviconappicon.svg"
      alt={alt}
      width={64}
      height={64}
      className={`object-contain ${className}`}
    />
  );
}

