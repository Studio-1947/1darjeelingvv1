import React from 'react';

type Tone = 'light' | 'green' | 'ink';

const TONE_BG: Record<Tone, string> = {
  light: 'var(--mu-bg)',
  green: 'var(--mu-green)',
  ink: 'var(--mu-ink)',
};

const TONE_TEXT: Record<Tone, string> = {
  light: 'var(--mu-ink)',
  green: 'var(--mu-cream)',
  ink: 'var(--mu-cream)',
};

/**
 * Screen chrome for a mobile-ported page, mirroring RN's Screen.tsx. Applies
 * the `.mobile-ui` token scope, a safe-area top inset, and a tone background.
 * `Layout.tsx`'s <main> already supplies the bottom `--bottom-nav-h` padding
 * and the desktop Container/Body centering RN needs for tablet+ width is out
 * of scope here (desktop stays untouched), so neither is ported.
 */
export default function MobileScreen({
  tone = 'light',
  className = '',
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mobile-ui min-h-screen ${className}`}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        background: TONE_BG[tone],
        color: TONE_TEXT[tone],
      }}
    >
      {children}
    </div>
  );
}
