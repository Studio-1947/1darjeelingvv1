import React from 'react';

// The site header is sticky (h-14 mobile / h-16 desktop), so a "full screen"
// section is the viewport minus that, or each one would sit past the fold.
export const SCREEN_H = 'min-h-[calc(100svh-3.5rem)] md:min-h-[calc(100svh-4rem)]';

/** Full-viewport onboarding section: centred column, soft background, divider. */
export function Screen({ tone = 'bg', children }: { tone?: 'bg' | 'white' | 'mist'; children: React.ReactNode }) {
  const bg = tone === 'white' ? 'bg-white' : tone === 'mist' ? 'bg-mist' : 'bg-[var(--bg)]';
  return (
    <section className={`${SCREEN_H} flex items-center ${bg} border-b border-[var(--line)]`}>
      <div className="mx-auto max-w-6xl w-full px-4 md:px-8 py-16 md:py-20">{children}</div>
    </section>
  );
}

/** Numbered eyebrow line above each onboarding section. */
export function Eyebrow({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-ink-soft">
      <span className="text-pine">{n}</span>
      <span className="w-8 h-px bg-[var(--line)]" />
      {children}
    </div>
  );
}
