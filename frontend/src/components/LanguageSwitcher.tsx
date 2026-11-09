import React from 'react';
import { useTranslation } from 'react-i18next';
import { CaretDown, Translate } from '@phosphor-icons/react';
import { LANGUAGES, setLanguage, type LangCode } from '@/i18n';

/**
 * Site-wide language picker: English (default), বাংলা, हिन्दी, नेपाली. The choice is remembered on
 * this device and, when signed in, on the account (users.language), so it follows the person.
 */
export default function LanguageSwitcher({ onDark = false, compact = false }: { onDark?: boolean; compact?: boolean }) {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const current = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];
  const pick = (code: LangCode) => { setLanguage(code); setOpen(false); };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-testid="language-switcher"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t('lang.choose', 'Language')}: ${current.label}`}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center justify-center gap-1 min-w-11 h-9 sm:h-10 px-2 min-[380px]:px-2.5 rounded-full border text-xs sm:text-sm font-bold btn-hover whitespace-nowrap ${
          onDark ? 'border-white/60 text-white bg-white/10 backdrop-blur' : 'border-[var(--line)] text-ink bg-white'}`}
      >
        <Translate size={16} weight="bold" className="hidden min-[380px]:block" />
        {/* Phones show the short code so the header row still fits; wider screens the name. */}
        <span className={compact ? 'uppercase' : 'sm:hidden uppercase'}>{current.short}</span>
        {!compact && <span className="hidden sm:inline">{current.label}</span>}
        <CaretDown size={12} className="hidden min-[380px]:block" />
      </button>
      {open && (
        <ul role="listbox" aria-label={t('lang.choose', 'Language')}
          className="absolute right-0 mt-2 w-44 bg-white rounded-2xl border border-[var(--line)] shadow-lg overflow-hidden z-50 py-1">
          {LANGUAGES.map((l) => (
            <li key={l.code} role="option" aria-selected={i18n.language === l.code}>
              <button type="button" data-testid={`lang-option-${l.code}`} lang={l.code} onClick={() => pick(l.code)}
                className={`w-full text-left px-4 min-h-11 text-sm hover:bg-mist ${i18n.language === l.code ? 'text-pine font-bold' : 'text-ink'}`}>
                {l.label}{l.code !== 'en' && <span className="ml-1.5 text-xs text-ink-soft">{l.english}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
