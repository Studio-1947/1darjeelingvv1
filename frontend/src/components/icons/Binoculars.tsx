import React from 'react';

/**
 * Hand-drawn binoculars. Matches the lucide-react icon API (size / strokeWidth /
 * className, stroke inherits currentColor) so it can drop into icon slots
 * alongside the lucide set.
 */
export default function Binoculars({ size = 24, strokeWidth = 2, className = '', ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      {/* lenses */}
      <circle cx="6" cy="15.8" r="4.2" />
      <circle cx="18" cy="15.8" r="4.2" />
      {/* bridge */}
      <path d="M10.2 15.8h3.6" />
      {/* eyepiece tubes */}
      <path d="M4.3 12.6 5.7 6.1a1.9 1.9 0 0 1 3.8.2l.5 6.4" />
      <path d="M19.7 12.6 18.3 6.1a1.9 1.9 0 0 0-3.8.2l-.5 6.4" />
    </svg>
  );
}
