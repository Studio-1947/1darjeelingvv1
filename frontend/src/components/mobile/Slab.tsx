import React from 'react';

/** Small uppercase mono label - mirrors RN Txt.tsx's `Slab` helper. */
export default function Slab({
  className = '',
  children,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`font-[family-name:var(--mu-font-mono)] uppercase tracking-[0.08em] text-[11px] font-semibold text-[var(--mu-text-mono)] ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}
