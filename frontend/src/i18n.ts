import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

const rebrand = (value: unknown) => typeof value === 'string'
  ? value
    .replace(/1Darjeeling/gi, 'aangan')
    .replace(/1 Darjeeling/gi, 'aangan')
    .replace(/One Darjeeling/gi, 'aangan')
    .replace(/1darjeeling\.in/gi, 'aangan.in')
  : value;

// English-only (decided Sep 2026). Hindi, Bengali and Nepali were removed along with the language
// switcher and the browser language detector.
//
// i18next is deliberately kept rather than inlining the ~800 t() call sites: en.json stays the one
// place all user-facing copy lives, which is worth more than the dependency costs. There is no
// detector and no persisted 'lang' key, so the language cannot be anything but English.
//
// One-shot cleanup of the keys the old switcher wrote. Visitors who last chose Nepali still have
// lang='ne' in localStorage; nothing reads it now, but leaving it would strand a stale value that
// looks meaningful to the next person debugging this.
try {
  localStorage.removeItem('lang');
  localStorage.removeItem('lang_version');
} catch {
  // Private-mode / blocked storage. Nothing here is load-bearing.
}

i18n
  .use({ type: 'postProcessor', name: 'aanganBrand', process: rebrand })
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en } },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    postProcess: ['aanganBrand'],
  });

document.documentElement.setAttribute('lang', 'en');

export default i18n;
