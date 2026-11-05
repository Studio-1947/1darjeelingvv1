/** The order a homestay's photo groups show in on its page. */
export const PHOTO_GROUP_ORDER = ['front', 'outside', 'room', 'other'] as const;

/**
 * A homestay's photos grouped by what they show (the host labels each one on their profile).
 * Untagged photos go under "other", so a host who labels nothing gets one group, as before.
 * Empty groups are left out; photo order inside a group is the gallery order.
 */
export function groupPhotos(images: string[], kinds?: Record<string, string> | null) {
  const groups = new Map<string, string[]>(PHOTO_GROUP_ORDER.map((k) => [k, []]));
  for (const url of images) {
    const kind = kinds?.[url];
    (groups.get(kind && groups.has(kind) ? kind : 'other') as string[]).push(url);
  }
  return [...groups].filter(([, urls]) => urls.length > 0).map(([kind, urls]) => ({ kind, urls }));
}
