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
  homestay: [
    ...IDENTITY,
    { docType: 'property_proof', label: 'Property proof (deed / rent / electricity bill)', required: true },
    { docType: 'tourism_registration', label: 'Tourism / homestay registration', required: true },
    { docType: 'gst_certificate', label: 'GST certificate', required: false },
  ],
  cafe: [
    ...IDENTITY,
    { docType: 'fssai_license', label: 'FSSAI food licence', required: true },
    { docType: 'trade_license', label: 'Shop & Establishment / trade licence', required: true },
    { docType: 'gst_certificate', label: 'GST certificate', required: false },
  ],
  shop: [
    ...IDENTITY,
    { docType: 'trade_license', label: 'Shop & Establishment / trade licence', required: true },
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
