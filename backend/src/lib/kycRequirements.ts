export type DocRequirement = { docType: string; label: string; required: boolean };

// v1 matrix — approved in the design spec (§3). Single source of truth for
// backend validation, completion math, and the frontend checklist.
const IDENTITY: DocRequirement[] = [
  { docType: 'aadhaar', label: 'Aadhaar card', required: true },
  { docType: 'pan', label: 'PAN card', required: true },
  { docType: 'owner_photo', label: 'Owner photo / selfie', required: true },
];

export const KYC_REQUIREMENTS: Record<string, DocRequirement[]> = {
  driver: [
    ...IDENTITY,
    { docType: 'driving_license', label: 'Driving licence', required: true },
    { docType: 'vehicle_rc', label: 'Vehicle registration (RC)', required: true },
    { docType: 'commercial_permit', label: 'Commercial / tourist permit', required: true },
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

export function requirementsFor(businessType: string): DocRequirement[] {
  return KYC_REQUIREMENTS[businessType] ?? [];
}

export function isAllowedDocType(businessType: string, docType: string): boolean {
  return requirementsFor(businessType).some(d => d.docType === docType);
}

export function requiredDocTypes(businessType: string): string[] {
  return requirementsFor(businessType).filter(d => d.required).map(d => d.docType);
}
