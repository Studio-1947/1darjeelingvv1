import { requirementsFor, requiredDocTypes } from './kycRequirements';

export type DocState = 'missing' | 'in_review' | 'done' | 'rejected';
export type KycStatus = 'none' | 'partial' | 'submitted' | 'verified';

export type ChecklistItem = {
  key: string;
  label: string;
  kind: 'profile' | 'kyc';
  required: boolean;
  state: DocState;
};

export type ProfileInput = {
  businessType: string;
  description: string;
  images: string[];
  priceFrom: number;
  latitude: number | null;
  longitude: number | null;
};

export type DocInput = { docType: string; status: 'pending' | 'approved' | 'rejected' };

const PROFILE_WEIGHT = 40;
const KYC_WEIGHT = 60;

// Presence checks that make up the "profile richness" portion of the bar.
function profileChecks(p: ProfileInput): { key: string; label: string; done: boolean }[] {
  return [
    { key: 'description', label: 'Add a description (60+ characters)', done: p.description.trim().length >= 60 },
    { key: 'photos', label: 'Add at least one photo', done: p.images.length >= 1 },
    { key: 'price', label: 'Set a starting price', done: p.priceFrom > 0 },
    { key: 'location', label: 'Pin your location on the map', done: p.latitude != null && p.longitude != null },
  ];
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
    })),
    ...reqs.map(r => ({
      key: r.docType,
      label: r.label,
      kind: 'kyc' as const,
      required: r.required,
      state: docState(byType.get(r.docType)),
    })),
  ];

  // kycStatus rollup
  let kycStatus: KycStatus;
  if (requiredTypes.length === 0) {
    kycStatus = 'none';
  } else if (requiredTypes.every(t => byType.get(t)?.status === 'approved')) {
    kycStatus = 'verified';
  } else if (requiredTypes.every(t => byType.has(t))) {
    kycStatus = 'submitted';
  } else if (docs.length > 0) {
    kycStatus = 'partial';
  } else {
    kycStatus = 'none';
  }

  return { completionPercent, checklist, kycStatus };
}
