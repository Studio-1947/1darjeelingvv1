import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { CheckCircle2, Clock } from 'lucide-react';

export default function ProviderDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { nav('/login?next=/provider/dashboard'); return; }
    api.get('/providers/me').then((r) => setProvider(r.data.provider)).finally(() => setLoading(false));
  }, [user, nav]);

  if (loading) return <div className="p-10 text-center text-ink-soft">{t('common.loading')}</div>;

  if (!provider) {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center">
        <h1 className="font-display font-extrabold text-3xl text-ink">No business yet</h1>
        <p className="text-ink-soft mt-2">Onboard your business to start receiving bookings.</p>
        <button onClick={() => nav('/provider/onboard')} className="mt-6 px-6 py-3 rounded-full bg-pine text-white font-bold btn-hover">
          {t('provider.onboard_title')}
        </button>
      </div>
    );
  }

  const active = provider.status === 'active';
  return (
    <div className="mx-auto max-w-5xl px-5 md:px-8 py-10">
      <h1 className="font-display font-extrabold text-4xl text-ink">{t('provider.dashboard_title')}</h1>
      <div className="mt-8 grid md:grid-cols-3 gap-6">
        <div className="mist-panel p-6">
          <div className="text-xs uppercase tracking-widest text-ink-soft">Status</div>
          <div className={`mt-2 flex items-center gap-2 font-display font-extrabold text-2xl ${active ? 'text-pine' : 'text-flag'}`} data-testid="provider-status">
            {active ? <CheckCircle2 size={22} /> : <Clock size={22} />}
            {active ? t('provider.active') : t('provider.pending')}
          </div>
        </div>
        <div className="mist-panel p-6">
          <div className="text-xs uppercase tracking-widest text-ink-soft">Business</div>
          <div className="mt-2 font-display font-extrabold text-xl text-ink">{provider.business_name}</div>
          <div className="text-sm text-ink-soft capitalize">{provider.business_type} · {provider.location}</div>
        </div>
        <div className="mist-panel p-6">
          <div className="text-xs uppercase tracking-widest text-ink-soft">Contact</div>
          <div className="mt-2 font-display font-extrabold text-xl text-ink">{provider.contact_phone}</div>
        </div>
      </div>
      <div className="mt-8 mist-panel p-6">
        <h3 className="font-display font-bold text-lg">Description</h3>
        <p className="text-ink-soft mt-2 leading-relaxed">{provider.description}</p>
      </div>
    </div>
  );
}
