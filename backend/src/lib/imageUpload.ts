import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { uploadToMinIO } from './s3';

// Hard cap on an uploaded image, enforced on the decoded bytes. Kept in sync with the
// express.json('28mb') limits in app.ts (base64 inflates ~33%, so 20MB of raw bytes is ~27MB on
// the wire) and nginx's client_max_body_size. The parser limit exists so an oversized body is
// rejected before it's fully buffered; this check gives a clean, specific 400 for anything that
// squeaks under the parser but is still over the real ceiling.
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Thrown for caller-fixable upload problems — routes answer these with a 400. */
export class ImageUploadError extends Error {}

/**
 * Decodes a base64 data URL and stores it in the public MinIO bucket.
 * Returns the public URL. Shared by the provider listing upload and the
 * admin tourist-spot upload so both enforce the same size/content rules.
 */
export async function storeBase64Image(file: unknown, filename: unknown): Promise<string> {
  if (typeof file !== 'string' || !file || typeof filename !== 'string' || !filename) {
    throw new ImageUploadError('File payload and filename are required');
  }

  const base64Data = file.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length === 0) throw new ImageUploadError('Empty file');
  if (buffer.length > MAX_UPLOAD_BYTES) throw new ImageUploadError('Image exceeds the 20 MB limit');

  const ext = path.extname(filename) || '.jpg';
  const uniqueKey = `${uuidv4()}${ext}`;

  const match = file.match(/^data:(\w+\/[\w.+-]+);base64,/);
  const contentType = match ? match[1] : 'image/jpeg';

  return uploadToMinIO(buffer, uniqueKey, contentType);
}
