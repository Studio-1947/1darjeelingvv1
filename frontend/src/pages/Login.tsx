import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Phone, Key as KeyRound, Compass, Storefront, Check } from '@phosphor-icons/react';
import Wordmark from '@/components/Wordmark';
import Seo from '@/components/Seo';
import { MobileScreen, PrimaryButton as MobilePrimaryButton, Touch, Slab } from '@/components/mobile';

// Google Identity Services client ID from env
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function Login() {
  const { t } = useTranslation();
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get('next') || '/';

  useEffect(() => {
    if (user) {
      if (user.role === 'provider') {
        if (user.providerPaid) {
          nav('/provider/dashboard');
        } else {
          nav('/provider/onboard');
        }
      } else {
        nav(next);
      }
    }
  }, [user, nav, next]);

  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  // Mobile-only fields/state (the desktop tree never sets these, so they're
  // harmless there): the invite-code field RN has that this app's desktop
  // Login never exposed, and the language/phone/otp step RN's onboarding
  // sequence triggers when reaching /login on mobile - see the Phase 4 plan.
  const [invite, setInvite] = useState('');
  const [mobileStep, setMobileStep] = useState<'language' | 'phone' | 'otp'>('language');
  const otpRef = useRef<HTMLInputElement>(null);
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
  const [showConfirmSwitch, setShowConfirmSwitch] = useState(false);
  const [verificationData, setVerificationData] = useState<any>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const gisLoaded = useRef(false);

  // Initialize Google Identity Services once and prompt the One Tap UI.
  const handleGoogleSignIn = useCallback(async (idToken: string) => {
    try {
      const { data } = await api.post('/auth/google', { idToken, role });
      login(data.token, data.user);
      if (data.user.role === 'provider') {
        nav(data.user.providerPaid ? '/provider/dashboard' : '/provider/onboard');
      } else {
        nav(next);
      }
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Google sign-in failed');
    } finally {
      setGoogleBusy(false);
    }
  }, [login, nav, next, role]);

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

  // `e` is optional: the desktop tree calls these from a <form onSubmit>
  // (a real event), the mobile tree's buttons are plain onClick (no event) -
  // see mobile/ui.tsx's Touch, which is always type="button".
  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/auth/otp/send', { phone, channel: 'whatsapp' });
      setMockOtp(data.mock_otp);
      setSentChannel(data.channel || '');
      setUserExists(!!data.exists);
      setStep(2);
      setMobileStep('otp');
    } catch (e) { setErr(e?.response?.data?.detail || t('auth.send_failed')); }
    finally { setBusy(false); }
  };

  const verify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/auth/otp/verify', {
        phone, otp, name, role,
        ...(invite.trim() ? { referral_code: invite.trim() } : {}),
      });
      if (role === 'tourist' && data.user.role === 'provider') {
        setVerificationData(data);
        setShowConfirmSwitch(true);
      } else {
        login(data.token, data.user);
        if (role === 'provider' || data.user.role === 'provider') {
          if (data.user.providerPaid) {
            nav('/provider/dashboard');
          } else {
            nav('/provider/onboard');
          }
        } else {
          nav(next);
        }
      }
    } catch (e) { setErr(e?.response?.data?.detail || t('auth.invalid_otp')); }
    finally { setBusy(false); }
  };

  return (
    <>
    <Seo title={t('auth.welcome')} noindex />

    {/* ============================================================= */}
    {/* DESKTOP & TABLET LOGIN (lg+) - unchanged                       */}
    {/* ============================================================= */}
    <div className="hidden lg:block mx-auto max-w-md px-4 md:px-8 py-8 md:py-14">
      <div className="mist-panel p-6 md:p-8">
        <div className="text-center mb-6">
          <Wordmark className="mx-auto h-10 w-auto text-ink" />
          <h1 className="mt-4 font-display font-extrabold text-3xl text-ink">{t('auth.welcome')}</h1>
          <p className="text-sm text-ink-soft mt-1">{t('brand_tagline')}</p>
        </div>

        {/* Google Sign-In Button */}
        {GOOGLE_CLIENT_ID && step === 1 && !showConfirmSwitch && (
          <div className="space-y-4 mb-4">
            <button
              disabled={googleBusy || busy}
              onClick={async () => {
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
                    setErr('Google Sign-In could not load. Please try again.');
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
                  setErr(e?.message || 'Google sign-in failed');
                  setGoogleBusy(false);
                }
              }}
              className="w-full py-3 rounded-full border border-[var(--line)] bg-white text-ink font-bold btn-hover disabled:opacity-60 flex items-center justify-center gap-2"
              data-testid="login-google"
            >
              {googleBusy ? t('common.loading') : (
                <>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                    <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-[var(--line)]" />
              <span className="text-xs text-ink-soft">OR</span>
              <div className="flex-1 h-px bg-[var(--line)]" />
            </div>
          </div>
        )}

        {step === 1 && !showConfirmSwitch && (
          <form onSubmit={sendOtp} className="space-y-4" data-testid="login-step-1">
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setRole('tourist')} data-testid="role-tourist"
                className={`text-left p-3 rounded-2xl border transition-colors ${role === 'tourist' ? 'border-pine bg-pine/5 shadow-sm' : 'border-[var(--line)] bg-white hover:border-pine/40'}`}>
                <Compass size={22} weight={role === 'tourist' ? 'fill' : 'regular'} className={role === 'tourist' ? 'text-pine' : 'text-ink-soft'} />
                <div className={`mt-2 text-sm font-bold ${role === 'tourist' ? 'text-pine' : 'text-ink'}`}>{t('auth.role_tourist')}</div>
                <div className="mt-0.5 text-xs text-ink-soft leading-snug">{t('auth.role_tourist_desc')}</div>
              </button>
              <button type="button" onClick={() => setRole('provider')} data-testid="role-provider"
                className={`text-left p-3 rounded-2xl border transition-colors ${role === 'provider' ? 'border-pine bg-pine/5 shadow-sm' : 'border-[var(--line)] bg-white hover:border-pine/40'}`}>
                <Storefront size={22} weight={role === 'provider' ? 'fill' : 'regular'} className={role === 'provider' ? 'text-pine' : 'text-ink-soft'} />
                <div className={`mt-2 text-sm font-bold ${role === 'provider' ? 'text-pine' : 'text-ink'}`}>{t('auth.role_provider')}</div>
                <div className="mt-0.5 text-xs text-ink-soft leading-snug">{t('auth.role_provider_desc')}</div>
              </button>
            </div>

            {/* One field, one name. English called this "Phone number" while
                Hindi, Nepali and Bengali all called it "WhatsApp number", so the
                same form told different visitors different things about where
                their code would arrive (QA 3.2). The label is the neutral, true
                one everywhere; the hint below says how delivery actually works,
                which is what the discrepancy was really trying to convey - the
                server tries WhatsApp first and falls back to SMS. */}
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">{t('auth.phone_label')}</span>
              <div className="mt-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--line)] bg-white">
                <Phone size={16} className="text-ink-soft" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} required
                  type="tel" inputMode="tel" autoComplete="tel"
                  aria-describedby="login-phone-hint"
                  data-testid="login-phone" placeholder={t('auth.phone_placeholder')}
                  className="flex-1 bg-transparent outline-none py-1" />
              </div>
              <span id="login-phone-hint" data-testid="login-phone-hint" className="mt-1.5 block text-xs text-ink-soft">
                {t('auth.phone_hint')}
              </span>
            </label>

            <button disabled={busy} data-testid="login-send-otp"
              className="w-full py-3 rounded-full bg-pine text-white font-bold btn-hover disabled:opacity-60">
              {busy ? t('common.loading') : t('auth.send_otp')}
            </button>
          </form>
        )}

        {step === 2 && !showConfirmSwitch && (
          <form onSubmit={verify} className="space-y-4" data-testid="login-step-2">
            {/* Names the app the code was actually sent through, rather than
                leaving the visitor to check both. */}
            {sentChannel && (
              <p data-testid="login-sent-via" className="text-sm text-ink-soft">
                {t(sentChannel === 'whatsapp' ? 'auth.sent_whatsapp' : 'auth.sent_sms', { phone })}
              </p>
            )}
            {mockOtp && (
              <div className="rounded-xl bg-gold/20 border border-gold/40 px-4 py-3 text-sm text-ink">
                <span className="font-bold">{t('auth.mock_otp')}</span> {mockOtp}
                <div className="text-xs text-ink-soft mt-1">{t('auth.mock_note')}</div>
              </div>
            )}
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">{t('auth.otp_label')}</span>
              <div className="mt-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--line)] bg-white">
                <KeyRound size={16} className="text-ink-soft" />
                <input value={otp} onChange={(e) => setOtp(e.target.value)} required maxLength={6}
                  data-testid="login-otp" placeholder="123456"
                  className="flex-1 bg-transparent outline-none py-1 tracking-widest font-mono text-lg" />
              </div>
            </label>
            {!userExists && (
              <label className="block">
                <span className="text-xs font-semibold text-ink-soft">{t('auth.name')}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required={!userExists}
                  data-testid="login-name" placeholder={t('auth.name_placeholder')}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none" />
              </label>
            )}

            <button disabled={busy} data-testid="login-verify"
              className="w-full py-3 rounded-full bg-pine text-white font-bold btn-hover disabled:opacity-60">
              {busy ? t('common.loading') : t('auth.verify')}
            </button>
            <button type="button" onClick={() => setStep(1)} className="w-full text-xs text-ink-soft">← {t('auth.change_number')}</button>
          </form>
        )}

        {showConfirmSwitch && verificationData && (
          <div className="space-y-6" data-testid="login-confirm-switch">
            <p className="text-sm text-ink-soft">
              {t('auth.provider_exists')}
            </p>
            <p className="text-sm text-ink font-semibold">
              {t('auth.which_dashboard')}
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem(`unlocked_traveller_${verificationData.user.id}`, 'true');
                  login(verificationData.token, verificationData.user);
                  nav('/dashboard');
                }}
                className="w-full py-3 rounded-full border border-pine text-pine font-bold hover:bg-pine/5 transition-colors"
                data-testid="choose-traveller"
              >
                {t('auth.go_traveller')}
              </button>
              <button
                type="button"
                onClick={() => {
                  login(verificationData.token, verificationData.user);
                  if (verificationData.user.providerPaid) {
                    nav('/provider/dashboard');
                  } else {
                    nav('/provider/onboard');
                  }
                }}
                className="w-full py-3 rounded-full bg-pine text-white font-bold btn-hover"
                data-testid="choose-provider"
              >
                {t('auth.go_business')}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowConfirmSwitch(false);
                setVerificationData(null);
                setStep(1);
              }}
              className="w-full text-xs text-ink-soft mt-4 text-center"
            >
              {t('auth.cancel_change_number')}
            </button>
          </div>
        )}

        {err && <p data-testid="login-error" className="mt-4 text-sm text-flag font-semibold text-center">{err}</p>}

        <p className="mt-6 text-xs text-center text-ink-soft">
          {t('auth.terms_prefix')} <Link to="/privacy" className="underline">{t('auth.terms_link')}</Link>{t('auth.terms_suffix')}
        </p>
      </div>
    </div>

    {/* ============================================================= */}
    {/* MOBILE LOGIN (< lg) - matches RN's language.tsx -> login.tsx    */}
    {/* sequence, triggered by reaching /login (no mandatory app-launch */}
    {/* gate - see the Phase 4 plan). Reuses all existing state/handlers.*/}
    {/* ============================================================= */}
    {!showConfirmSwitch && mobileStep === 'language' && (
      <MobileScreen tone="green" className="block lg:hidden min-h-screen flex flex-col pb-[calc(var(--bottom-nav-h)+1rem)]">
        <div className="flex-1 px-7 pt-9">
          <span className="inline-block px-3 py-1 rounded-full bg-[var(--mu-cream)] text-[10px] font-bold tracking-wider text-[var(--mu-green-deep)]">
            {t('mobileAuth.lang_greeting')}
          </span>
          <h1 className="mt-4 font-[family-name:var(--mu-font-display)] font-black text-[32px] leading-[1.05] text-[var(--mu-cream)] tracking-tight">
            {t('mobileAuth.lang_title')}
          </h1>
          <p className="mt-2.5 text-[13px] text-[var(--mu-text-on-dark-muted)]">{t('mobileAuth.lang_subtitle')}</p>

          <div className="mt-6 flex items-center gap-3 rounded-[var(--mu-r-card-sm)] bg-[var(--mu-cream)] px-[18px] py-3.5">
            <div className="flex-1">
              <div className="text-[16px] font-semibold text-[var(--mu-ink)]">{t('mobileAuth.lang_option')}</div>
              <div className="mt-0.5 text-xs text-[var(--mu-text-muted)]">{t('mobileAuth.lang_option_sub')}</div>
            </div>
            <div className="w-[22px] h-[22px] rounded-full bg-[var(--mu-green)] flex items-center justify-center flex-shrink-0">
              <Check size={12} weight="bold" className="text-[var(--mu-cream)]" />
            </div>
          </div>
        </div>
        <div className="px-7 pb-9 pt-2">
          <MobilePrimaryButton onClick={() => setMobileStep('phone')} className="w-full !bg-[var(--mu-lime)] !text-[var(--mu-lime-ink)]">
            {t('mobileAuth.continue')} →
          </MobilePrimaryButton>
        </div>
      </MobileScreen>
    )}

    {!showConfirmSwitch && mobileStep !== 'language' && (
      <MobileScreen tone="light" className="block lg:hidden min-h-screen flex flex-col pb-[calc(var(--bottom-nav-h)+1rem)]">
        <div className="flex-1 px-6 pt-8">
          <div className="w-14 h-14 rounded-[var(--mu-r-avatar)] bg-[var(--mu-green)] flex items-center justify-center -rotate-[4deg]">
            <Wordmark className="h-6 w-auto text-[var(--mu-cream)]" />
          </div>
          <h1 className="mt-4 font-[family-name:var(--mu-font-display)] font-black text-[28px] text-[var(--mu-ink)] tracking-tight">
            {t('mobileAuth.login_title')}
          </h1>
          <p className="mt-2 text-[13px] text-[var(--mu-text-muted)]">
            {mobileStep === 'phone' ? t('mobileAuth.login_subtitle') : t('auth.sent_whatsapp', { phone })}
          </p>

          {mobileStep === 'phone' && (
            <div className="mt-5 space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <Touch
                  onClick={() => setRole('tourist')}
                  className={`text-left p-3 rounded-[var(--mu-r-card-xs)] border ${role === 'tourist' ? 'border-[var(--mu-green)] bg-[var(--mu-green-tint)]' : 'border-[var(--mu-border)] bg-[var(--mu-surface)]'}`}
                >
                  <Compass size={20} weight={role === 'tourist' ? 'fill' : 'regular'} className={role === 'tourist' ? 'text-[var(--mu-green)]' : 'text-[var(--mu-text-muted)]'} />
                  <div className="mt-1.5 text-sm font-bold text-[var(--mu-ink)]">{t('auth.role_tourist')}</div>
                </Touch>
                <Touch
                  onClick={() => setRole('provider')}
                  className={`text-left p-3 rounded-[var(--mu-r-card-xs)] border ${role === 'provider' ? 'border-[var(--mu-green)] bg-[var(--mu-green-tint)]' : 'border-[var(--mu-border)] bg-[var(--mu-surface)]'}`}
                >
                  <Storefront size={20} weight={role === 'provider' ? 'fill' : 'regular'} className={role === 'provider' ? 'text-[var(--mu-green)]' : 'text-[var(--mu-text-muted)]'} />
                  <div className="mt-1.5 text-sm font-bold text-[var(--mu-ink)]">{t('auth.role_provider')}</div>
                </Touch>
              </div>

              <div className="flex items-center gap-2 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] px-3.5 py-3">
                <Phone size={16} className="text-[var(--mu-text-muted)] flex-shrink-0" />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  type="tel" inputMode="tel" autoComplete="tel"
                  placeholder={t('auth.phone_placeholder')}
                  className="flex-1 min-w-0 bg-transparent outline-none text-[15px] font-semibold text-[var(--mu-ink)]"
                />
              </div>

              {/* RN's invite-code field - a real, working backend feature
                  (referral_code on /auth/otp/verify) the desktop tree never
                  exposed a UI for. */}
              <div className="rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] px-3.5 py-2.5">
                <Slab>{t('mobileAuth.invite_label')}</Slab>
                <input
                  value={invite}
                  onChange={(e) => setInvite(e.target.value.toUpperCase())}
                  maxLength={12}
                  placeholder={t('mobileAuth.invite_placeholder')}
                  className="mt-0.5 w-full bg-transparent outline-none text-sm font-semibold text-[var(--mu-ink)]"
                />
              </div>
            </div>
          )}

          {mobileStep === 'otp' && (
            <div className="mt-5 space-y-4">
              <div>
                <Slab>{t('mobileAuth.otp_label')}</Slab>
                <div className="relative mt-2 flex gap-2" onClick={() => otpRef.current?.focus()}>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-[46px] h-[54px] rounded-[var(--mu-r-card-xs)] border flex items-center justify-center font-[family-name:var(--mu-font-display)] font-black text-lg text-[var(--mu-ink)] bg-[var(--mu-surface)] ${otp[i] ? 'border-2 border-[var(--mu-green)]' : 'border-[var(--mu-border)]'}`}
                    >
                      {otp[i] || ''}
                    </div>
                  ))}
                  <input
                    ref={otpRef}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    maxLength={6}
                    aria-label={t('mobileAuth.otp_label')}
                    className="absolute inset-0 w-full h-full opacity-0"
                  />
                </div>
              </div>

              {mockOtp && (
                <Touch onClick={() => setOtp(mockOtp)} className="text-[11px] font-mono text-[var(--mu-text-faint)]">
                  MOCK MODE · TAP TO FILL {mockOtp}
                </Touch>
              )}

              {!userExists && (
                <label className="block">
                  <Slab>{t('auth.name')}</Slab>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('auth.name_placeholder')}
                    className="mt-1 w-full px-3.5 py-2.5 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] text-sm text-[var(--mu-ink)] outline-none"
                  />
                </label>
              )}

              <div className="flex items-center gap-1.5 text-xs text-[var(--mu-text-muted)]">
                <span>{t('mobileAuth.otp_resend_prompt')}</span>
                <Touch onClick={() => sendOtp()} className="font-bold text-[var(--mu-green)]">
                  {t('mobileAuth.otp_resend')}
                </Touch>
              </div>

              <Touch onClick={() => { setMobileStep('phone'); setOtp(''); setErr(''); }} className="text-xs font-semibold text-[var(--mu-green)]">
                ← {t('mobileAuth.change_number')}
              </Touch>
            </div>
          )}

          {err && <p className="mt-4 text-sm font-semibold text-[var(--mu-danger)]">{err}</p>}
        </div>

        <div className="px-6 pb-8 pt-3">
          <MobilePrimaryButton
            onClick={() => (mobileStep === 'phone' ? sendOtp() : verify())}
            disabled={busy || (mobileStep === 'phone' ? !phone.trim() : otp.length !== 6)}
            className="w-full"
          >
            {busy ? t('common.loading') : mobileStep === 'phone' ? t('auth.send_otp') : t('auth.verify')}
          </MobilePrimaryButton>
          <p className="mt-3 text-[11px] text-center text-[var(--mu-text-faint)]">{t('mobileAuth.legal')}</p>
        </div>
      </MobileScreen>
    )}

    {/* Confirm-switch (mobile) - RN has no equivalent screen; restyled to
        --mu-* tokens for visual consistency only, same business logic. */}
    {showConfirmSwitch && verificationData && (
      <MobileScreen tone="light" className="block lg:hidden min-h-screen flex flex-col justify-center px-6 pb-[calc(var(--bottom-nav-h)+1rem)]">
        <p className="text-sm text-[var(--mu-text-muted)]">{t('auth.provider_exists')}</p>
        <p className="mt-2 text-sm font-semibold text-[var(--mu-ink)]">{t('auth.which_dashboard')}</p>
        <div className="mt-5 space-y-3">
          <Touch
            onClick={() => {
              localStorage.setItem(`unlocked_traveller_${verificationData.user.id}`, 'true');
              login(verificationData.token, verificationData.user);
              nav('/dashboard');
            }}
            className="w-full py-3 rounded-[var(--mu-r-chip)] border border-[var(--mu-green)] text-sm font-bold text-[var(--mu-green)]"
          >
            {t('auth.go_traveller')}
          </Touch>
          <MobilePrimaryButton
            onClick={() => {
              login(verificationData.token, verificationData.user);
              nav(verificationData.user.providerPaid ? '/provider/dashboard' : '/provider/onboard');
            }}
            className="w-full"
          >
            {t('auth.go_business')}
          </MobilePrimaryButton>
        </div>
        <Touch
          onClick={() => {
            setShowConfirmSwitch(false);
            setVerificationData(null);
            setStep(1);
            setMobileStep('phone');
          }}
          className="mt-4 text-xs text-[var(--mu-text-muted)] text-center"
        >
          {t('auth.cancel_change_number')}
        </Touch>
      </MobileScreen>
    )}
    </>
  );
}
