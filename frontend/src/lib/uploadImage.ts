import api from '@/lib/api';

/**
 * Read a file into a data URL and push it to the listings upload endpoint.
 * Rejects with a display-ready message string so callers can show it as-is.
 */
export async function uploadImage(file: File): Promise<string> {
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
