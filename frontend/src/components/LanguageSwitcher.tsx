import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';

const LANGS = [
  { code: 'bn', label: 'বাংলা' },
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ne', label: 'नेपाली' },
];

export default function LanguageSwitcher({ onDark = false }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const current = LANGS.find((l) => l.code === i18n.language) || LANGS[0];
  return (
    <div ref={ref} className="relative">
      <button
        data-testid="language-switcher"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-full border text-sm font-semibold btn-hover transition-colors ${onDark ? 'border-white/30 bg-white/10 backdrop-blur-md text-white' : 'border-[var(--line)] text-ink'}`}
        aria-label={current.label}
      >
        {/* Narrow screens show the code so the header search keeps its width. */}
        <span className="sm:hidden uppercase">{current.code}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown size={14} className="flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-40 bg-white rounded-2xl border border-[var(--line)] shadow-lg overflow-hidden z-50">
          {LANGS.map((l) => (
            <button
              key={l.code}
              data-testid={`lang-option-${l.code}`}
              onClick={() => { i18n.changeLanguage(l.code); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-mist ${i18n.language === l.code ? 'text-pine font-bold' : 'text-ink'}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
