import React, { useState } from 'react';

// The site header is sticky (h-14 mobile / h-16 desktop), so a "full screen"
// section is the viewport minus that, or each one would sit past the fold.
export const SCREEN_H = 'min-h-[calc(100svh-3.5rem)] md:min-h-[calc(100svh-4rem)]';

/** Full-viewport section with a centred column. Each part gets its own screen. */
export function Screen({ tone = 'bg', wide = false, children, testid }: {
  tone?: 'bg' | 'white' | 'mist';
  wide?: boolean;
  children: React.ReactNode;
  testid?: string;
}) {
  const bg = tone === 'white' ? 'bg-white' : tone === 'mist' ? 'bg-mist' : 'bg-[var(--bg)]';
  return (
    <section data-testid={testid} className={`${SCREEN_H} flex items-center ${bg}`}>
      <div className={`mx-auto w-full px-4 md:px-8 py-20 md:py-24 ${wide ? 'max-w-6xl' : 'max-w-4xl'}`}>{children}</div>
    </section>
  );
}

/** Centred section header: eyebrow, title, optional note. */
export function SectionHead({ label, title, note }: { label: string; title: string; note?: string }) {
  return (
    <div className="text-center max-w-3xl mx-auto">
      {/* Several sections use the same string for both; showing it twice just
          reads as a stutter, so the eyebrow drops out when it repeats. */}
      {label !== title && (
        <div className="inline-flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-ink-soft">
          {label}
        </div>
      )}
      <h2 className="mt-5 font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">{title}</h2>
      {note && <p className="mt-3 text-ink-soft">{note}</p>}
    </div>
  );
}

/** Real photo if it loads, otherwise the branded initial — never a broken face. */
export function Avatar({ photo, initial }: { photo?: string; initial: string }) {
  const [failed, setFailed] = useState(false);
  const base = 'w-36 h-36 md:w-44 md:h-44 rounded-full overflow-hidden mx-auto shadow-lg ring-4 ring-white';
  if (!photo || failed) {
    return (
      <div className={`${base} bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-display font-extrabold text-6xl md:text-7xl`}>
        {initial}
      </div>
    );
  }
  return <img src={photo} alt="" onError={() => setFailed(true)} className={`${base} object-cover`} />;
}
