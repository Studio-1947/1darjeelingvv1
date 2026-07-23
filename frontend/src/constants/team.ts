/**
 * The people credited on the public About page.
 *
 * `roleKey` indexes into `about.roles.*` in the locale files so job titles
 * translate with the rest of the site; names are proper nouns and are printed
 * as written here. `photo` is optional - without one the card falls back to a
 * branded initial, so a member with no headshot never renders a broken image.
 *
 * ---------------------------------------------------------------------------
 * TODO (owner): this list was seeded from the repository's commit history and
 * the roles are placeholders. Confirm who should appear publicly and correct
 * each role before this ships - nobody should be listed on a public page, or
 * given a title, without agreeing to it first.
 * ---------------------------------------------------------------------------
 */
export type TeamMember = {
  name: string;
  /** Key under `about.roles` in the locale files. */
  roleKey: 'engineering' | 'design' | 'product' | 'content';
  /** Optional headshot URL; omit to use the initial fallback. */
  photo?: string;
  /** Optional profile link (GitHub, LinkedIn, personal site). */
  url?: string;
};

export const TEAM: TeamMember[] = [
  { name: 'Soumic Sarkar', roleKey: 'engineering' },
  { name: 'Rahul Chettri', roleKey: 'engineering' },
  { name: 'Santam Kumai', roleKey: 'engineering' },
];
