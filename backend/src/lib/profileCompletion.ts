import { requirementsFor, requiredDocTypes, locationMethodFor, type LocationMethod } from './kycRequirements';

export type DocState = 'missing' | 'in_review' | 'done' | 'rejected';
export type KycStatus = 'none' | 'partial' | 'submitted' | 'verified';

export type ChecklistItem = {
  key: string;
  label: string;
  kind: 'profile' | 'kyc';
  required: boolean;
  state: DocState;
  /** Set for a KYC row that is a video, so a client opens the right picker. */
  media?: 'video';
  /** Set for the location row: how this business proves where it is, so a client opens the right flow. */
  action?: LocationMethod;
};

export type ProfileInput = {
  businessType: string;
  description: string;
  images: string[];
  priceFrom: number;
  latitude: number | null;
  longitude: number | null;
  extras?: Record<string, any>;
  hasListingImage?: boolean;
  hasListingDescription?: boolean;
  /** How each of this provider's verified listing pins was confirmed (`google_maps_link`, `live_capture`). */
  listingLocationSources?: string[];
};

/**
 * The pin was confirmed the way this kind of business has to confirm it, on the provider or on one
 * of its listings. A café's pasted Google Maps link does not count: it has to be captured live.
 */
function locationVerified(p: ProfileInput): boolean {
  const sources = [
    ...(p.extras?.location_verification?.source ? [p.extras.location_verification.source] : []),
    ...(p.listingLocationSources ?? []),
  ];
  return locationMethodFor(p.businessType) === 'live_capture'
    ? sources.includes('live_capture')
    : sources.length > 0;
}

export type DocInput = { docType: string; status: 'pending' | 'approved' | 'rejected' };

const PROFILE_WEIGHT = 40;
const KYC_WEIGHT = 60;

// Presence checks that make up the "profile richness" portion of the bar.
function profileChecks(p: ProfileInput): { key: string; label: string; done: boolean; action?: LocationMethod }[] {
  const images = [
    ...(Array.isArray(p.images) ? p.images : []),
    ...(Array.isArray(p.extras?.images) ? p.extras.images : []),
    ...(p.extras?.host_avatar ? [p.extras.host_avatar] : []),
  ].filter(Boolean);
  const hasPhoto = images.length >= 1 || p.hasListingImage === true;

  const descText = (p.description || p.extras?.host_bio || '').trim();
  const hasDesc = descText.length >= 20 || p.hasListingDescription === true;

  const checks: { key: string; label: string; done: boolean; action?: LocationMethod }[] = [
    { key: 'description', label: 'Add a description (60+ characters)', done: hasDesc },
    { key: 'photos', label: 'Add at least one photo', done: hasPhoto },
    { key: 'price', label: 'Set a starting price', done: p.priceFrom > 0 },
  ];

  // Drivers operate along routes rather than from a fixed address, so onboarding
  // never offers them a map picker (LocationPicker is homestay/cafe/shop only).
  // Listing the item for them would be permanently unachievable and would cap
  // their bar below 100% no matter what they do.
  const method = locationMethodFor(p.businessType);
  if (method === 'maps_link') {
    // For a homestay a pin typed in by hand is not enough: it has to be the one the host dropped on
    // Google Maps and pasted back, which is what puts the "verified" stamp on the listing.
    checks.push({
      key: 'location',
      label: 'Verify your location with a Google Maps link',
      done: locationVerified(p),
      action: 'maps_link',
    });
  } else if (method === 'live_capture') {
    checks.push({
      key: 'location',
      label: 'Capture your location while you are at your premises',
      done: locationVerified(p),
      action: 'live_capture',
    });
  } else if (p.businessType !== 'driver') {
    checks.push({
      key: 'location',
      label: 'Pin your location on the map',
      done: p.latitude != null && p.longitude != null,
    });
  }

  return checks;
}

function docState(doc: DocInput | undefined): DocState {
  if (!doc) return 'missing';
  if (doc.status === 'approved') return 'done';
  if (doc.status === 'rejected') return 'rejected';
  return 'in_review';
}

export function computeCompletion(
  profile: ProfileInput,
  docs: DocInput[]
): { completionPercent: number; checklist: ChecklistItem[]; kycStatus: KycStatus } {
  const byType = new Map(docs.map(d => [d.docType, d]));

  // Profile portion
  const pChecks = profileChecks(profile);
  const profileDone = pChecks.filter(c => c.done).length;
  const profileScore = pChecks.length ? (profileDone / pChecks.length) * PROFILE_WEIGHT : PROFILE_WEIGHT;

  // KYC portion (required docs only count toward the bar)
  const reqs = requirementsFor(profile.businessType);
  const requiredTypes = requiredDocTypes(profile.businessType);
  const approvedRequired = requiredTypes.filter(t => byType.get(t)?.status === 'approved').length;
  const kycScore = requiredTypes.length
    ? (approvedRequired / requiredTypes.length) * KYC_WEIGHT
    : KYC_WEIGHT; // no requirements → treat KYC portion as complete

  const completionPercent = Math.min(100, Math.round(profileScore + kycScore));

  // Checklist: profile items then KYC items
  const checklist: ChecklistItem[] = [
    ...pChecks.map(c => ({
      key: c.key,
      label: c.label,
      kind: 'profile' as const,
      required: true,
      state: (c.done ? 'done' : 'missing') as DocState,
      ...(c.action ? { action: c.action } : {}),
    })),
    ...reqs.map(r => ({
      key: r.docType,
      label: r.label,
      kind: 'kyc' as const,
      required: r.required,
      state: docState(byType.get(r.docType)),
      ...(r.media ? { media: r.media } : {}),
    })),
  ];

  // kycStatus rollup
  let kycStatus: KycStatus;
  if (requiredTypes.length === 0) {
    kycStatus = 'none';
  } else if (requiredTypes.every(t => byType.get(t)?.status === 'approved')) {
    // Every document approved is not enough for a homestay until its pin is confirmed too; until
    // then something is still missing, so it reads as partial rather than verified.
    kycStatus = locationMethodFor(profile.businessType) !== null && !locationVerified(profile) ? 'partial' : 'verified';
  } else if (requiredTypes.every(t => byType.has(t))) {
    kycStatus = 'submitted';
  } else if (docs.length > 0) {
    kycStatus = 'partial';
  } else {
    kycStatus = 'none';
  }

  return { completionPercent, checklist, kycStatus };
}
