import api from '@/lib/api';

// The backend refuses anything over 20 MB decoded (lib/imageUpload.ts). Catching it here means
// the admin gets an accurate reason immediately, instead of waiting for a whole photo to be
// read, base64-encoded and uploaded only to be rejected.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Reads a file as a data URL and stores it via the admin upload route. Returns its public URL. */
export async function uploadSpotImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`"${file.name}" is not an image.`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`"${file.name}" is larger than 20 MB. Please choose a smaller photo.`);
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read "${file.name}".`));
    reader.readAsDataURL(file);
  });

  try {
    const { data } = await api.post('/admin/spots/upload', { file: dataUrl, filename: file.name });
    return data.url as string;
  } catch (e: any) {
    throw new Error(e?.response?.data?.detail || `Upload of "${file.name}" failed.`);
  }
}

/**
 * Uploads several files in sequence (the backend rate-limits per minute, and serial uploads keep
 * the progress count honest). Resolves to the stored URLs in the order they were picked.
 */
export async function uploadSpotImages(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files) {
    urls.push(await uploadSpotImage(file));
    onProgress?.(urls.length, files.length);
  }
  return urls;
}
