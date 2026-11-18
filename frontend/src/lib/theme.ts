/**
 * Theme colour (Account → Theme colour), as the Aangan 2.0 prototype does it (palette.js):
 * one brand colour tints the whole app. The default is aangan's own red Studio 1947 set, exactly
 * as styles/aangan.css defines it; every other choice is derived from a single colour with the
 * prototype's own mixing formula, so its 12 earthy palettes and "your own colour" look the same here.
 *
 * Works by overriding the theme variables on <html> (the ones aangan.css and tailwind.config.js read).
 * The person's choice is kept on this device only (no account field for it yet). A business's own
 * colour is saved on the server (profile.theme) and applied to its pages with themeVars().
 */
import React from 'react';

export type Palette = { key: string; name: string; en: string; accent: string };

export const DEFAULT_THEME = 'studio1947';

/** Studio 1947 red first, then the prototype's palettes in its own order. */
export const PALETTES: Palette[] = [
  { key: DEFAULT_THEME, name: 'aangan', en: 'Studio 1947 Red', accent: '#E60000' },
  { key: 'mitti', name: 'Mitti', en: 'Courtyard Earth', accent: '#947C47' },
  { key: 'rhodo', name: 'Guras', en: 'Rhododendron Bloom', accent: '#A8455A' },
  { key: 'terracotta', name: 'Mato', en: 'Terracotta Clay', accent: '#B5653E' },
  { key: 'saipatri', name: 'Saipatri', en: 'Marigold', accent: '#E08A1E' },
  { key: 'dhendo', name: 'Dhendo', en: 'Finger Millet', accent: '#8A5A3B' },
  { key: 'maya', name: 'Maya', en: 'Cherry Red', accent: '#B0213A' },
  { key: 'tea', name: 'Hario', en: 'Tea Garden Green', accent: '#5E7F4F' },
  { key: 'turmeric', name: 'Poilo', en: 'Turmeric Gold', accent: '#B98A22' },
  { key: 'sandstone', name: 'Gundruk', en: 'Fermented Greens', accent: '#7A7340' },
  { key: 'indigo', name: 'Nil', en: 'Indigo Dye', accent: '#3F5A8A' },
  { key: 'monsoon', name: 'Badal', en: 'Monsoon Slate', accent: '#5B6B78' },
  { key: 'charcoal', name: 'Koila', en: 'Charcoal & Cream', accent: '#5A524A' },
];

const STORAGE_KEY = 'aangan-theme';
const HEX = /^#[0-9a-f]{6}$/i;

const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
/** The prototype's mix(h, w, t): move colour h towards w by t (0..1). */
export const mix = (hex: string, toward: string, t: number) => {
  const a = rgbOf(hex);
  const b = rgbOf(toward);
  return toHex(a.map((v, i) => v + (b[i] - v) * t));
};
const channels = (hex: string) => rgbOf(hex).join(' ');

/** The colour a theme key stands for: a palette key or a "#RRGGBB" of the person's own. */
export function accentOf(key: string): string {
  if (HEX.test(key)) return key.toUpperCase();
  return (PALETTES.find((p) => p.key === key) || PALETTES[0]).accent;
}

/**
 * Variables for a non-default theme, derived the way palette.js shades a colour. In dark mode the
 * warm surfaces are the dark ones from aangan.css (html[data-mode=dark]) tinted by the colour instead.
 */
function varsFor(accent: string, dark = false): Record<string, string> {
  const press = mix(accent, '#0B0A08', 0.32);
  const tint = dark ? mix(accent, '#131313', 0.8) : mix(accent, '#FFFFFF', 0.95);
  const cremeHi = dark ? mix(accent, '#1F1D1B', 0.9) : mix(accent, '#FFFFFF', 0.975);
  const creme = dark ? mix(accent, '#1A1817', 0.92) : mix(accent, '#FFFFFF', 0.955);
  const creme2 = dark ? mix(accent, '#26221D', 0.84) : mix(accent, '#FFFFFF', 0.86);
  const blushHi = dark ? mix(accent, '#2A1D1C', 0.88) : mix(accent, '#FFFFFF', 0.965);
  const blush = dark ? mix(accent, '#221817', 0.86) : mix(accent, '#FFFFFF', 0.9);
  const blush2 = dark ? mix(accent, '#3D2524', 0.72) : mix(accent, '#FFFFFF', 0.8);
  const line = dark ? mix(accent, '#33302C', 0.78) : mix(accent, '#FFFFFF', 0.82);
  return {
    '--r': accent,
    '--r-rgb': channels(accent),
    '--r-press': press,
    '--r-press-rgb': channels(press),
    '--r-tint': tint,
    '--r-tint-rgb': channels(tint),
    '--star': accent,
    '--creme-hi': cremeHi,
    '--creme': creme,
    '--creme-rgb': channels(creme),
    '--creme2': creme2,
    '--creme2-rgb': channels(creme2),
    '--blush-hi': blushHi,
    '--blush': blush,
    '--blush-rgb': channels(blush),
    '--blush2': blush2,
    '--warmline': line,
  };
}

