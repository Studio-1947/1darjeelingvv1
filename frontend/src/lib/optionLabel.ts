import type { TFunction } from 'i18next';

/**
 * Display label for an option value (amenity, tag, vehicle type, route).
 *
 * These values are DATA, not copy: they are written to the listing and read
 * back on the public page, so the stored string stays canonical English. Only
 * the display is translated, via `options.<slug>`. Anything the provider typed
 * themselves has no entry and falls through unchanged - a custom amenity in
 * Nepali should render exactly as it was written.
 */
export const optionSlug = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export function optionLabel(t: TFunction, value: string): string {
  if (!value) return value;
  return t(`options.${optionSlug(value)}`, { defaultValue: value });
}
