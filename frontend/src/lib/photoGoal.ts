/**
 * How many photos a host needs before sending documents for approval, which is what earns the
 * Verified tick. Matches the server's missingMandatory (backend lib/hostProfile.ts): 6 car photos;
 * 8 photos for a homestay, cafe or shop; guides have no minimum.
 */
export function photoGoalFor(type: string | null | undefined): number {
  if (type === 'driver') return 6;
  if (type === 'homestay' || type === 'cafe' || type === 'shop') return 8;
  return 0;
}
