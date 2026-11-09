/**
 * The account fields a person edits themselves (PATCH /users/me): name, email, profile photo and
 * language. Each is checked before it is stored, because all of them are shown back to other
 * people (hosts see a guest's name and photo) and the audits of 2026-11-06 and 2026-11-08 found
 * the endpoint stored anything: a 5,000-letter name, "not-an-email", a `javascript:` photo link.
 *
 * An empty string or null clears email and photo; the name cannot be cleared.
 */
export const MAX_NAME_LEN = 80;
const MAX_EMAIL_LEN = 254;
const MAX_URL_LEN = 2000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// en, hi, ne, bn-IN... The apps ship English only today; this keeps the column to real codes.
const LANGUAGE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

export type AccountPatch = Partial<{ name: string; email: string | null; avatar: string | null; language: string | null }>;

/** A sign-up or profile name: trimmed, with no control characters, 1..80 characters. */
export function cleanName(value: unknown): { name: string } | { error: string } {
  if (typeof value !== 'string') return { error: 'Name must be text' };
  // eslint-disable-next-line no-control-regex
  const name = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name) return { error: 'Name is required' };
  if (name.length > MAX_NAME_LEN) return { error: `Name must be ${MAX_NAME_LEN} characters or fewer` };
  return { name };
}

export function readAccountPatch(body: Record<string, unknown>): { patch: AccountPatch } | { error: string } {
  const patch: AccountPatch = {};

  if (body.name !== undefined) {
    const n = cleanName(body.name);
    if ('error' in n) return n;
    patch.name = n.name;
  }

  if (body.email !== undefined) {
    if (body.email === null || body.email === '') patch.email = null;
    else if (typeof body.email !== 'string') return { error: 'Email must be text' };
    else {
      const email = body.email.trim();
      if (email.length > MAX_EMAIL_LEN || !EMAIL.test(email)) return { error: 'Enter a valid email address' };
      patch.email = email;
    }
  }

  if (body.avatar !== undefined) {
    if (body.avatar === null || body.avatar === '') patch.avatar = null;
    else if (typeof body.avatar !== 'string') return { error: 'Profile photo must be a link' };
    else {
      const url = body.avatar.trim();
      if (url.length > MAX_URL_LEN || !/^https?:\/\/[^\s]+$/i.test(url)) return { error: 'Profile photo must be an http(s) link' };
      patch.avatar = url;
    }
  }

  if (body.language !== undefined) {
    if (body.language === null || body.language === '') patch.language = null;
    else if (typeof body.language !== 'string' || !LANGUAGE.test(body.language)) return { error: 'Unknown language' };
    else patch.language = body.language;
  }

  return { patch };
}