const APPLIED = Object.keys(varsFor('#E60000'));

/** The default theme's own values, exactly as styles/aangan.css sets them on :root. */
const DEFAULT_VARS: Record<string, string> = {
  '--r': '#E60000', '--r-rgb': '230 0 0', '--r-press': '#B80000', '--r-press-rgb': '184 0 0',
  '--r-tint': '#FDF0F0', '--r-tint-rgb': '253 240 240', '--star': '#E60000',
  '--creme-hi': '#FFFBF6', '--creme': '#FFF8EF', '--creme-rgb': '255 248 239', '--creme2': '#FBEFDD', '--creme2-rgb': '251 239 221',
  '--blush-hi': '#FFF6F4', '--blush': '#FDECEA', '--blush-rgb': '253 236 234', '--blush2': '#F9D9D5', '--warmline': '#F1E2D3',
};

/** Whether `key` is a theme this app knows: a palette key or a "#RRGGBB" colour. */
export const isThemeKey = (key: unknown): key is string =>
  typeof key === 'string' && (HEX.test(key) || PALETTES.some((p) => p.key === key));

/**
 * The theme variables for one part of the page only, e.g. a business's own colour on its public page
 * and dashboard (prototype palette.js "For my business"). Put the result as the inline style of that
 * part's wrapper; everything inside reads var(--r) and the rest from it, the rest of the app keeps the
 * person's own theme. An unknown or empty key gives no override (undefined).
 */
export function themeVars(key: string | null | undefined, mode: Mode = currentMode()): React.CSSProperties | undefined {
  if (!isThemeKey(key)) return undefined;
  const dark = mode === 'dark';
  if (key === DEFAULT_THEME) {
    // In dark mode only the brand colour is pinned; the surfaces stay the dark ones from aangan.css.
    const v = dark ? Object.fromEntries(Object.entries(DEFAULT_VARS).filter(([k]) => /^--(r|r-rgb|r-press|r-press-rgb|star)$/.test(k))) : DEFAULT_VARS;
    return v as React.CSSProperties;
  }
  return varsFor(accentOf(key), dark) as React.CSSProperties;
}

/**
 * Paint the app in this theme and mode. The default theme removes every override, so aangan.css's
 * exact red (or, in dark mode, its dark set) shows.
 */
export function applyTheme(key: string, mode: Mode = storedMode()) {
  const root = document.documentElement;
  for (const k of APPLIED) root.style.removeProperty(k);
  if (key !== DEFAULT_THEME) {
    for (const [k, v] of Object.entries(varsFor(accentOf(key), mode === 'dark'))) root.style.setProperty(k, v);
  }
  root.dataset.theme = key === DEFAULT_THEME ? DEFAULT_THEME : 'custom';
  root.dataset.mode = mode;
  // The browser bar matches the page.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#131313' : '#FFFFFF');
}

/* ---------- light / dark mode (prototype: the sun/moon button and Account → Dark mode) ---------- */

export type Mode = 'light' | 'dark';
const MODE_KEY = 'aangan-mode';

export function storedMode(): Mode {
  try { return localStorage.getItem(MODE_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

/** The mode the page is showing now. */
export const currentMode = (): Mode => (typeof document !== 'undefined' && document.documentElement.dataset.mode === 'dark' ? 'dark' : 'light');

export function saveMode(mode: Mode) {
  try { if (mode === 'dark') localStorage.setItem(MODE_KEY, 'dark'); else localStorage.removeItem(MODE_KEY); } catch { /* private mode */ }
  applyTheme(storedTheme(), mode);
  window.dispatchEvent(new CustomEvent('aangan:mode', { detail: mode }));
}

/** Current mode, re-rendering when it changes anywhere in the app. */
export function useMode(): [Mode, (mode: Mode) => void] {
  const [mode, setMode] = React.useState<Mode>(currentMode);
  React.useEffect(() => {
    const on = (e: Event) => setMode((e as CustomEvent<Mode>).detail);
    window.addEventListener('aangan:mode', on);
    return () => window.removeEventListener('aangan:mode', on);
  }, []);
  return [mode, saveMode];
}

export function storedTheme(): string {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && (HEX.test(v) || PALETTES.some((p) => p.key === v))) return v;
  } catch { /* private mode */ }
  return DEFAULT_THEME;
}

export function saveTheme(key: string) {
  try {
    if (key === DEFAULT_THEME) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, key);
  } catch { /* private mode: still applied for this visit */ }
  applyTheme(key);
  window.dispatchEvent(new CustomEvent('aangan:theme', { detail: key }));
}

/** Current theme key, re-rendering when it changes anywhere in the app. */
export function useTheme(): [string, (key: string) => void] {
  const [key, setKey] = React.useState(storedTheme);
  React.useEffect(() => {
    const on = (e: Event) => setKey((e as CustomEvent<string>).detail);
    window.addEventListener('aangan:theme', on);
    return () => window.removeEventListener('aangan:theme', on);
  }, []);
  return [key, saveTheme];
}

