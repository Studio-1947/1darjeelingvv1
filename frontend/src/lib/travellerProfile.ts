/**
 * The traveller profile choices (board: "Profile Setup"). Same ids as the server
 * (backend/src/lib/travellerProfile.ts) and the app (src/lib/travellerProfile.ts).
 * Labels are i18n keys (en.json ui.travellerProfile); render them with t(item.labelKey).
 */
export const GENDERS = [
  { id: 'female', labelKey: 'ui.travellerProfile.gender.female' },
  { id: 'male', labelKey: 'ui.travellerProfile.gender.male' },
  { id: 'other', labelKey: 'ui.travellerProfile.gender.other' },
  { id: 'prefer_not', labelKey: 'ui.travellerProfile.gender.prefer_not' },
];

export const TRAVELLER_TYPES = [
  { id: 'solo', labelKey: 'ui.travellerProfile.traveller_type.solo' },
  { id: 'couple', labelKey: 'ui.travellerProfile.traveller_type.couple' },
  { id: 'family', labelKey: 'ui.travellerProfile.traveller_type.family' },
  { id: 'friends', labelKey: 'ui.travellerProfile.traveller_type.friends' },
  { id: 'business', labelKey: 'ui.travellerProfile.traveller_type.business' },
  { id: 'backpacker', labelKey: 'ui.travellerProfile.traveller_type.backpacker' },
];

export const DIETS = [
  { id: 'veg', labelKey: 'ui.travellerProfile.diet.veg' },
  { id: 'non_veg', labelKey: 'ui.travellerProfile.diet.non_veg' },
  { id: 'vegan', labelKey: 'ui.travellerProfile.diet.vegan' },
];

export const FOODS = [
  { id: 'momo', labelKey: 'ui.travellerProfile.food.momo' },
  { id: 'thukpa', labelKey: 'ui.travellerProfile.food.thukpa' },
  { id: 'nepali_thali', labelKey: 'ui.travellerProfile.food.nepali_thali' },
  { id: 'tea', labelKey: 'ui.travellerProfile.food.tea' },
  { id: 'coffee', labelKey: 'ui.travellerProfile.food.coffee' },
  { id: 'bakery', labelKey: 'ui.travellerProfile.food.bakery' },
  { id: 'street_food', labelKey: 'ui.travellerProfile.food.street_food' },
  { id: 'chinese', labelKey: 'ui.travellerProfile.food.chinese' },
  { id: 'tibetan', labelKey: 'ui.travellerProfile.food.tibetan' },
  { id: 'continental', labelKey: 'ui.travellerProfile.food.continental' },
  { id: 'bengali', labelKey: 'ui.travellerProfile.food.bengali' },
  { id: 'sweets', labelKey: 'ui.travellerProfile.food.sweets' },
];

/** Places people like; the same ids the app's "pick your vibe" screen saves as interests. */
export const PLACE_INTERESTS = [
  { id: 'nature', labelKey: 'ui.travellerProfile.place_interest.nature' },
  { id: 'food', labelKey: 'ui.travellerProfile.place_interest.food' },
  { id: 'treks', labelKey: 'ui.travellerProfile.place_interest.treks' },
  { id: 'culture', labelKey: 'ui.travellerProfile.place_interest.culture' },
  { id: 'photo', labelKey: 'ui.travellerProfile.place_interest.photo' },
  { id: 'shopping', labelKey: 'ui.travellerProfile.place_interest.shopping' },
];

export const ageFromBirthYear = (birthYear: number | null | undefined) =>
  birthYear ? new Date().getFullYear() - birthYear : null;
