import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHead, Seg } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { PALETTES, DEFAULT_THEME, accentOf, isThemeKey, mix, themeVars, useTheme, useMode } from '@/lib/theme';

/** The four shades a palette card shows, derived the way palette.js shades one colour (fromOne). */
const shadesOf = (a: string) => ({
  d: mix(a, '#0B0A08', 0.68),
  s: mix(a, '#FFFFFF', 0.955),
  m: mix(a, '#FFFFFF', 0.86),
  c: mix(a, '#FFFFFF', 0.7),
});

type For = 'me' | 'biz';

/**
 * Account → Theme colour (prototype palette.js, V.palette): your own colour, then the palettes as
 * cards (swatch strip, a small preview, the name); the whole app follows at once. Kept on this device.
 *
 * A host also gets the prototype's "For me / For my business" switch. The business colour is saved on
 * the server (PATCH /providers/me {profile:{theme}}) and paints the host's dashboard and public page;
 * while it is being picked this page previews it. `?for=business` opens on the business side (the
 * dashboard's link).
 */
export default function ThemeColour() {
  // Re-render when dark mode is switched, so the business colour follows it.
  const [colourMode] = useMode();
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { user, provider, refreshProvider } = useAuth() as any;
  const [mine, setMine] = useTheme();
  const isHost = user?.role === 'provider' && !!provider;
  const [side, setSide] = useState<For>(params.get('for') === 'business' ? 'biz' : 'me');
  const forBiz = isHost && side === 'biz';

  // The business colour: what the server has, then what the host picks (shown at once, saved after).
  const [biz, setBiz] = useState<string>(isThemeKey(provider?.theme) ? provider.theme : DEFAULT_THEME);
  useEffect(() => { if (isThemeKey(provider?.theme)) setBiz(provider.theme); }, [provider?.theme]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const saveBiz = (key: string, wait = 0) => {
    setBiz(key);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaveState('saving');
      try {
        await api.patch('/providers/me', { profile: { theme: key } });
        setSaveState('saved');
        refreshProvider?.();
      } catch {
        setSaveState('error');
      }
    }, wait);
  };

  const current = forBiz ? biz : mine;
  const pick = (key: string, wait = 0) => (forBiz ? saveBiz(key, wait) : setMine(key));
  const own = /^#/.test(current) ? current : '';

  return (
    <div className="ag-wrap" style={forBiz ? themeVars(biz, colourMode) : undefined} data-testid="theme-page">
      <div className="ag-main">
        <PageHead eyebrow={t('ui.account.eyebrow', 'Your account')} title={t('theme.title', 'Theme colour')} />
        <p className="ag-small">
          {forBiz ? t('theme.biz_sub', 'Your business dashboard and website use this.') : t('theme.sub', 'Pick your colours. Change any time.')}
        </p>

        {isHost && (
          <Seg<For> value={side} onChange={setSide} label={t('theme.title', 'Theme colour')} className="ag-account-palfor"
            options={[
              { value: 'me', label: t('theme.for_me', 'For me'), icon: <Icon name="person" />, testId: 'theme-for-me' },
              { value: 'biz', label: t('theme.for_biz', 'For my business'), icon: <Icon name="bag" />, testId: 'theme-for-biz' },
            ]} />
        )}

        <label className="ag-account-palown" data-testid="theme-own">
          <span className="ag-account-palownsw" style={{ background: own || 'conic-gradient(#B5653E,#B98A22,#5E7F4F,#3F5A8A,#A8455A,#B5653E)' }}>
            <input type="color" value={own || accentOf(current)} aria-label={t('theme.own', 'Your own colour')}
              onChange={(e) => pick(e.target.value.toUpperCase(), 600)} data-testid="theme-own-input" />
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
              <button key={p.key} type="button" role="radio" aria-checked={on} onClick={() => pick(p.key)}
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

        {forBiz && (
          <p className={saveState === 'error' ? 'ag-err' : 'ag-small'} role={saveState === 'error' ? 'alert' : 'status'} aria-live="polite" data-testid="theme-biz-state">
            {saveState === 'saving' && t('theme.biz_saving', 'Saving…')}
            {saveState === 'saved' && t('theme.biz_saved', 'Saved. Your dashboard and website now use this colour.')}
            {saveState === 'error' && t('theme.biz_error', 'That did not save. Please try again.')}
          </p>
        )}
      </div>
    </div>
  );
}
