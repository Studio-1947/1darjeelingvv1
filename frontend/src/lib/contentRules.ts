/**
 * The server's rules for a public name (backend/src/lib/contentRules.ts checkNameLike), run in the
 * browser too so a form can say what is wrong on the step where the name is typed, not only when
 * the server refuses it at the end. Keep the two in step: same tidying, same lengths, same
 * keyboard-mash test. Anything outside plain A–Z (Nepali, Hindi, Bengali…) is only held to the
 * length and letter counts, as on the server.
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
  const latin = words.filter((w) => /^[a-z]+$/.test(w));
  const mash = (w: string) => {
    if (w.length < 4) return false;
    if (KEYBOARD_RUNS.some((run) => w.includes(run))) return true;
    if (w.length >= 6 && /^(.{2,4})\1+$/.test(w)) return true;
    if (w.length >= 6 && !/[aeiouy]/.test(w)) return true;
    return false;
  };
  const judged = latin.filter((w) => w.length >= 4);
  return judged.length > 0 && judged.every(mash);
}

export type NameProblem = 'empty' | 'long' | 'short' | 'mash';

/** What is wrong with a public name or place, or null when the server will take it. */
export function nameProblem(value: string, max: number): NameProblem | null {
  const tidy = tidyText(value || '');
  if (!tidy) return 'empty';
  if (tidy.length > max) return 'long';
  const letters = (tidy.match(/\p{L}/gu) || []).length;
  if (tidy.length < 3 || letters < 2) return 'short';
  if (looksLikeGibberish(tidy)) return 'mash';
  return null;
}
