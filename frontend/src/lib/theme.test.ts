import { describe, expect, it } from 'vitest';
import { PALETTES, contrast, readableOnLight, mix } from './theme';

/** Contrast check 2026-11-25: in light mode text in the accent must read at WCAG AA (4.5:1). */
describe('readableOnLight', () => {
  it('darkens the default Mitti gold just enough to read on white (was 4.0:1)', () => {
    expect(contrast('#947C47', '#FFFFFF')).toBeLessThan(4.5);
    const light = readableOnLight('#947C47');
    expect(light).toBe('#856F40');
    expect(contrast(light, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves a colour that already reads exactly as it is', () => {
    expect(readableOnLight('#3F5A8A')).toBe('#3F5A8A');
  });

  it('makes every palette read at 4.5:1 on white and on its own cards, and white on it too', () => {
    for (const p of PALETTES) {
      const c = readableOnLight(p.accent);
      expect(contrast(c, '#FFFFFF'), p.key).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c, mix(c, '#FFFFFF', 0.955)), p.key).toBeGreaterThanOrEqual(4.5);
    }
  });
});
