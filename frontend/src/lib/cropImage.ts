/** A crop rectangle in the source image's own pixels (what react-easy-crop reports). */
export type PixelCrop = { x: number; y: number; width: number; height: number };

/** Profile photos are shown at 80-160px; 640px keeps them sharp on 3x screens and the upload small. */
const MAX_SIDE = 640;

/** Load an image URL, resolving once it has decoded. Rejects when the browser cannot read it (HEIC on most desktops). */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image could not be decoded'));
    img.src = src;
  });
}

/** Cut `area` out of the image at `src` and return it as a JPEG file ready for uploadImage. */
export async function cropToFile(src: string, area: PixelCrop, name: string): Promise<File> {
  const img = await loadImage(src);
  const scale = Math.min(1, MAX_SIDE / Math.max(area.width, area.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(area.width * scale));
  canvas.height = Math.max(1, Math.round(area.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  // JPEG has no transparency: paint white first so a transparent PNG doesn't turn black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('Crop failed');
  const base = name.replace(/\.[^.]+$/, '') || 'photo';
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
}
