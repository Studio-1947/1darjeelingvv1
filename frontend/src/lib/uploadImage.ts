import api from '@/lib/api';

// Backend caps a stored image at 20 MB and answers an oversize with a 413 the caller can only show
// as a generic "Upload failed". Catch it here so the user gets an accurate reason before we spend
// time reading and base64-encoding a file that's going to be rejected anyway. Keep in sync with
// MAX_UPLOAD_BYTES in backend/src/routes/listings.ts.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Read a file into a data URL and push it to the listings upload endpoint.
 * Rejects with a display-ready message string so callers can show it as-is.
 */
export async function uploadImage(file: File): Promise<string> {
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
    throw err?.response?.data?.detail || 'Upload failed';
  }
}

/** Upload several files one after another; resolves to their hosted URLs. */
export async function uploadImages(files: FileList | File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of Array.from(files)) urls.push(await uploadImage(file));
  return urls;
}
