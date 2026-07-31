import { v4 as uuidv4 } from 'uuid';
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
 * Media types we will store, and the extension each one is filed under.
 *
 * This is an allowlist because the bucket is served public-read (lib/s3.ts): anything
 * stored here is fetchable by URL on the media origin, so a caller who could choose the
 * stored Content-Type could host executable HTML/JS there. Both the type *and* the
 * extension come from this table rather than from the caller.
 *
 * SVG is deliberately absent. It is an image to a user but a script-capable document to a
 * browser, and serving one from the media origin would be a stored-XSS primitive.
 */
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

const ACCEPTED_LIST = 'JPEG, PNG, WebP, GIF, AVIF or HEIC';

/**
 * Confirms the decoded bytes really are the media type they claim to be, so the extension
 * and Content-Type we file the object under can't disagree with its contents.
 */
function looksLikeDeclaredType(buffer: Buffer, contentType: string): boolean {
  const startsWith = (...bytes: number[]) =>
    buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b);
  // ISO base media format (HEIC/AVIF): a 4-byte box size, then the literal 'ftyp'.
  const isoBrand = buffer.length >= 12 && buffer.toString('latin1', 4, 8) === 'ftyp';

  switch (contentType) {
    case 'image/jpeg':
      return startsWith(0xff, 0xd8, 0xff);
    case 'image/png':
      return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/gif':
      return buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.toString('latin1', 0, 6));
    case 'image/webp':
      return buffer.length >= 12
        && buffer.toString('latin1', 0, 4) === 'RIFF'
        && buffer.toString('latin1', 8, 12) === 'WEBP';
    case 'image/avif':
    case 'image/heic':
    case 'image/heif':
      return isoBrand;
    default:
      return false;
  }
}

/**
 * Decodes a base64 data URL and stores it in the public MinIO bucket.
 * Returns the public URL. Shared by the provider listing upload and the
 * admin tourist-spot upload so both enforce the same size/content rules.
 */
export async function storeBase64Image(file: unknown, filename: unknown): Promise<string> {
  if (typeof file !== 'string' || !file || typeof filename !== 'string' || !filename) {
    throw new ImageUploadError('File payload and filename are required');
  }

  // One parse of the whole prefix, so the declared type and the payload can never be read
  // from different patterns — a mismatch there is what lets a non-image slip through as one.
  // Media-type parameters (`;charset=…`) are tolerated and ignored.
  const parsed = /^data:([a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*)((?:;[^;,]*)*);base64,([\s\S]*)$/i
    .exec(file.trim());
  if (!parsed) {
    throw new ImageUploadError('File must be a base64 image data URL');
  }

  const contentType = parsed[1].toLowerCase();
  const ext = ALLOWED_TYPES[contentType];
  if (!ext) {
    throw new ImageUploadError(`Unsupported image type — please upload a ${ACCEPTED_LIST} file`);
  }

  // Node's base64 decoder silently skips characters outside the alphabet, which would let a
  // malformed payload decode to something other than what it looks like. Reject instead.
  const base64Data = parsed[3].replace(/\s+/g, '');
  if (!base64Data || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data) || base64Data.length % 4 !== 0) {
    throw new ImageUploadError('File payload is not valid base64');
  }

  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length === 0) throw new ImageUploadError('Empty file');
  if (buffer.length > MAX_UPLOAD_BYTES) throw new ImageUploadError('Image exceeds the 20 MB limit');

  if (!looksLikeDeclaredType(buffer, contentType)) {
    throw new ImageUploadError(`File does not look like a valid ${ACCEPTED_LIST} image`);
  }

  // The key is built entirely from values we control: the caller's filename is never used,
  // so it can't steer the stored object's extension.
  const uniqueKey = `${uuidv4()}${ext}`;

  return uploadToMinIO(buffer, uniqueKey, contentType);
}
