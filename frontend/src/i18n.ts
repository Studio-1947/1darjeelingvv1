import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import bn from './locales/bn.json';
import en from './locales/en.json';
import hi from './locales/hi.json';
import ne from './locales/ne.json';

// Migration: reset stored language once to switch default to English (Jan 2026)
const LANG_VERSION = 'v2-en-default';
if (localStorage.getItem('lang_version') !== LANG_VERSION) {
  localStorage.removeItem('lang');
  localStorage.setItem('lang_version', LANG_VERSION);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { bn: { translation: bn }, en: { translation: en }, hi: { translation: hi }, ne: { translation: ne } },
    fallbackLng: 'en',
    lng: localStorage.getItem('lang') || 'en',
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
  });

// Reflect language on <html lang> so CSS can pick right font
const setHtmlLang = (lng) => {
  document.documentElement.setAttribute('lang', lng);
};
setHtmlLang(i18n.language || 'en');
i18n.on('languageChanged', (lng) => {
  setHtmlLang(lng);
  localStorage.setItem('lang', lng);
});

export default i18n;
