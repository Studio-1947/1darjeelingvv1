import React from 'react';
import { useTranslation } from 'react-i18next';
import { Chip, Chips } from '@/components/ag';
import { LANGUAGES, setLanguage, type LangCode } from '@/i18n';

/** Chip order and labels from the prototype's language row: EN, हिन्दी, नेपाली, বাংলা. */
const ORDER: LangCode[] = ['en', 'hi', 'ne', 'bn'];

/**
 * The language picker, now only on the Account tab: one chip per language, the current one red.
 * The choice is remembered on this device and, when signed in, on the account (users.language),
 * so it follows the person (AuthContext saves it on languageChanged).
 */
export default function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const langs = ORDER.map((code) => LANGUAGES.find((l) => l.code === code)!).filter(Boolean);
  return (
    <Chips className={className} role="group" aria-label={t('lang.choose', 'Language')} data-testid="language-switcher">
      {langs.map((l) => (
        <Chip key={l.code} on={i18n.language === l.code} lang={l.code} data-testid={`lang-option-${l.code}`}
          aria-label={l.code === 'en' ? l.label : `${l.label} (${l.english})`} onClick={() => setLanguage(l.code)}>
          {l.code === 'en' ? l.short : l.label}
        </Chip>
      ))}
    </Chips>
  );
}
