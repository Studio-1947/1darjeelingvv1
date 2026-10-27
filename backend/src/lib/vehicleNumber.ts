/**
 * Indian vehicle registration numbers, as a driver would read them off the front number plate.
 *
 * Only the shape is checked, not whether the vehicle exists: a state code, a district number, an
 * optional series, and a running number (`WB 74 A 1234`), or the Bharat series (`22 BH 1234 AA`).
 * The plate photo in the driver's verification is what proves the number is real; this stops a
 * typo or an obviously wrong value from being stored and shown to travellers.
 */

const STANDARD = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/;
const BHARAT_SERIES = /^\d{2}BH\d{4}[A-Z]{1,2}$/;

/** The number in one canonical spelling (upper case, no spaces or hyphens), or null if it is not one. */
export function normaliseVehicleNumber(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const compact = raw.toUpperCase().replace(/[\s-]+/g, '');
  // Shorter than any real plate is a fragment, however well it happens to fit the pattern.
  if (compact.length < 8 || compact.length > 11) return null;
  return STANDARD.test(compact) || BHARAT_SERIES.test(compact) ? compact : null;
}

export const VEHICLE_TYPE_MAX_LENGTH = 60;
