import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Perfectly circular story avatar (Instagram-style) with gradient ring.
 */
export default function StoryCircle({ to, label, image, icon: Icon, active }) {
  const size = 'w-16 h-16 md:w-[72px] md:h-[72px]';
  return (
    <Link to={to} className="flex flex-col items-center gap-1.5 flex-shrink-0 w-[76px] md:w-[88px]" data-testid={`story-${label}`}>
      <div className={`${size} shrink-0 rounded-full p-[2.5px] bg-gradient-to-tr from-pine via-gold to-flag ${active ? 'ring-2 ring-flag ring-offset-2 ring-offset-white' : ''}`}>
        <div className="w-full h-full rounded-full bg-white p-[3px]">
          <div className="w-full h-full rounded-full overflow-hidden bg-mist grid place-items-center">
            {image ? (
              <img src={image} alt={label} className="w-full h-full object-cover" />
            ) : Icon ? (
              <Icon size={22} className="text-pine" />
            ) : null}
          </div>
        </div>
      </div>
      <div className="text-[11px] md:text-xs font-semibold text-ink text-center leading-tight line-clamp-1 w-full">{label}</div>
    </Link>
  );
}
