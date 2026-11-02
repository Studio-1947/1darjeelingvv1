import api from '@/lib/api';

// Backend caps a stored image at 20 MB and answers an oversize with a 413 the caller can only show
// as a generic "Upload failed". Catch it here so the user gets an accurate reason before we spend
// time reading and base64-encoding a file that's going to be rejected anyway. Keep in sync with
// MAX_UPLOAD_BYTES in backend/src/routes/listings.ts.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif',
]);
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic', 'heif']);

/** Reused by upload controls so their picker matches what the API accepts. */
export const SUPPORTED_IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif,image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif';
export const UNSUPPORTED_IMAGE_MESSAGE = 'This photo format is not supported. Please choose a JPEG, PNG, WebP, GIF, AVIF, or HEIC photo.';

function isSupportedImage(file: File): boolean {
  // iOS and some Android pickers leave File.type blank for HEIC, so accept the checked extension too.
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return SUPPORTED_IMAGE_TYPES.has(file.type.toLowerCase()) || SUPPORTED_IMAGE_EXTENSIONS.has(extension);
}

/**
 * Read a file into a data URL and push it to the listings upload endpoint.
 * Rejects with a display-ready message string so callers can show it as-is.
 */
export async function uploadImage(file: File): Promise<string> {
  if (!isSupportedImage(file)) {
    throw UNSUPPORTED_IMAGE_MESSAGE;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw 'Image is larger than 20 MB. Please choose a smaller photo.';
  }
  const dataUrl = await new Promise<string | ArrayBuffer | null>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject('File reading failed');
    reader.readAsDataURL(file);
  });
  try {
    const res = await api.post('/listings/upload', { file: dataUrl, filename: file.name });
    return res.data.url;
  } catch (err: any) {
    const detail = err?.response?.data?.detail || '';
    if (/unsupported image type/i.test(detail)) throw UNSUPPORTED_IMAGE_MESSAGE;
    throw detail || 'Upload failed';
  }
}

/** Upload several files one after another; resolves to their hosted URLs. */
export async function uploadImages(files: FileList | File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of Array.from(files)) urls.push(await uploadImage(file));
  return urls;
}
