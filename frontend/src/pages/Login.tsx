import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Icon } from '@/components/ag/Icon';
import { Box, Button, Option, PageHead, SelectField, TextField } from '@/components/ag';
import Seo from '@/components/Seo';
import { nationalPhone, OTP_COUNTRIES, otpPhone } from '@/lib/phoneRegions';

// Google Identity Services client ID from env
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

/** Seconds before "Resend code" opens, as in the app. */
const RESEND_SECONDS = 30;

export default function Login() {
  const { t } = useTranslation();
  const { login, user, mode } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get('next') || '/';

  // Set once sign-in on this page succeeds: that path navigates by itself, and this effect
  // must not then send them somewhere else.
  const signedInHere = useRef(false);

  // Already signed in: carry on from the side they were last using.
  useEffect(() => {
    if (!user || signedInHere.current) return;
    if (user.role === 'provider' && mode === 'provider') {
      nav('/provider/dashboard');
    } else {
      nav(next);
    }
  }, [user, mode, nav, next]);

  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  // A friend's invite code, as the app asks for it. An invite link (/login?ref=CODE) fills it in.
  const [referral, setReferral] = useState(() => {
    try { return (new URLSearchParams(window.location.search).get('ref') || '').toUpperCase().slice(0, 12); } catch { return ''; }
  });
  const [role, setRole] = useState(() => {
    const r = sp.get('role');
    if (r === 'provider' || r === 'tourist') return r;
    return next.includes('provider') ? 'provider' : 'tourist';
  });
  const [mockOtp, setMockOtp] = useState('');
  // Which channel the code actually went out on. The server asks WhatsApp first
  // and falls back to SMS, and it reports back what it used - so the confirmation
  // can name the right app instead of guessing.
  const [sentChannel, setSentChannel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [userExists, setUserExists] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const gisLoaded = useRef(false);
  const country = OTP_COUNTRIES.find((item) => item.code === countryCode) ?? OTP_COUNTRIES[0];
  const canonicalPhone = otpPhone(phone, country);

  // The choice made above decides which side opens, as the app's Traveller / Host switch does.
  // A host who picked Traveller gets the traveller side with no second question; they can switch
  // to their business from the profile menu at any time. Picking Business opens the business
  // side. The dashboard directs a new business to onboarding and an existing unpaid
  // business to its activation payment.
  const finishSignIn = useCallback((data) => {
    signedInHere.current = true;
    login(data.token, data.user, role);
    if (role === 'provider') {
      nav('/provider/dashboard');
    } else if (!userExists && !data.user?.gender && !data.user?.travellerType) {
      // A new traveller: Profile Setup first (skippable), then where they were going.
      nav(`/profile/edit?setup=1&next=${encodeURIComponent(next)}`);
    } else {
      nav(next);
    }
  }, [login, nav, next, role, userExists]);

  // Initialize Google Identity Services once and prompt the One Tap UI.
  const handleGoogleSignIn = useCallback(async (idToken: string) => {
    try {
      const { data } = await api.post('/auth/google', { idToken, role });
      finishSignIn(data);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || t('ui.login.google_failed'));
    } finally {
      setGoogleBusy(false);
    }
  }, [finishSignIn, role, t]);

  // Load the GIS script once and initialize.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || gisLoaded.current) return;
    const loadGis = async () => {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
        if (existing) { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed to load Google Sign-In'));
        document.head.appendChild(s);
      });
      gisLoaded.current = true;
    };
    loadGis();
  }, []);

  // "Resend code" opens after this many seconds, as in the app (LoginForm RESEND_SECONDS).
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const requestCode = async () => {
    if (!canonicalPhone) return;
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/auth/otp/send', { phone: canonicalPhone, channel: 'whatsapp' });
      setMockOtp(data.mock_otp);
      setSentChannel(data.channel || '');
      setUserExists(!!data.exists);
      setOtp('');
      setStep(2);
      setResendIn(RESEND_SECONDS);
    } catch (e) { setErr(e?.response?.data?.detail || t('auth.send_failed')); }
    finally { setBusy(false); }
  };

  const sendOtp = async (e) => {
    e.preventDefault();
    await requestCode();
  };

  const verify = async (e) => {
    e.preventDefault();
    if (!canonicalPhone) return;
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/auth/otp/verify', {
        phone: canonicalPhone, otp, name, role,
        // Only a new account can redeem a code; the server ignores it for an existing one.
        ...(!userExists && referral.trim() ? { referral_code: referral.trim() } : {}),
      });
      finishSignIn(data);
    } catch (e) { setErr(e?.response?.data?.detail || t('auth.invalid_otp')); }
    finally { setBusy(false); }
  };

  const googleSignIn = async () => {
    setGoogleBusy(true);
    setErr('');
    try {
      // Wait for GIS to load if not yet available
      if (!window.google?.accounts?.id) {
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (window.google?.accounts?.id) { clearInterval(check); resolve(); }
          }, 100);
          setTimeout(() => { clearInterval(check); resolve(); }, 5000);
        });
      }
      if (!window.google?.accounts?.id) {
        setErr(t('ui.login.google_unavailable'));
        setGoogleBusy(false);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response: any) => handleGoogleSignIn(response.credential),
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      window.google.accounts.id.prompt();
    } catch (e: any) {
      setErr(e?.message || t('ui.login.google_failed'));
      setGoogleBusy(false);
    }
  };

  return (
    <div className="ag-wrap">
      <Seo title={t('auth.welcome')} noindex />
      <div className="ag-main ag-account-login">
        <PageHead title={t('auth.welcome')} sub={t('ui.login.lead', 'No password needed. We send a one-time code to your phone.')} />

        {step === 1 && (
          <form onSubmit={sendOtp} className="flex flex-col gap-4" data-testid="login-step-1">
            <div className="ag-pick" role="radiogroup" aria-label={t('ui.login.who', 'How will you use aangan?')}>
              <Option role="radio" aria-checked={role === 'tourist'} on={role === 'tourist'} onClick={() => setRole('tourist')} data-testid="role-tourist"
                icon={<Icon name="person" />} title={t('auth.role_tourist')} sub={t('auth.role_tourist_desc')} />
              <Option role="radio" aria-checked={role === 'provider'} on={role === 'provider'} onClick={() => setRole('provider')} data-testid="role-provider"
                icon={<Icon name="bag" />} title={t('auth.role_provider')} sub={t('auth.role_provider_desc')} />
            </div>

            {/* One field, one name: "Phone number" everywhere; the hint says the code goes on
                WhatsApp first and falls back to SMS (QA 3.2). */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-end gap-2">
                {/* Only "IN +91" shows in the box; the open list names each country. */}
                <SelectField label={t('auth.phone_label')} value={countryCode} onChange={(e) => { setCountryCode(e.target.value); setPhone(''); }}
                  aria-label={t('ui.login.country_code')} data-testid="login-country" className="w-[124px] flex-none">
                  {OTP_COUNTRIES.map((item) => <option key={item.code} value={item.code} label={`${item.iso} ${item.code}`}>{item.iso} {item.code}</option>)}
                </SelectField>
                <TextField value={phone} onChange={(e) => setPhone(nationalPhone(e.target.value, country))} required
                  type="tel" inputMode="tel" autoComplete="tel" aria-label={t('auth.phone_label')}
                  aria-describedby="login-phone-hint" className="flex-1 min-w-0"
                  data-testid="login-phone" placeholder={'0'.repeat(country.nationalDigits)} />
              </div>
              <p id="login-phone-hint" data-testid="login-phone-hint" className="ag-small !text-xs !leading-4">{t('auth.phone_hint')}</p>
            </div>

            <Button type="submit" className="self-start" icon={<Icon name="wa" />} disabled={busy || !canonicalPhone} data-testid="login-send-otp">
              {busy ? t('common.loading') : t('auth.send_otp')}
            </Button>

            {GOOGLE_CLIENT_ID && (
              <>
                <div className="flex items-center gap-3" aria-hidden="true">
                  <span className="flex-1 h-px bg-[var(--hairline)]" />
                  <span className="ag-small">{t('ui.login.or')}</span>
                  <span className="flex-1 h-px bg-[var(--hairline)]" />
                </div>
                <Button className="self-start" disabled={googleBusy || busy} onClick={googleSignIn} data-testid="login-google"
                  icon={googleBusy ? undefined : <Icon name="google" />}>
                  {googleBusy ? t('common.loading') : t('auth.google_login')}
                </Button>
              </>
            )}
          </form>
        )}

        {step === 2 && (
          <form onSubmit={verify} className="flex flex-col gap-4" data-testid="login-step-2">
            {/* Names the app the code was actually sent through. */}
            {sentChannel && (
              <p data-testid="login-sent-via" className="ag-small">
                {t(sentChannel === 'whatsapp' ? 'auth.sent_whatsapp' : 'auth.sent_sms', { phone: canonicalPhone })}
              </p>
            )}
            {mockOtp && (
              <Box flat className="!gap-1">
                <p className="text-sm text-[var(--ink-strong)]"><b className="font-medium">{t('auth.mock_otp')}</b> <span className="tabular-nums">{mockOtp}</span></p>
                <p className="ag-small">{t('auth.mock_note')}</p>
              </Box>
            )}
            <TextField label={t('auth.otp_label')} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required maxLength={6}
              inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" title={t('auth.otp_six_digits')}
              data-testid="login-otp" placeholder="123456" className="[&_input]:tracking-[0.3em] [&_input]:tabular-nums [&_input]:text-lg" />
            {!userExists && (
              <TextField label={t('auth.name')} value={name} onChange={(e) => setName(e.target.value)} required={!userExists}
                data-testid="login-name" placeholder={t('auth.name_placeholder')} autoComplete="name" />
            )}
            {!userExists && role !== 'provider' && (
              <TextField label={t('auth.referral_label')} value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase().slice(0, 12))}
                data-testid="login-referral" placeholder="ANG26-XXXXXX" autoCapitalize="characters" autoComplete="off" className="[&_input]:tracking-wider" />
            )}

            <Button type="submit" go className="self-start" disabled={busy} data-testid="login-verify">
              {busy ? t('common.loading') : t('auth.verify')}
            </Button>
            <p className="ag-small text-center" data-testid="login-resend">
              {t('auth.resend_prompt')}{' '}
              {resendIn > 0 ? (
                <span className="tabular-nums">{t('auth.resend_in', { seconds: resendIn })}</span>
              ) : (
                <Button variant="text" onClick={requestCode} disabled={busy} className="!inline-flex !p-0 align-baseline">{t('auth.resend')}</Button>
              )}
            </p>
            <Button variant="text" onClick={() => setStep(1)} className="self-center">{t('auth.change_number')}</Button>
          </form>
        )}

        {err && <p data-testid="login-error" role="alert" className="ag-err !text-sm text-center">{err}</p>}

        <p className="ag-small !text-xs !leading-4 text-center">
          {t('auth.terms_prefix')} <Link to="/terms" className="underline">{t('auth.terms_conditions_link')}</Link> {t('auth.terms_and')} <Link to="/privacy" className="underline">{t('auth.terms_link')}</Link>{t('auth.terms_suffix')}
        </p>
      </div>
    </div>
  );
}
