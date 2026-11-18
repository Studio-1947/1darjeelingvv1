import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageHead } from '@/components/ag';
import { PALETTES, DEFAULT_THEME, accentOf, mix, useTheme } from '@/lib/theme';

/**
 * Account → Theme colour (prototype palette.js, V.palette): pick one of the palettes or your own
 * colour; the whole app follows at once. Kept on this device.
 */
export default function ThemeColour() {
  const { t } = useTranslation();
  const [current, setTheme] = useTheme();
  const own = /^#/.test(current) ? current : '';

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        <PageHead title={t('theme.title', 'Theme colour')} sub={t('theme.sub', 'Pick your colours. Change any time.')} />

        <label className="ag-box flex-row items-center gap-3 cursor-pointer" data-testid="theme-own">
          <span
            className="h-11 w-11 flex-none rounded-full border border-[var(--outline)]"
            style={{ background: own || 'conic-gradient(#B5653E,#B98A22,#5E7F4F,#3F5A8A,#A8455A,#B5653E)' }}
            aria-hidden="true"
          />
          <span className="flex flex-col">
            <b className="text-[var(--ink-strong)]">{t('theme.own', 'Your own colour')}</b>
            <span className="ag-small">{t('theme.own_sub', 'Pick one colour. The whole app follows it.')}</span>
          </span>
          <input
            type="color"
            className="sr-only"
            value={own || '#E60000'}
            onChange={(e) => setTheme(e.target.value.toUpperCase())}
            data-testid="theme-own-input"
          />
        </label>

        <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label={t('theme.title', 'Theme colour')}>
          {PALETTES.map((p) => {
            const on = current === p.key;
            const a = accentOf(p.key);
            return (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTheme(p.key)}
                data-testid={`theme-${p.key}`}
                className={`ag-box flat !gap-2 text-left ${on ? '!border-[var(--r)] !border-2' : ''}`}
              >
                <span className="flex gap-1" aria-hidden="true">
                  {[a, mix(a, '#0B0A08', 0.68), mix(a, '#FFFFFF', 0.86)].map((c) => (
                    <i key={c} className="h-5 w-5 rounded-full border border-black/5" style={{ background: c }} />
                  ))}
                </span>
                <b className="text-[var(--ink-strong)]">{p.name}</b>
                <span className="ag-small">{p.key === DEFAULT_THEME ? t('theme.default', 'Studio 1947 red · default') : p.en}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
