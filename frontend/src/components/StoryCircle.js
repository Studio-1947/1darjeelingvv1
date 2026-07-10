import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Instagram-style story circle for categories.
 */
export default function StoryCircle({ to, label, image, icon: Icon, active }) {
  return (
    <Link to={to} className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16 md:w-20" data-testid={`story-${label}`}>
      <div className={`w-14 h-14 md:w-16 md:h-16 rounded-full grid place-items-center relative
        ${active ? 'ring-2 ring-flag ring-offset-2' : ''}
      `}>
        <div className="w-full h-full rounded-full p-[2px] bg-gradient-to-tr from-pine via-gold to-flag">
          <div className="w-full h-full rounded-full bg-white p-[2px]">
            <div className="w-full h-full rounded-full overflow-hidden bg-mist">
              {image ? (
                <img src={image} alt={label} className="w-full h-full object-cover" />
              ) : Icon ? (
                <div className="w-full h-full grid place-items-center text-pine"><Icon size={22} /></div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="text-[11px] md:text-xs font-semibold text-ink text-center leading-tight line-clamp-1 w-full">{label}</div>
    </Link>
  );
}
