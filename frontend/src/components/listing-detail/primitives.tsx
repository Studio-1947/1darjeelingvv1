import React, { useState } from 'react';

// The site header is sticky, so a "full screen" section is the viewport minus
// its height, or each one would sit past the fold. --header-h tracks the real
// height (the header carries the circular category rail).
//
// This is the hero's height. The stacked sections below it use SECTION_H, which
// is deliberately shorter: a section is centred inside its box, so a heading and
// three photos in a full-viewport frame left half a screen of empty white
// between the description and the Photos block - which reads as a component
// that failed to render rather than as breathing room (QA 4.4). Two thirds of
// the viewport still gives each section the page to itself when its content
// warrants it, and lets a short one close up behind the next.
export const SCREEN_H = 'min-h-[calc(100svh-var(--header-h))]';
export const SECTION_H = 'min-h-[min(66svh,calc(100svh-var(--header-h)))]';

/**
 * How the detail page's sections align their content. Every section in this
 * folder reads these rather than spelling the classes out, so the page can be
 * re-aligned from one place.
 *
 * TRIAL: currently flush-left at every width. To restore centred desktop
 * sections (mobile stays left either way), set them back to:
 *   ALIGN_TEXT  = 'text-left md:text-center'
 *   ALIGN_ROW   = 'justify-start md:justify-center'
 *   ALIGN_BLOCK = 'md:mx-auto'
 */
export const ALIGN_TEXT = 'text-left';
export const ALIGN_ROW = 'justify-start';
export const ALIGN_BLOCK = '';

/**
 * Full-viewport section. Each part of the page gets its own screen.
 *
 * One column width for every section, so their left edges line up as the
 * visitor scrolls. Sections used to pick between max-w-4xl and max-w-6xl, and
 * because both are centred that showed up as content starting at two different
 * indents down the page. Readable measure is set per block inside instead.
 */
export const SCREEN_COL = 'mx-auto w-full max-w-6xl px-4 md:px-8';

export function Screen({ tone = 'bg', children, testid }: {
  tone?: 'bg' | 'white' | 'mist';
  children: React.ReactNode;
  testid?: string;
}) {
  const bg = tone === 'white' ? 'bg-white' : tone === 'mist' ? 'bg-mist' : 'bg-[var(--bg)]';
  return (
    <section data-testid={testid} className={`${SECTION_H} flex items-center ${bg}`}>
      <div className={`${SCREEN_COL} py-16 md:py-20`}>{children}</div>
    </section>
  );
}

/** Section header: eyebrow, title, optional note. Aligned via ALIGN_*. */
export function SectionHead({ label, title, note }: { label: string; title: string; note?: string }) {
  return (
    <div className={`${ALIGN_TEXT} max-w-3xl ${ALIGN_BLOCK}`}>
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

/** Real photo if it loads, otherwise the branded initial - never a broken face. */
export function Avatar({ photo, initial }: { photo?: string; initial: string }) {
  const [failed, setFailed] = useState(false);
  // Follows the text it heads - a centred portrait over a left-aligned name
  // reads as a layout mistake.
  const base = `w-36 h-36 md:w-44 md:h-44 rounded-full overflow-hidden ${ALIGN_BLOCK} shadow-lg ring-4 ring-white`;
  if (!photo || failed) {
    return (
      <div className={`${base} bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-display font-extrabold text-6xl md:text-7xl`}>
        {initial}
      </div>
    );
  }
  return <img src={photo} alt="" onError={() => setFailed(true)} className={`${base} object-cover`} />;
}
