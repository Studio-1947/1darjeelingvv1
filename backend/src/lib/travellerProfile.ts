/**
 * The traveller profile from the board ("As Traveller" -> "Profile Setup"): who they are and how
 * they like to travel. Every field is optional; these checks only refuse values that are wrong.
 * The website (frontend/src/lib/travellerProfile.ts) and the app (src/lib/travellerProfile.ts)
 * offer the same choices.
 */

export const GENDERS = ['female', 'male', 'other', 'prefer_not'] as const;
export const TRAVELLER_TYPES = ['solo', 'couple', 'family', 'friends', 'business', 'backpacker'] as const;
export const DIETS = ['veg', 'non_veg', 'vegan'] as const;
/** Foods people pick from; free text is not taken, so the list stays clean for hosts to read. */
export const FOODS = ['momo', 'thukpa', 'nepali_thali', 'tea', 'coffee', 'bakery', 'street_food', 'chinese', 'tibetan', 'continental', 'bengali', 'sweets'] as const;

/** A new account's profile columns: all empty until the traveller fills them in. */
export const EMPTY_TRAVELLER_PROFILE = {
  whatsapp: null,
  gender: null,
  birthYear: null,
  address: null,
  pincode: null,
  likedFoods: [] as string[],
  travellerType: null,
  diet: null,
};

export const MIN_AGE = 13;
export const MAX_AGE = 100;

export type ProfilePatch = Partial<{
  whatsapp: string | null;
  gender: string | null;
  birthYear: number | null;
  address: string | null;
  pincode: string | null;
  likedFoods: string[];
  travellerType: string | null;
  diet: string | null;
}>;

const oneOf = (list: readonly string[], v: unknown) => typeof v === 'string' && list.includes(v);
const clear = (v: unknown) => v === null || v === '';

/**
 * Reads the profile fields of a PATCH /users/me body. Returns the columns to write, or the first
 * problem. `age` (years) is turned into a birth year; `birth_year` is also accepted.
 */
export function readProfilePatch(body: any, now = new Date()): { patch: ProfilePatch } | { error: string } {
  const patch: ProfilePatch = {};
  const year = now.getFullYear();

  if (body.whatsapp !== undefined) {
    if (clear(body.whatsapp)) patch.whatsapp = null;
    else {
      const digits = String(body.whatsapp).replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 15) return { error: 'WhatsApp number should be 8 to 15 digits' };
      patch.whatsapp = digits.length === 10 ? `+91${digits}` : `+${digits}`;
    }
  }
  if (body.gender !== undefined) {
    if (clear(body.gender)) patch.gender = null;
    else if (!oneOf(GENDERS, body.gender)) return { error: `gender must be one of ${GENDERS.join(', ')}` };
    else patch.gender = body.gender;
  }
  if (body.age !== undefined || body.birth_year !== undefined) {
    const raw = body.age !== undefined ? body.age : body.birth_year;
    if (clear(raw)) patch.birthYear = null;
    else {
      const n = Number(raw);
      if (!Number.isInteger(n)) return { error: 'age must be a whole number' };
      const birthYear = body.age !== undefined ? year - n : n;
      const age = year - birthYear;
      if (age < MIN_AGE || age > MAX_AGE) return { error: `age must be between ${MIN_AGE} and ${MAX_AGE}` };
      patch.birthYear = birthYear;
    }
  }
  if (body.address !== undefined) {
    if (clear(body.address)) patch.address = null;
    else {
      const a = String(body.address).trim();
      if (a.length < 5 || a.length > 300) return { error: 'address should be 5 to 300 characters' };
      patch.address = a;
    }
  }
  if (body.pincode !== undefined) {
    if (clear(body.pincode)) patch.pincode = null;
    else if (!/^[1-9]\d{5}$/.test(String(body.pincode).trim())) return { error: 'pincode must be 6 digits' };
    else patch.pincode = String(body.pincode).trim();
  }
  if (body.liked_foods !== undefined) {
    const list = body.liked_foods;
    if (!Array.isArray(list) || list.length > FOODS.length || !list.every((f: unknown) => oneOf(FOODS, f))) {
      return { error: 'liked_foods must be a list from the food choices' };
    }
    patch.likedFoods = [...new Set(list as string[])];
  }
  if (body.traveller_type !== undefined) {
    if (clear(body.traveller_type)) patch.travellerType = null;
    else if (!oneOf(TRAVELLER_TYPES, body.traveller_type)) return { error: `traveller_type must be one of ${TRAVELLER_TYPES.join(', ')}` };
    else patch.travellerType = body.traveller_type;
  }
  if (body.diet !== undefined) {
    if (clear(body.diet)) patch.diet = null;
    else if (!oneOf(DIETS, body.diet)) return { error: `diet must be one of ${DIETS.join(', ')}` };
    else patch.diet = body.diet;
  }
  return { patch };
}

type ProfileRow = {
  name?: string | null;
  avatar?: string | null;
  gender?: string | null;
  birthYear?: number | null;
  address?: string | null;
  pincode?: string | null;
  interests?: string[] | null;
  likedFoods?: string[] | null;
  travellerType?: string | null;
  diet?: string | null;
};

/** The board's profile items still empty (email is optional and not counted). */
export function missingProfileFields(u: ProfileRow): string[] {
  const missing: string[] = [];
  if (!u.name?.trim()) missing.push('name');
  if (!u.avatar) missing.push('photo');
  if (!u.gender) missing.push('gender');
  if (!u.birthYear) missing.push('age');
  if (!u.address || !u.pincode) missing.push('address');
  if (!u.interests?.length) missing.push('interests');
  if (!u.likedFoods?.length) missing.push('liked_foods');
  if (!u.travellerType) missing.push('traveller_type');
  if (!u.diet) missing.push('diet');
  return missing;
}
