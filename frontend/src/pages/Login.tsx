import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Phone, KeyRound } from 'lucide-react';
import Logo from '@/components/Logo';
import Seo from '@/components/Seo';

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

  const sendOtp = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/auth/otp/send', { phone, channel: 'whatsapp' });
      setMockOtp(data.mock_otp);
      setSentChannel(data.channel || '');
      setUserExists(!!data.exists);
      setStep(2);
    } catch (e) { setErr(e?.response?.data?.detail || t('auth.send_failed')); }
    finally { setBusy(false); }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/auth/otp/verify', { phone, otp, name, role });
      if (role === 'tourist' && data.user.role === 'provider') {
        setVerificationData(data);
        setShowConfirmSwitch(true);
      } else {
        login(data.token, data.user);
        if (data.user.role === 'provider') {
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
    <div className="mx-auto max-w-md px-4 md:px-8 py-8 md:py-14">
      <Seo title={t('auth.welcome')} noindex />
      <div className="mist-panel p-6 md:p-8">
        <div className="text-center mb-6">
          <Logo className="mx-auto w-16 h-16" />
          <div className="mt-2 font-display font-extrabold text-lg text-ink">{t('brand')}</div>
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
            <div className="grid grid-cols-2 gap-2 p-1 rounded-full bg-mist">
              <button type="button" onClick={() => setRole('tourist')} data-testid="role-tourist"
                className={`py-2 rounded-full text-sm font-bold ${role === 'tourist' ? 'bg-white text-pine shadow-sm' : 'text-ink-soft'}`}>
                {t('auth.role_tourist')}
              </button>
              <button type="button" onClick={() => setRole('provider')} data-testid="role-provider"
                className={`py-2 rounded-full text-sm font-bold ${role === 'provider' ? 'bg-white text-pine shadow-sm' : 'text-ink-soft'}`}>
                {t('auth.role_provider')}
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
  );
}
