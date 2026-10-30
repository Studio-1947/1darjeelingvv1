export type DocRequirement = {
  docType: string;
  label: string;
  required: boolean;
  /** How the file is captured. Absent means a photo or scanned document (JPEG, PNG or PDF). */
  media?: 'video';
};

// v1 matrix  approved in the design spec (§3). Single source of truth for
// backend validation, completion math, and the frontend checklist.
const IDENTITY: DocRequirement[] = [
  { docType: 'aadhaar', label: 'Aadhaar card', required: true },
  { docType: 'pan', label: 'PAN card', required: true },
  { docType: 'owner_photo', label: 'Owner photo / selfie', required: true },
];

export const KYC_REQUIREMENTS: Record<string, DocRequirement[]> = {
  // Drivers: no PAN and no selfie. The plate photo is the driver check, a shot of the driver
  // beside the vehicle with the front number plate legible, so the person and the car are tied
  // together. Pollution (PUC) and insurance are welcome but must not block a listing.
  driver: [
    { docType: 'aadhaar', label: 'Aadhaar card', required: true },
    { docType: 'driving_license', label: 'Driving licence', required: true },
    { docType: 'vehicle_rc', label: 'Vehicle registration (RC)', required: true },
    {
      docType: 'driver_vehicle_photo',
      label: 'Selfie with your vehicle (front number plate visible)',
      required: true,
    },
    {
      docType: 'driver_vehicle_video',
      label: 'Short vehicle video (walk around, show the plate)',
      required: true,
      media: 'video',
    },
    { docType: 'pollution_certificate', label: 'Pollution certificate (PUC)', required: false },
    { docType: 'vehicle_insurance', label: 'Vehicle insurance', required: false },
  ],
  // Homestays: the host and the property both have to be seen. The selfie is taken at the property
  // with the building behind the host, two photos and a short video show the place itself, and the
  // registration certificate and proof of ownership or tenancy back it up. The Google Maps pin is
  // the sixth check; it is not a document, so it is required separately (see
  // `requiresLocationVerification`).
  homestay: [
    { docType: 'aadhaar', label: 'Aadhaar card', required: true },
    { docType: 'pan', label: 'PAN card', required: true },
    {
      docType: 'owner_photo',
      label: 'Selfie at your property (your homestay visible behind you)',
      required: true,
    },
    { docType: 'property_proof', label: 'Property proof (deed / rent / electricity bill)', required: true },
    { docType: 'tourism_registration', label: 'Homestay / tourism registration certificate', required: true },
    { docType: 'property_photo_front', label: 'Photo of the property (front of the building)', required: true },
    { docType: 'property_photo_room', label: 'Photo of a guest room', required: true },
    {
      docType: 'property_video',
      label: 'Short property video (entrance, rooms, view)',
      required: true,
      media: 'video',
    },
    { docType: 'gst_certificate', label: 'GST certificate', required: false },
  ],
  // Cafés and shops are fixed premises a traveller walks into, so they are checked like one: the
  // trade licence, the owner at the premises, photos of the front and the inside, a short video,
  // and the location captured live from a phone standing there (see `locationMethodFor`).
  cafe: [
    { docType: 'aadhaar', label: 'Aadhaar card', required: true },
    { docType: 'pan', label: 'PAN card', required: true },
    {
      docType: 'owner_photo',
      label: 'Selfie at your restaurant or café (the premises visible behind you)',
      required: true,
    },
    { docType: 'fssai_license', label: 'FSSAI food licence', required: true },
    { docType: 'trade_license', label: 'Shop & Establishment / trade licence', required: true },
    { docType: 'premises_photo_front', label: 'Photo of the front (name board visible)', required: true },
    { docType: 'premises_photo_inside', label: 'Photo of the inside (seating or counter)', required: true },
    {
      docType: 'premises_video',
      label: 'Short video of the premises (entrance, inside, kitchen or counter)',
      required: true,
      media: 'video',
    },
    { docType: 'gst_certificate', label: 'GST certificate', required: false },
  ],
  shop: [
    { docType: 'aadhaar', label: 'Aadhaar card', required: true },
    { docType: 'pan', label: 'PAN card', required: true },
    {
      docType: 'owner_photo',
      label: 'Selfie at your shop (the shop visible behind you)',
      required: true,
    },
    { docType: 'trade_license', label: 'Shop & Establishment / trade licence', required: true },
    { docType: 'premises_photo_front', label: 'Photo of the front (name board visible)', required: true },
    { docType: 'premises_photo_inside', label: 'Photo of the inside (shelves or counter)', required: true },
    {
      docType: 'premises_video',
      label: 'Short video of the shop (entrance, inside, what you sell)',
      required: true,
      media: 'video',
    },
    { docType: 'fssai_license', label: 'FSSAI food licence', required: false },
    { docType: 'gst_certificate', label: 'GST certificate', required: false },
  ],
};

export function requirementsFor(businessType: string): readonly DocRequirement[] {
  // Defensive copy  the array in KYC_REQUIREMENTS is the shared, single source of truth for
  // every consumer; a caller mutating what we return here must never corrupt it for the rest.
  return [...(KYC_REQUIREMENTS[businessType] ?? [])];
}

export function isAllowedDocType(businessType: string, docType: string): boolean {
  return requirementsFor(businessType).some(d => d.docType === docType);
}

/** Whether this document is captured as a video rather than a photo or scan. */
export function isVideoDocType(businessType: string, docType: string): boolean {
  return requirementsFor(businessType).some(d => d.docType === docType && d.media === 'video');
}

export function requiredDocTypes(businessType: string): string[] {
  return requirementsFor(businessType).filter(d => d.required).map(d => d.docType);
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
