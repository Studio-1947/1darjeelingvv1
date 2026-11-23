export type DocRequirement = {
  docType: string;
  label: string;
  required: boolean;
  /** How the file is captured. Absent means a photo or scanned document (JPEG, PNG or PDF). */
  media?: 'video';
};

// The documents a host sends to be checked, per business type. Single source of truth for backend
// validation, completion math, and the host's documents screen.
//
// Kept to the short list the Aangan 2.0 prototype asks for (provider.js DOCS): a photo ID, plus one
// photo that ties the person to what they offer. Everything else the first matrix asked for (PAN,
// registration certificates, licences, room photos, walk-around videos, GST) was dropped, not made
// optional: the documents screen lists only what is needed, so an optional slot would be one no
// host can see. Documents already stored under a dropped type stay in the table and in the admin
// queue; they simply no longer count towards verification, and since every list below is a subset
// of the old required one, nobody who was verified before stops being verified.
// The doc type keeps its old key ('aadhaar') so existing uploads still match, but we no longer ask for
// Aadhaar: UIDAI is ending private storage of Aadhaar copies, so the label steers to other photo IDs.
const PHOTO_ID: DocRequirement = { docType: 'aadhaar', label: 'Photo ID: voter ID, driving licence or passport', required: true };

export const KYC_REQUIREMENTS: Record<string, DocRequirement[]> = {
  homestay: [
    PHOTO_ID,
    { docType: 'property_photo_front', label: 'Photo of the property (front of the building)', required: true },
    // The homestay's own papers (user decision 2026-11-19): its homestay registration certificate.
    // Every homestay verified before had this approved, so none loses the Verified tick.
    { docType: 'tourism_registration', label: 'Homestay registration certificate', required: true },
  ],
  // Drivers: the licence, and a selfie beside the vehicle so the person and the car are tied together.
  driver: [
    PHOTO_ID,
    { docType: 'driving_license', label: 'Driving licence', required: true },
    { docType: 'driver_vehicle_photo', label: 'Selfie with your vehicle', required: true },
  ],
  // Guides go to the traveller and have no premises: who they are and a face to match it.
  guide: [
    PHOTO_ID,
    { docType: 'owner_photo', label: 'Your photo / selfie', required: true },
  ],
  // Cafés and shops are fixed premises a traveller walks into: the front, with the name board. Where
  // they are is proved separately, captured live from a phone standing there (`locationMethodFor`).
  cafe: [
    PHOTO_ID,
    { docType: 'premises_photo_front', label: 'Photo of the front (name board visible)', required: true },
  ],
  shop: [
    PHOTO_ID,
    { docType: 'premises_photo_front', label: 'Photo of the front (name board visible)', required: true },
  ],
};

/**
 * The kinds of business whose documents apply: the business's own type first, then any other kind
 * of listing it runs (a homestay that also lists a shop). Unknown kinds are ignored.
 */
export function kycTypes(businessType: string | null | undefined, listingTypes: readonly (string | null | undefined)[] = []): string[] {
  const out: string[] = [];
  for (const t of [businessType, ...listingTypes]) if (t && KYC_REQUIREMENTS[t] && !out.includes(t)) out.push(t);
  return out;
}

/**
 * The documents for one kind of business, or for several together (each document once, in the
 * order the kinds come; the business's own kind first).
 */
export function requirementsFor(types: string | readonly string[]): readonly DocRequirement[] {
  // Defensive copies: the arrays in KYC_REQUIREMENTS are the shared, single source of truth for
  // every consumer; a caller mutating what we return here must never corrupt it for the rest.
  const list = typeof types === 'string' ? [types] : types;
  const out: DocRequirement[] = [];
  for (const t of list) for (const r of KYC_REQUIREMENTS[t] ?? []) if (!out.some((o) => o.docType === r.docType)) out.push({ ...r });
  return out;
}

export function isAllowedDocType(types: string | readonly string[], docType: string): boolean {
  return requirementsFor(types).some(d => d.docType === docType);
}

/** Whether this document is captured as a video rather than a photo or scan. */
export function isVideoDocType(types: string | readonly string[], docType: string): boolean {
  return requirementsFor(types).some(d => d.docType === docType && d.media === 'video');
}

export function requiredDocTypes(types: string | readonly string[]): string[] {
  return requirementsFor(types).filter(d => d.required).map(d => d.docType);
}

export type LocationMethod = 'maps_link' | 'live_capture';

/**
 * How a business has to prove where it is before it counts as verified, or null if it does not.
 *
 * A homestay pastes the Google Maps link for its place. A café or shop captures its location live
 * from a phone standing in the premises, which a pasted link cannot show. A driver works along
 * routes and has no fixed place to prove.
 */
export function locationMethodFor(businessType: string): LocationMethod | null {
  if (businessType === 'homestay') return 'maps_link';
  if (businessType === 'cafe' || businessType === 'shop') return 'live_capture';
  return null;
}

/** Whether the business has to prove its location before it counts as verified. */
export function requiresLocationVerification(businessType: string): boolean {
  return locationMethodFor(businessType) !== null;
}
