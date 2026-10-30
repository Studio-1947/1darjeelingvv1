// Plain .js for the same reason as api.test.js  the repo has no @types/jest.
//
// The translation-parity suite that used to live here went away with Hindi, Bengali and Nepali
// (English-only, decided Sep 2026). What remains is the check that was never about translation:
//
//   LegalDocument reads `sections` with { returnObjects: true } and guards with
//   `Array.isArray(...) ? ... : []` so a malformed namespace degrades to an EMPTY PAGE rather
//   than throwing. That guard is right  a legal page must not white-screen  but it means a
//   typo produces a blank Terms page that nobody notices until a payment gateway's reviewer
//   opens it and rejects the account.
const en = require('./en.json');

const LEGAL_NAMESPACES = ['privacy', 'terms', 'refunds', 'contact', 'data_deletion'];

describe('legal documents render with content', () => {
  LEGAL_NAMESPACES.forEach((ns) => {
    it(`${ns} has the shape LegalDocument reads`, () => {
      const doc = en[ns];
      expect(doc).toBeDefined();
      expect(typeof doc.title).toBe('string');
      expect(doc.title.length).toBeGreaterThan(0);
      expect(typeof doc.updated).toBe('string');

      // Both are read with { returnObjects: true } and silently become [] if they are not
      // arrays  which is exactly the blank-page failure this guards.
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

// Every t('section.key') in the code must exist in en.json, unless the call carries its own
// fallback text. Without one, a missing key renders as the raw key: the host's booking cards
// and the booking confirmation said "contact.whatsapp" for weeks after the legal Contact page
// replaced the old `contact` section and took seven button labels with it.
describe('every text key the code uses exists', () => {
  const fs = require('fs');
  const path = require('path');
  const has = (key) => {
    let cur = en;
    for (const part of key.split('.')) {
      if (cur && typeof cur === 'object' && part in cur) cur = cur[part];
      else if (cur && typeof cur === 'object' && `${part}_one` in cur) return true;
      else return false;
    }
    return true;
  };
  const files = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(d.name) && !/\.test\./.test(d.name)) files.push(full);
  });
  walk(path.join(__dirname, '..'));

  it('has no missing keys without fallback text', () => {
    const missing = [];
    // t('a.b') or t('a.b', { ... }) with no defaultValue, and no `|| 'text'` straight after.
    const call = /\bt\(\s*'([A-Za-z0-9_]+\.[A-Za-z0-9_.]+)'\s*(\)|,\s*\{([^}]*)\}\s*\))/g;
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      let m;
      while ((m = call.exec(src))) {
        const [, key, , opts] = m;
        if (opts && opts.includes('defaultValue')) continue;
        if (/^\s*\|\|/.test(src.slice(call.lastIndex, call.lastIndex + 6))) continue;
        if (!has(key)) missing.push(`${key} (${path.basename(file)})`);
      }
    }
    expect(missing).toEqual([]);
  });
});
