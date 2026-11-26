import { kycTypes, requirementsFor, requiredDocTypes, locationMethodFor, type LocationMethod } from './kycRequirements';

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
  /** The location row: the first listing whose place is not verified yet, where it is fixed. */
  listing_id?: string;
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
  /** The kinds of its listings: a business also sends the documents of each other kind it lists. */
  listingTypes?: string[];
  /**
   * Each listing and whether its own place is verified (decision 2026-11-26: every listing with a
   * place, a homestay, cafe or shop, verifies on its own, by a Google Maps link or the phone's
   * location). Oldest first.
   */
  listingLocations?: { id: string; type: string; verified: boolean }[];
};

const PLACE_KINDS = ['homestay', 'cafe', 'shop'];
/** The listings that have a place to verify. */
const placeListings = (p: ProfileInput) => (p.listingLocations ?? []).filter((l) => PLACE_KINDS.includes(l.type));

/**
 * The pin was confirmed the way this kind of business has to confirm it, on the provider or on one
 * of its listings. A café's pasted Google Maps link does not count: it has to be captured live.
 */
function locationVerified(p: ProfileInput): boolean {
  // Listings known: one listing with a verified place is enough for the business to be verified; the
  // rest still show as to do on the checklist. A link and the phone's location count alike.
  const places = placeListings(p);
  if (places.length) return places.some((l) => l.verified);
  const sources = [
    ...(p.extras?.location_verification?.source ? [p.extras.location_verification.source] : []),
    ...(p.listingLocationSources ?? []),
  ];
  return sources.length > 0;
}

/** Whether this business has a place to verify at all (any listing, or its sign-up kind, with one). */
function needsLocation(p: ProfileInput): boolean {
  return placeListings(p).length > 0 || locationMethodFor(p.businessType) !== null;
}

export type DocInput = { docType: string; status: 'pending' | 'approved' | 'rejected' };

const PROFILE_WEIGHT = 40;
const KYC_WEIGHT = 60;

// Presence checks that make up the "profile richness" portion of the bar.
function profileChecks(p: ProfileInput): { key: string; label: string; done: boolean; action?: LocationMethod; listing_id?: string }[] {
  const images = [
    ...(Array.isArray(p.images) ? p.images : []),
    ...(Array.isArray(p.extras?.images) ? p.extras.images : []),
    ...(p.extras?.host_avatar ? [p.extras.host_avatar] : []),
  ].filter(Boolean);
  const hasPhoto = images.length >= 1 || p.hasListingImage === true;

  const descText = (p.description || p.extras?.host_bio || '').trim();
  const hasDesc = descText.length >= 20 || p.hasListingDescription === true;

  const checks: { key: string; label: string; done: boolean; action?: LocationMethod; listing_id?: string }[] = [
    { key: 'description', label: 'Add a description (20+ characters)', done: hasDesc },
    { key: 'photos', label: 'Add at least one photo', done: hasPhoto },
    { key: 'price', label: 'Set a starting price', done: p.priceFrom > 0 },
  ];

  // Drivers operate along routes rather than from a fixed address, so onboarding
  // never offers them a map picker (LocationPicker is homestay/cafe/shop only).
  // Listing the item for them would be permanently unachievable and would cap
  // their bar below 100% no matter what they do.
  // Every listing with a place verifies its own (by a Google Maps link, the phone's location, or
  // both): the row is done once each one is, and points at the first that is not.
  const places = placeListings(p);
  const method = locationMethodFor(p.businessType);
  if (places.length) {
    const todo = places.find((l) => !l.verified);
    checks.push({
      key: 'location',
      label: places.length > 1
        ? 'Verify the location of each place you list, with a Google Maps link or your phone’s location'
        : 'Verify your location with a Google Maps link or your phone’s location',
      done: !todo,
      action: method ?? 'maps_link',
      ...(todo ? { listing_id: todo.id } : {}),
    });
  } else if (method) {
    checks.push({ key: 'location', label: 'Verify your location with a Google Maps link or your phone’s location', done: locationVerified(p), action: method });
  } else if (p.businessType !== 'driver' && p.businessType !== 'guide') {
    // Drivers and guides go to the traveller; neither has premises to pin.
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
  const types = kycTypes(profile.businessType, profile.listingTypes);
  const reqs = requirementsFor(types);
  const requiredTypes = requiredDocTypes(types);
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
      ...(c.listing_id ? { listing_id: c.listing_id } : {}),
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
    kycStatus = needsLocation(profile) && !locationVerified(profile) ? 'partial' : 'verified';
  } else if (requiredTypes.every(t => byType.has(t))) {
    kycStatus = 'submitted';
  } else if (docs.length > 0) {
    kycStatus = 'partial';
  } else {
    kycStatus = 'none';
  }

  return { completionPercent, checklist, kycStatus };
}
