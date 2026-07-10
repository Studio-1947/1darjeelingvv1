import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { payWithRazorpay } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const TYPES = ['homestay', 'driver', 'shop', 'cafe'];

export default function ProviderOnboard() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({
    business_name: '', business_type: 'homestay', description: '',
    location: '', contact_phone: '', price_from: '', image_url: '',
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!user) nav('/login?next=/provider/onboard');
  }, [user, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const { data } = await api.post('/providers/onboard', {
        business_name: form.business_name,
        business_type: form.business_type,
        description: form.description,
        location: form.location,
        contact_phone: form.contact_phone,
        price_from: Number(form.price_from) || 0,
        images: form.image_url ? [form.image_url] : [],
      });
      await payWithRazorpay({
        flow: 'provider_registration',
        reference_id: data.provider.id,
        description: '₹99 one-time provider registration',
        prefill: { contact: user.phone, name: user.name },
      });
      await refresh();
      setMsg('Success! Your business is now listed.');
      setTimeout(() => nav('/provider/dashboard'), 1200);
    } catch (e) {
      setMsg(e?.response?.data?.detail || e.message || 'Failed');
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-3xl px-5 md:px-8 py-10">
      <div className="text-center mb-8">
        <span className="chip">₹99 · one-time</span>
        <h1 className="mt-3 font-display font-extrabold text-4xl md:text-5xl text-ink">{t('provider.onboard_title')}</h1>
        <p className="mt-2 text-ink-soft">{t('provider.onboard_sub')}</p>
      </div>

      <form onSubmit={submit} className="mist-panel p-6 md:p-8 space-y-4" data-testid="provider-onboard-form">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">{t('provider.business_name')}</span>
            <input required value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })}
              data-testid="provider-name" className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">{t('provider.business_type')}</span>
            <select value={form.business_type} onChange={(e) => setForm({ ...form, business_type: e.target.value })}
              data-testid="provider-type" className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none">
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-semibold text-ink-soft">{t('provider.description')}</span>
          <textarea required rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            data-testid="provider-description" className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-white outline-none" />
        </label>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">{t('provider.location')}</span>
            <input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
              data-testid="provider-location" className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">{t('provider.contact')}</span>
            <input required value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              data-testid="provider-contact" className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none" />
          </label>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">{t('provider.price_from')}</span>
            <input type="number" min="0" value={form.price_from} onChange={(e) => setForm({ ...form, price_from: e.target.value })}
              data-testid="provider-price" className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">{t('provider.image_url')}</span>
            <input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              data-testid="provider-image" placeholder="https://..." className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none" />
          </label>
        </div>

        <button disabled={busy} data-testid="provider-submit"
          className="w-full py-3 rounded-full bg-flag text-white font-bold btn-hover disabled:opacity-60">
          {busy ? t('common.loading') : t('provider.submit_pay')}
        </button>
        {msg && <p data-testid="provider-msg" className="text-sm text-center text-pine font-semibold">{msg}</p>}
      </form>
    </div>
  );
}
