/**
 * Theme colour (Account → Theme colour), as the Aangan 2.0 prototype does it (palette.js):
 * one brand colour tints the whole app. The default is aangan's own red Studio 1947 set, exactly
 * as styles/aangan.css defines it; every other choice is derived from a single colour with the
 * prototype's own mixing formula, so its 12 earthy palettes and "your own colour" look the same here.
 *
 * Works by overriding the theme variables on <html> (the ones aangan.css and tailwind.config.js read).
 * The choice is kept on this device only (no account field for it yet).
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

/** Variables for a non-default theme, derived the way palette.js shades a colour. */
function varsFor(accent: string): Record<string, string> {
  const press = mix(accent, '#0B0A08', 0.32);
  const tint = mix(accent, '#FFFFFF', 0.95);
  const cremeHi = mix(accent, '#FFFFFF', 0.975);
  const creme = mix(accent, '#FFFFFF', 0.955);
  const creme2 = mix(accent, '#FFFFFF', 0.86);
  const blushHi = mix(accent, '#FFFFFF', 0.965);
  const blush = mix(accent, '#FFFFFF', 0.9);
  const blush2 = mix(accent, '#FFFFFF', 0.8);
  const line = mix(accent, '#FFFFFF', 0.82);
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

/** Paint the app in this theme. The default removes every override, so aangan.css's exact red shows. */
export function applyTheme(key: string) {
  const root = document.documentElement;
  for (const k of APPLIED) root.style.removeProperty(k);
  if (key !== DEFAULT_THEME) {
    for (const [k, v] of Object.entries(varsFor(accentOf(key)))) root.style.setProperty(k, v);
  }
  root.dataset.theme = key === DEFAULT_THEME ? DEFAULT_THEME : 'custom';
  // The browser bar follows the brand colour only for custom themes; the default keeps white.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#FFFFFF');
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

