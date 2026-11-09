/**
 * The photo a listing shows on cards, the page header and share previews.
 *
 * A host picks a cover with "Change cover"; many never do. Without one, cards used to fall back
 * to a random stock photo (or a blank), even though the host had uploaded 6-8 photos of their
 * own. So: the chosen cover if there is one, otherwise the host's first uploaded photo.
 */
export function firstPhoto(extras: unknown): string {
  const images = (extras as { images?: unknown } | null | undefined)?.images;
  if (!Array.isArray(images)) return '';
  const first = images.find((u) => typeof u === 'string' && u.trim());
  return typeof first === 'string' ? first.trim() : '';
}

export function listingCover(chosen: string | null | undefined, extras: unknown): string {
  const c = typeof chosen === 'string' ? chosen.trim() : '';
  return c || firstPhoto(extras);
}

/**
 * The cover after a host's photos change, for a listing whose host has not chosen a cover.
 * A cover the listing got some other way (e.g. set in the listing editor) is kept, unless it was
 * one of the host's photos and that photo has just been removed or moved off first place.
 */
export function coverAfterPhotosChange(current: string | null | undefined, oldExtras: unknown, newExtras: unknown): string {
  const cur = typeof current === 'string' ? current.trim() : '';
  const oldImages = (oldExtras as { images?: unknown } | null | undefined)?.images;
  const wasDerived = !cur || (Array.isArray(oldImages) && oldImages.includes(cur));
  return wasDerived ? firstPhoto(newExtras) : cur;
}
