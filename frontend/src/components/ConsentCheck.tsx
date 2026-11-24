import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * The "I Agree" box (Terms, Privacy Policy, 18 or older), asked plainly rather than assumed from
 * "by continuing". Used on the sign-in screen and on the first step of the host wizard.
 */
export default function ConsentCheck({ checked, onChange, testId = 'login-consent', inputTestId = 'login-agree' }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId?: string;
  inputTestId?: string;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex items-start gap-3 text-sm text-[var(--ink7)] cursor-pointer min-h-11" data-testid={testId}>
      <input type="checkbox" checked={checked} required onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--r)] w-5 h-5 mt-0.5 flex-none" data-testid={inputTestId} />
      <span>
        <b className="font-medium text-[var(--ink-strong)]">{t('ui.login.agree', 'I Agree')}</b>{' '}
        {t('ui.login.agree_to', 'to the')}{' '}
        <Link to="/terms" className="underline">{t('auth.terms_conditions_link')}</Link>{' '}
        {t('auth.terms_and')}{' '}
        <Link to="/privacy" className="underline">{t('ui.login.privacy_policy', 'Privacy Policy')}</Link>
        {t('ui.login.agree_end', '.')}
      </span>
    </label>
  );
}

/**
 * What the host wizard hands the sign-in screen: the WhatsApp number to fill in (still editable
 * there) and whether I Agree was already ticked. Kept in sessionStorage, not the URL, so the
 * number stays out of browser history and server logs.
 */
const PREFILL_KEY = 'ag-login-prefill';
export type LoginPrefill = { phone?: string; agreed?: boolean };

export function setLoginPrefill(p: LoginPrefill) {
  try { sessionStorage.setItem(PREFILL_KEY, JSON.stringify(p)); } catch { /* private mode */ }
}

export function readLoginPrefill(): LoginPrefill {
  try {
    const p = JSON.parse(sessionStorage.getItem(PREFILL_KEY) || '{}');
    return {
      phone: typeof p.phone === 'string' ? p.phone.replace(/\D/g, '').slice(-10) : undefined,
      agreed: p.agreed === true,
    };
  } catch { return {}; }
}

export function clearLoginPrefill() {
  try { sessionStorage.removeItem(PREFILL_KEY); } catch { /* private mode */ }
}
