import { describe, expect, it } from 'vitest';
import { listingImage, listingImageBackups } from './listingContent';

// A host photo can go missing from storage; the card then tries the host's other photos.
describe('listingImageBackups', () => {
  const photos = ['https://aanganerp.in/one-darjeeling/a.jpg', 'https://aanganerp.in/one-darjeeling/b.jpg', 'https://aanganerp.in/one-darjeeling/c.jpg'];
  const item = { title: 'Pine View', provider_id: 'p1', extras: { images: photos } };

  it('lists the other own photos, not the cover', () => {
    const cover = listingImage(item, 800);
    const backups = listingImageBackups(item, 800);
    expect(backups).not.toContain(cover);
    expect(backups).toHaveLength(2);
    backups.forEach((u) => expect(u).toMatch(/one-darjeeling\/[bc]\.jpg/));
  });

  it('keeps the host photos when an uploaded cover is set apart from them', () => {
    const withCover = { ...item, image: 'https://aanganerp.in/one-darjeeling/cover.jpg' };
    expect(listingImageBackups(withCover, 800)).toHaveLength(3);
  });

  it('is empty for a listing with no photos of its own', () => {
    expect(listingImageBackups({ title: 'X', provider_id: 'p1' }, 800)).toEqual([]);
  });
});
