import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Circular category avatar in the header rail.
 *
 * Two shapes, one component. On phones the rail scrolls inside a single white
 * pill, so each item drops its own plate (the pill is the background) and the
 * label goes with it - seven labelled tiles cannot fit 375px legibly, and
 * `aria-label` keeps the name available. From `sm` up every item gets its own
 * plate and a single-line label, and the whole row fits without scrolling.
 */
export default function StoryCircle({ to, label, image, icon: Icon, active, onDark = false }) {
  // Phones scroll, so the tile is sized for the thumb rather than for fit. It
  // hugs the 24px icon fairly tightly to keep the pill behind it shallow.
  const size = 'w-10 h-10 sm:w-11 sm:h-11 lg:w-12 lg:h-12 xl:w-[52px] xl:h-[52px]';
  // Over the hero video the plate turns to smoked glass so the footage reads
  // through the circle instead of being punched out by white. On phones there
  // is no per-item plate at all - only the active item is tinted.
  const plate = onDark
    ? (active ? 'bg-pine/10 sm:bg-white/30 sm:backdrop-blur-md' : 'sm:bg-white/15 sm:backdrop-blur-md')
    : (active ? 'bg-pine/10' : 'sm:bg-mist');
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      // grow + shrink-0 on phones: the tiles share out any spare width in the
      // pill instead of bunching left, but never compress when the row
      // overflows - so narrow screens still scroll cleanly.
      className="flex flex-col items-center gap-1 flex-shrink-0 grow sm:grow-0 w-auto sm:w-[70px] lg:w-[74px] xl:w-[78px]"
      data-testid={`story-${label}`}
    >
      <div className={`${size} shrink-0 rounded-full overflow-hidden grid place-items-center transition-colors ${plate}`}>
        {image ? (
          <img src={image} alt="" className="w-full h-full object-cover" />
        ) : Icon ? (
          // Always dark on phones - the shared pill behind it is white.
          <Icon className={`w-6 h-6 sm:w-[18px] sm:h-[18px] lg:w-5 lg:h-5 text-pine ${onDark ? 'sm:text-white' : ''}`} />
        ) : null}
      </div>
      {/* Single line always - the tile is sized so the longest label
          ("Tourism spots") fits, and anything longer ellipsises rather than
          wrapping and making one tile taller than its neighbours. */}
      <div className={`hidden sm:block text-[10px] lg:text-[11px] text-center leading-tight truncate w-full ${active ? 'font-bold' : 'font-semibold'} ${onDark ? 'text-white drop-shadow-md' : 'text-ink'}`}>
        {label}
      </div>
    </Link>
  );
}
