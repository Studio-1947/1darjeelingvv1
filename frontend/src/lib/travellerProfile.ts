/**
 * The traveller profile choices (board: "Profile Setup"). Same ids as the server
 * (backend/src/lib/travellerProfile.ts) and the app (src/lib/travellerProfile.ts).
 */
export const GENDERS = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
  { id: 'other', label: 'Other' },
  { id: 'prefer_not', label: 'Prefer not to say' },
];

export const TRAVELLER_TYPES = [
  { id: 'solo', label: 'Solo' },
  { id: 'couple', label: 'Couple' },
  { id: 'family', label: 'Family' },
  { id: 'friends', label: 'Friends' },
  { id: 'business', label: 'Work trip' },
  { id: 'backpacker', label: 'Backpacker' },
];

export const DIETS = [
  { id: 'veg', label: 'Veg' },
  { id: 'non_veg', label: 'Non-veg' },
  { id: 'vegan', label: 'Vegan' },
];

export const FOODS = [
  { id: 'momo', label: 'Momo' },
  { id: 'thukpa', label: 'Thukpa' },
  { id: 'nepali_thali', label: 'Nepali thali' },
  { id: 'tea', label: 'Darjeeling tea' },
  { id: 'coffee', label: 'Coffee' },
  { id: 'bakery', label: 'Bakery' },
  { id: 'street_food', label: 'Street food' },
  { id: 'chinese', label: 'Chinese' },
  { id: 'tibetan', label: 'Tibetan' },
  { id: 'continental', label: 'Continental' },
  { id: 'bengali', label: 'Bengali' },
  { id: 'sweets', label: 'Sweets' },
];

/** Places people like; the same ids the app's "pick your vibe" screen saves as interests. */
export const PLACE_INTERESTS = [
  { id: 'nature', label: 'Nature & wildlife' },
  { id: 'food', label: 'Local food' },
  { id: 'treks', label: 'Treks & sunrise' },
  { id: 'culture', label: 'Culture & heritage' },
  { id: 'photo', label: 'Photo spots' },
  { id: 'shopping', label: 'Shopping local' },
];

export const ageFromBirthYear = (birthYear: number | null | undefined) =>
  birthYear ? new Date().getFullYear() - birthYear : null;
