import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Icon } from '@/components/ag/Icon';
import { Box, Button, PageHead, SelectField, Status, TextField } from '@/components/ag';
import Seo from '@/components/Seo';
import ConsentCheck, { clearLoginPrefill, readLoginPrefill } from '@/components/ConsentCheck';
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

  // Sign-in: 1 = the phone number, 2 = the code only, 3 = a new account's name and referral code,
  // shown only once the code has been accepted (the server answers `name_required` for a right code
  // on a new number without using the code up; step 3 sends the same code again with the details).
  const [step, setStep] = useState(1);
  // The host wizard hands over the WhatsApp number it asked for (and whether I Agree was ticked
  // there), so the host does not type it twice. It is an ordinary field here: they can change it.
  const [prefill] = useState(readLoginPrefill);
  const [phone, setPhone] = useState(() => prefill.phone || '');
  const [countryCode, setCountryCode] = useState('+91');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  // A friend's invite code, as the app asks for it. An invite link (/login?ref=CODE) fills it in.
  const [referral, setReferral] = useState(() => {
    try { return (new URLSearchParams(window.location.search).get('ref') || '').toUpperCase().slice(0, 20); } catch { return ''; }
  });
  // No Traveller / Host question here (prototype: one sign-in, the rest is asked later). Arriving from
  // List your business (next=/provider/...) or with ?role=provider signs in on the business side.
  const [role] = useState(() => {
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
  // The "I Agree" box on the first screen (Terms, Privacy Policy, 18 or older). Nothing goes out,
  // no code and no Google prompt, until it is ticked. It is sent with the code so the server keeps
  // the date they agreed (users.terms_accepted_at).
  const [agreed, setAgreed] = useState(() => !!prefill.agreed);
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
    clearLoginPrefill();
    login(data.token, data.user, role);
    // Straight back to where they were, as the prototype does (back()). A host goes on with what they
    // came for (List your business opens onboarding), or to the dashboard. Profile details are asked
    // later, from Account -> Profile, not on a setup screen right after sign-in.
    if (role === 'provider') nav(next.startsWith('/provider') ? next : '/provider/dashboard');
    else nav(next);
  }, [login, nav, next, role]);

  // Initialize Google Identity Services once and prompt the One Tap UI.
  const handleGoogleSignIn = useCallback(async (idToken: string) => {
    try {
      const { data } = await api.post('/auth/google', { idToken, role, consent: true });
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
    if (!agreed) { setErr(t('ui.login.agree_needed', 'Please tick I Agree to continue.')); return; }
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/auth/otp/send', { phone: canonicalPhone, channel: 'whatsapp' });
      setMockOtp(data.mock_otp);
      setSentChannel(data.channel || '');
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

  // Step 2: the code alone. An existing account signs in here; a new number with the right code
  // moves on to step 3. A wrong code stays on this screen.
  const verify = async (e) => {
    e.preventDefault();
    if (!canonicalPhone) return;
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/auth/otp/verify', { phone: canonicalPhone, otp, role, consent: agreed });
      finishSignIn(data);
    } catch (e) {
      // `code` is new; the detail check covers a backend deployed before it (same answer, older shape).
      const body = e?.response?.data;
      if (body?.code === 'name_required' || body?.detail === 'Name is required for registration') { setStep(3); return; }
      setErr(e?.response?.data?.detail || t('auth.invalid_otp'));
    } finally { setBusy(false); }
  };

  // Step 3: the new account's name and an optional referral code, sent with the code already accepted.
  const createAccount = async (e) => {
    e.preventDefault();
    if (!canonicalPhone) return;
    if (!name.trim()) { setErr(t('ui.login.badname', 'Please write your name.')); return; }
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/auth/otp/verify', {
        phone: canonicalPhone, otp, name, role, consent: agreed,
        // Hosts too: a code from a host link or a field team member (admin → Referrals) is counted for them.
        ...(referral.trim() ? { referral_code: referral.trim() } : {}),
      });
      finishSignIn(data);
    } catch (e) {
      // The code ran out while the name was being typed (10 minutes): say so; "Send a new code" is below.
      setErr(e?.response?.data?.detail || t('auth.invalid_otp'));
    } finally { setBusy(false); }
  };

  const googleSignIn = async () => {
    if (!agreed) { setErr(t('ui.login.agree_needed', 'Please tick I Agree to continue.')); return; }
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
      <Seo title={t('ui.login.phoneq', 'Your phone number')} noindex />
      <div className="ag-main ag-account-login">
        {step === 1 && (
          <form onSubmit={sendOtp} className="flex flex-col gap-4" data-testid="login-step-1">
            <PageHead title={t('ui.login.phoneq', 'Your phone number')} sub={t('ui.login.lead', 'No password needed. We send a one-time code to your phone.')} />
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
            {/* Consent, asked for plainly rather than assumed from "by continuing". Required:
                Continue (and Google) stay off until it is ticked. */}
            <ConsentCheck checked={agreed} onChange={(on) => { setAgreed(on); if (on) setErr(''); }} />
            <Button type="submit" variant="primary" go className="self-start" disabled={busy || !canonicalPhone || !agreed} data-testid="login-send-otp">
              {busy ? t('common.loading') : t('common.continue', 'Continue')}
            </Button>
            {GOOGLE_CLIENT_ID && (
              <Button className="self-start" icon={googleBusy ? undefined : <Icon name="google" />} disabled={googleBusy || busy || !agreed}
                onClick={googleSignIn} data-testid="login-google">
                {googleBusy ? t('common.loading') : t('ui.login.gg', 'Continue with Google')}
              </Button>
            )}
          </form>
        )}

        {step === 2 && (
          <form onSubmit={verify} className="flex flex-col gap-4" data-testid="login-step-2">
            <PageHead title={t('ui.login.codeq', 'Enter the code')} />
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
            {/* Up to 16 digits, not 6: the payment/store reviewer signs in with a fixed REVIEW_OTP,
                which config.ts requires to be 10+ characters. Real OTPs are still 6 digits. */}
            <TextField label={t('auth.otp_label')} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 16))} required maxLength={16}
              inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,16}" title={t('auth.otp_six_digits')}
              // Six empty slots, not "123456": a sample number read as a code already typed in.
              data-testid="login-otp" placeholder="––––––" className="[&_input]:tracking-[0.3em] [&_input]:tabular-nums [&_input]:text-lg" />
            <Button type="submit" go className="self-start" disabled={busy || otp.length < 6} data-testid="login-verify">
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

        {step === 3 && (
          <form onSubmit={createAccount} className="flex flex-col gap-4" data-testid="login-step-3">
            <PageHead title={t('ui.login.details_h', 'One last step')} sub={t('ui.login.details_s', 'This is a new account. Tell us your name to finish.')} />
            <Status tone="ok" className="self-start" data-testid="login-verified"><Icon name="check" /> {t('ui.login.verified', 'Number verified')} · {canonicalPhone}</Status>
            <TextField label={t('ui.login.nameq', 'What should we call you?')} value={name} onChange={(e) => setName(e.target.value)}
              autoComplete="name" required maxLength={80} autoFocus data-testid="login-name" />
            <TextField label={t('auth.referral_label')} value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase().slice(0, 20))}
              data-testid="login-referral" placeholder="ANG26-XXXXXX" autoCapitalize="characters" autoComplete="off" className="[&_input]:tracking-wider" />
            <Button type="submit" variant="primary" go className="self-start" disabled={busy || !name.trim()} data-testid="login-create">
              {busy ? t('common.loading') : t('common.continue', 'Continue')}
            </Button>
            {err && (
              <Button variant="text" onClick={requestCode} disabled={busy} className="self-center" data-testid="login-new-code">{t('ui.login.new_code', 'Send a new code')}</Button>
            )}
          </form>
        )}

        {err && <p data-testid="login-error" role="alert" className="ag-err !text-sm">{err}</p>}
      </div>
    </div>
  );
}
