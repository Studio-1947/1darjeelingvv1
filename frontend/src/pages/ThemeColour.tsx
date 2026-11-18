import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageHead } from '@/components/ag';
import { PALETTES, DEFAULT_THEME, accentOf, mix, useTheme } from '@/lib/theme';

/** The four shades a palette card shows, derived the way palette.js shades one colour (fromOne). */
const shadesOf = (a: string) => ({
  d: mix(a, '#0B0A08', 0.68),
  s: mix(a, '#FFFFFF', 0.955),
  m: mix(a, '#FFFFFF', 0.86),
  c: mix(a, '#FFFFFF', 0.7),
});

/**
 * Account → Theme colour (prototype palette.js, V.palette): your own colour, then the palettes as
 * cards (swatch strip, a small preview, the name); the whole app follows at once. Kept on this device.
 * The prototype's "For my business" switch is left out: businesses have no theme field on the server yet.
 */
export default function ThemeColour() {
  const { t } = useTranslation();
  const [current, setTheme] = useTheme();
  const own = /^#/.test(current) ? current : '';

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        <PageHead eyebrow={t('ui.account.eyebrow', 'Your account')} title={t('theme.title', 'Theme colour')} />
        <p className="ag-small">{t('theme.sub', 'Pick your colours. Change any time.')}</p>

        <label className="ag-account-palown" data-testid="theme-own">
          <span className="ag-account-palownsw" style={{ background: own || 'conic-gradient(#B5653E,#B98A22,#5E7F4F,#3F5A8A,#A8455A,#B5653E)' }}>
            <input type="color" value={own || accentOf(current)} aria-label={t('theme.own', 'Your own colour')}
              onChange={(e) => setTheme(e.target.value.toUpperCase())} data-testid="theme-own-input" />
          </span>
          <span className="min-w-0">
            <b>{t('theme.own', 'Your own colour')}</b><br />
            <span className="ag-small">{t('theme.own_sub', 'Pick one colour. The whole app follows it.')}</span>
          </span>
          <span className={`ag-account-palradio ${own ? 'on' : ''}`} aria-hidden="true" />
        </label>

        <div className="ag-account-palgrid" role="radiogroup" aria-label={t('theme.title', 'Theme colour')}>
          {PALETTES.map((p) => {
            const on = current === p.key;
            const a = accentOf(p.key);
            const sh = shadesOf(a);
            return (
              <button key={p.key} type="button" role="radio" aria-checked={on} onClick={() => setTheme(p.key)}
                data-testid={`theme-${p.key}`} className={`ag-account-palcard ${on ? 'on' : ''}`}>
                <span className="ag-account-palsw" aria-hidden="true">
                  {[a, sh.d, sh.m, sh.c].map((c, i) => <i key={i} style={{ background: c }} />)}
                </span>
                <span className="ag-account-palprev" style={{ background: sh.s, borderColor: sh.c }} aria-hidden="true">
                  <span style={{ background: a }} />
                  <b style={{ color: sh.d }}>Aa</b>
                </span>
                <span className="ag-account-paln">
                  {p.name}
                  <span>{p.key === DEFAULT_THEME ? t('theme.default', 'Studio 1947 red · default') : p.en}</span>
                </span>
                <span className={`ag-account-palradio ${on ? 'on' : ''}`} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
