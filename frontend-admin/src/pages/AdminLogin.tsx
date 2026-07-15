import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, KeyRound, Phone } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export default function AdminLogin() {
  const { login } = useAuth();
  const nav = useNavigate();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');

    try {
      const { data } = await api.post('/auth/admin/login', { phone, password });
      login(data.token, data.user);
      nav('/');
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Invalid admin credentials');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 md:px-8 py-16 md:py-24">
      <div className="mist-panel p-6 md:p-8 border-t-4 border-flag shadow-lg">
        <div className="text-center mb-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-flag text-white grid place-items-center font-display font-extrabold text-2xl">
            <ShieldAlert size={28} />
          </div>
          <h1 className="mt-4 font-display font-extrabold text-3xl text-ink">Admin Console</h1>
          <p className="text-xs text-ink-soft mt-1">Sign in with your administrator password credentials</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4" data-testid="admin-login-form">
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Username or Phone</span>
            <div className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white focus-within:ring-2 focus-within:ring-flag/20 transition-all">
              <Phone size={16} className="text-ink-soft" />
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="Username or phone"
                className="flex-1 bg-transparent outline-none py-0.5 text-ink text-sm"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Password</span>
            <div className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white focus-within:ring-2 focus-within:ring-flag/20 transition-all">
              <KeyRound size={16} className="text-ink-soft" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="flex-1 bg-transparent outline-none py-0.5 text-ink text-sm"
              />
            </div>
          </label>

          {err && (
            <div className="p-3 bg-flag/10 border border-flag/20 rounded-xl text-xs text-flag font-semibold text-center" data-testid="admin-login-error">
              {err}
            </div>
          )}

          <button
            disabled={busy}
            type="submit"
            data-testid="admin-login-btn"
            className="w-full mt-2 py-3 rounded-full bg-flag text-white font-bold btn-hover disabled:opacity-60 transition-all shadow-md shadow-flag/10 hover:shadow-lg hover:shadow-flag/25"
          >
            {busy ? 'Loading...' : 'Sign In as Admin'}
          </button>
        </form>
      </div>
    </div>
  );
}
