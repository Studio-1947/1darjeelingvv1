/**
 * Rules for the words people publish: listing names and places, business names, feed posts.
 *
 * Test text ("asdasd", "zxczxfsdfsdf") and one-letter names ("D") reached the live site because
 * only "not empty" was checked. These rules refuse text that cannot be a real name or place and
 * tidy spacing, without second-guessing real words: anything outside plain A–Z (Nepali, Hindi,
 * Bengali…) is only held to the length and letter counts.
 */

/** Trims, joins runs of spaces, and drops a space before a comma or full stop ("Dali , Darjeeling"). */
export function tidyText(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}

// Runs that no English or Indian name contains (so not "erty", which is in "Liberty").
const KEYBOARD_RUNS = ['qwer', 'asdf', 'sdfg', 'dfgh', 'fghj', 'ghjk', 'hjkl', 'zxcv', 'xcvb', 'cvbn', 'vbnm'];

/** True for text that is plainly keyboard-mash rather than words. Only judges plain A–Z words. */
export function looksLikeGibberish(value: string): boolean {
  const words = value.toLowerCase().split(/[\s,.\-/&']+/).filter(Boolean);
  // Words in another script, or with digits, are not judged: only plain A-Z words are.
  const latin = words.filter((w) => /^[a-z]+$/.test(w));
  const mash = (w: string) => {
    if (w.length < 4) return false;
    // A keyboard row typed across ("asdf", "zxcv").
    if (KEYBOARD_RUNS.some((run) => w.includes(run))) return true;
    // The same short chunk typed again and again ("asdasd"). Six letters at least, so names like
    // "Dada" or "Didi" are not caught.
    if (w.length >= 6 && /^(.{2,4})\1+$/.test(w)) return true;
    // Six or more letters with no vowel at all ("zxczxfsdfsdf"). Short names like "Tsh" are fine.
    if (w.length >= 6 && !/[aeiouy]/.test(w)) return true;
    return false;
  };
  // Mash only when every plain A-Z word of four or more letters is mash: one odd word inside a
  // real sentence is not enough.
  const judged = latin.filter((w) => w.length >= 4);
  return judged.length > 0 && judged.every(mash);
}

/**
 * Checks a short public name or place. Returns the tidied value, or a message saying what is wrong.
 * `label` is how the field is named in that message ("Name", "Location").
 */
export function checkNameLike(value: unknown, label: string, max: number): { value: string } | { error: string } {
  if (typeof value !== 'string') return { error: `${label} is required` };
  const tidy = tidyText(value);
  if (!tidy) return { error: `${label} cannot be empty` };
  if (tidy.length > max) return { error: `${label} must be ${max} characters or fewer` };
  const letters = (tidy.match(/\p{L}/gu) || []).length;
  if (tidy.length < 3 || letters < 2) return { error: `${label} is too short. Write it in full, as travellers will see it.` };
  if (looksLikeGibberish(tidy)) return { error: `${label} does not look like a real name. Write it as travellers will see it.` };
  return { value: tidy };
}

/** Checks the text of a feed post: something real, not keyboard-mash. */
export function checkPostText(value: string): string | null {
  const letters = (value.match(/\p{L}/gu) || []).length;
  if (letters < 2) return 'Write a few words for your post';
  if (looksLikeGibberish(value)) return 'This post does not look like real words. Write it as travellers will read it.';
  return null;
}
