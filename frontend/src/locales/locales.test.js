// Plain .js for the same reason as api.test.js — the repo has no @types/jest.
//
// Two things here fail silently rather than loudly, which is why they are worth a test:
//
//  1. A key present in en.json and missing elsewhere renders English mid-sentence in a Hindi page.
//     Nothing errors; it just looks broken to the one user who notices. Three languages were each
//     missing 22 keys before this existed.
//  2. LegalDocument reads `sections` with { returnObjects: true } and guards with
//     `Array.isArray(...) ? ... : []` so a malformed namespace degrades to an EMPTY PAGE rather
//     than throwing. That guard is right — a legal page must not white-screen — but it means a
//     typo produces a blank Terms page that nobody notices until a payment gateway's reviewer
//     opens it and rejects the account.
const en = require('./en.json');
const hi = require('./hi.json');
const bn = require('./bn.json');
const ne = require('./ne.json');

/** Flattens to dotted leaf paths. Arrays are leaves — order and shape are checked separately. */
function leafKeys(obj, prefix = '', acc = []) {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const path = prefix + key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      leafKeys(value, path + '.', acc);
    } else {
      acc.push(path);
    }
  }
  return acc;
}

// The policy documents are authored in English only and reach the other languages through
// i18next's fallback — a deliberate choice, since a mistranslated refund term is worse than an
// English one. They are therefore excluded from the parity check below rather than counted as gaps.
const ENGLISH_ONLY = ['privacy.', 'terms.', 'refunds.', 'contact.', 'data_deletion.'];
const isEnglishOnly = (key) => ENGLISH_ONLY.some((ns) => key.startsWith(ns));

const TRANSLATIONS = { hi, bn, ne };
const LEGAL_NAMESPACES = ['privacy', 'terms', 'refunds', 'contact', 'data_deletion'];

describe('translation parity', () => {
  const englishKeys = leafKeys(en).filter((k) => !isEnglishOnly(k));

  Object.keys(TRANSLATIONS).forEach((locale) => {
    it(`${locale}.json covers every UI key in en.json`, () => {
      const present = new Set(leafKeys(TRANSLATIONS[locale]));
      const missing = englishKeys.filter((k) => !present.has(k));
      expect(missing).toEqual([]);
    });
  });
});

describe('legal documents render with content', () => {
  LEGAL_NAMESPACES.forEach((ns) => {
    it(`${ns} has the shape LegalDocument reads`, () => {
      const doc = en[ns];
      expect(doc).toBeDefined();
      expect(typeof doc.title).toBe('string');
      expect(doc.title.length).toBeGreaterThan(0);
      expect(typeof doc.updated).toBe('string');

      // Both are read with { returnObjects: true } and silently become [] if they are not
      // arrays — which is exactly the blank-page failure this guards.
      expect(Array.isArray(doc.intro)).toBe(true);
      expect(doc.intro.length).toBeGreaterThan(0);
      expect(Array.isArray(doc.sections)).toBe(true);
      expect(doc.sections.length).toBeGreaterThan(0);
    });

    it(`${ns} gives every section a heading`, () => {
      // A section without `h` renders an empty <h2> and orphaned body text.
      en[ns].sections.forEach((section, i) => {
        expect(typeof section.h).toBe('string');
        expect(section.h.length).toBeGreaterThan(0);
        (section.sub || []).forEach((sub) => {
          expect(typeof sub.h).toBe('string');
          expect(sub.h.length).toBeGreaterThan(0);
        });
        expect(i).toBeGreaterThanOrEqual(0);
      });
    });
  });

  it('every policy page reachable from the footer carries a contact route', () => {
    // A payment gateway's review checks that a user can find a way to reach a human from the
    // policy pages, and the grievance rules require it independently of any gateway.
    const withContact = LEGAL_NAMESPACES.filter((ns) =>
      en[ns].sections.some((s) => s.contact && typeof s.contact.email === 'string')
    );
    expect(withContact.sort()).toEqual(['contact', 'data_deletion', 'privacy', 'refunds', 'terms']);
  });
});
