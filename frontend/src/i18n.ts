import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import bn from './locales/bn.json';
import hi from './locales/hi.json';
import ne from './locales/ne.json';

const rebrand = (value: unknown) => typeof value === 'string'
  ? value
    .replace(/1Darjeeling/gi, 'aangan')
    .replace(/1 Darjeeling/gi, 'aangan')
    .replace(/One Darjeeling/gi, 'aangan')
    .replace(/1darjeeling\.in/gi, 'aanganerp.in')
  : value;

// Languages (user decision 9 Nov 2026, reversing the Sep 2026 English-only call): English is the
// default; Bengali, Hindi and Nepali can be picked from the header (LanguageSwitcher). Any text not
// translated yet falls back to English. The legal pages (terms, privacy, refunds, data deletion)
// are kept in English on purpose: the English version is the binding one.
//
// The choice is stored under 'aangan-lang' and, when signed in, on the account (users.language;
// AuthContext applies it at sign-in). The browser's own language is not used: English stays the
// default unless the person picks another.
export const LANGUAGES = [
  { code: 'en', label: 'English', english: 'English', short: 'EN' },
  { code: 'bn', label: 'বাংলা', english: 'Bengali', short: 'বাং' },
  { code: 'hi', label: 'हिन्दी', english: 'Hindi', short: 'हि' },
  { code: 'ne', label: 'नेपाली', english: 'Nepali', short: 'ने' },
] as const;
export type LangCode = typeof LANGUAGES[number]['code'];
export const isLangCode = (v: unknown): v is LangCode => LANGUAGES.some((l) => l.code === v);
const STORE_KEY = 'aangan-lang';

let saved: string | null = null;
try {
  saved = localStorage.getItem(STORE_KEY);
  // Old keys from the switcher removed in Sep 2026; they no longer mean anything.
  localStorage.removeItem('lang');
  localStorage.removeItem('lang_version');
} catch {
  // Private-mode / blocked storage: English for this visit.
}

i18n
  .use({ type: 'postProcessor', name: 'aanganBrand', process: rebrand })
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, bn: { translation: bn }, hi: { translation: hi }, ne: { translation: ne } },
    lng: isLangCode(saved) ? saved : 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    postProcess: ['aanganBrand'],
  });

document.documentElement.setAttribute('lang', i18n.language || 'en');
i18n.on('languageChanged', (lng) => {
  document.documentElement.setAttribute('lang', lng);
  try { localStorage.setItem(STORE_KEY, lng); } catch { /* ignore */ }
});

/** Switch the whole site's language. */
export function setLanguage(code: LangCode) {
  if (i18n.language !== code) i18n.changeLanguage(code);
}

export default i18n;
