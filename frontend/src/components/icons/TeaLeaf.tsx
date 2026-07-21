import React from 'react';

/**
 * Hand-drawn tea leaf. Matches the lucide-react icon API (size / strokeWidth /
 * className, stroke inherits currentColor) so it can drop into icon slots
 * alongside the lucide set.
 */
export default function TeaLeaf({ size = 24, strokeWidth = 2, className = '', ...rest }) {
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
      {/* stem */}
      <path d="M4 20.5c2.4-3.4 4.9-6 7.8-7.9" />
      {/* leaf body */}
      <path d="M20 4.2c.7 6.4-1.8 10.7-5.5 12.5-2.6 1.3-5.5 1-6.7-.3-1.2-1.3-1.4-4.1.1-6.6C9.5 6.2 13.5 3.7 20 4.2Z" />
      {/* side veins */}
      <path d="M17.2 7.6c-2.1.9-4 2.3-5.4 4.1" />
    </svg>
  );
}
