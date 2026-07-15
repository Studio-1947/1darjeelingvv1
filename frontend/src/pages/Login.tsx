import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Phone, KeyRound } from 'lucide-react';

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get('next') || '/';

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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [userExists, setUserExists] = useState(false);
  const [showConfirmSwitch, setShowConfirmSwitch] = useState(false);
  const [verificationData, setVerificationData] = useState<any>(null);

  const sendOtp = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const { data } = await api.post('/auth/otp/send', { phone, channel: 'whatsapp' });
      setMockOtp(data.mock_otp);
      setUserExists(!!data.exists);
      setStep(2);
    } catch (e) { setErr(e?.response?.data?.detail || 'Failed to send OTP'); }
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
    } catch (e) { setErr(e?.response?.data?.detail || 'Invalid OTP'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-md px-4 md:px-8 py-8 md:py-14">
      <div className="mist-panel p-6 md:p-8">
        <div className="text-center mb-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-pine text-white grid place-items-center font-display font-extrabold text-2xl">১</div>
          <h1 className="mt-4 font-display font-extrabold text-3xl text-ink">{t('auth.welcome')}</h1>
          <p className="text-sm text-ink-soft mt-1">{t('brand_tagline')}</p>
        </div>

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

            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">{t('auth.phone_label')}</span>
              <div className="mt-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--line)] bg-white">
                <Phone size={16} className="text-ink-soft" />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} required
                  data-testid="login-phone" placeholder={t('auth.phone_placeholder')}
                  className="flex-1 bg-transparent outline-none py-1" />
              </div>
            </label>

            <button disabled={busy} data-testid="login-send-otp"
              className="w-full py-3 rounded-full bg-pine text-white font-bold btn-hover disabled:opacity-60">
              {busy ? t('common.loading') : t('auth.send_otp')}
            </button>
          </form>
        )}

        {step === 2 && !showConfirmSwitch && (
          <form onSubmit={verify} className="space-y-4" data-testid="login-step-2">
            {mockOtp && (
              <div className="rounded-xl bg-gold/20 border border-gold/40 px-4 py-3 text-sm text-ink">
                <span className="font-bold">Mock OTP:</span> {mockOtp}
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
                <span className="text-xs font-semibold text-ink-soft">Name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required={!userExists}
                  data-testid="login-name" placeholder="Your name"
                  className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none" />
              </label>
            )}

            <button disabled={busy} data-testid="login-verify"
              className="w-full py-3 rounded-full bg-pine text-white font-bold btn-hover disabled:opacity-60">
              {busy ? t('common.loading') : t('auth.verify')}
            </button>
            <button type="button" onClick={() => setStep(1)} className="w-full text-xs text-ink-soft">← change number</button>
          </form>
        )}

        {showConfirmSwitch && verificationData && (
          <div className="space-y-6" data-testid="login-confirm-switch">
            <p className="text-sm text-ink-soft">
              You already have a registered **service provider** profile with this WhatsApp number.
            </p>
            <p className="text-sm text-ink font-semibold">
              Which dashboard would you like to open?
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
                Go to Traveler Dashboard
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
                Go to Business Dashboard
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
              Cancel and change number
            </button>
          </div>
        )}

        {err && <p data-testid="login-error" className="mt-4 text-sm text-flag font-semibold text-center">{err}</p>}

        <p className="mt-6 text-xs text-center text-ink-soft">
          By continuing you agree to our <Link to="/privacy" className="underline">privacy policy</Link>.
        </p>
      </div>
    </div>
  );
}
