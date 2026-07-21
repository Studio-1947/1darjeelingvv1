import React from 'react';
import MockPaymentModal from '@/components/MockPaymentModal';
import BookingConfirmation from '@/components/BookingConfirmation';
import LocationPicker from '@/components/LocationPicker';

const TYPES = ['homestay', 'driver', 'shop', 'cafe'];

export default function ProviderOnboard() {
  const { t } = useTranslation();
  const { user, loading: authLoading, refresh } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({
    business_name: '', business_type: 'homestay', description: '',
    location: '', contact_phone: '', price_from: '', image_url: '',
  });
  // Set once the owner interacts with the map; informal addresses often don't
  // geocode, so the pinned coordinates are the authoritative location.
  const [coords, setCoords] = useState<{ lat: number, lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [payModal, setPayModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  // AuthContext starts every page load with user=null while GET /auth/me is in flight, so without
  // the authLoading check this fires on the first render and bounces an already-logged-in provider
  // to /login on any direct load or refresh. Matches the guard in ProviderDashboard.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav('/login'); return; }
  }, [user, authLoading, nav]);

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
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        price_from: Number(form.price_from) || 0,
        images: form.image_url ? [form.image_url] : [],
      });
      const providerId = data.provider.id;
      const orderRes = await createPaymentOrder({ flow: 'provider_registration', reference_id: providerId });
      if (orderRes.mock) {
        setPayModal({
          amount: orderRes.amount,
          order: orderRes.order,
          description: 'one-time registration',
          providerId,
        });
      } else {
        await payWithRazorpay({
          order: orderRes.order,
          key_id: orderRes.key_id,
          flow: 'provider_registration',
          reference_id: providerId,
          description: '₹99 one-time provider registration',
          prefill: { contact: user.phone, name: user.name },
        });
        await refresh();
        nav('/provider/dashboard');
      }
    } catch (e) {
      setMsg(e?.response?.data?.detail || e.message || 'Failed');
    } finally { setBusy(false); }
  };

  const stepScreen =
    o.step === 1 ? <BasicInfoStep o={o} />
    : o.form.business_type === 'driver' ? <DriverForm o={o} />
    : o.form.business_type === 'homestay' ? <HomestayForm o={o} />
    : (o.form.business_type === 'cafe' || o.form.business_type === 'shop') ? <CafeShopForm o={o} />
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-8 md:py-10">
      <div className="text-center mb-6 md:mb-8">
        <span className="chip">₹99 · one-time</span>
        <h1 className="mt-3 font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">{t('provider.onboard_title')}</h1>
        <p className="mt-2 text-sm md:text-base text-ink-soft">{t('provider.onboard_sub')}</p>
      </div>

      <form onSubmit={submit} className="mist-panel p-5 md:p-8 space-y-4" data-testid="provider-onboard-form">
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
              {TYPES.map((tp) => <option key={tp} value={tp}>{tp}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-semibold text-ink-soft">{t('provider.description')}</span>
          <textarea required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
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
        <div className="block">
          <span className="text-xs font-semibold text-ink-soft">{t('provider.pin_location')}</span>
          <LocationPicker
            className="mt-1"
            onLocationSelect={(lat, lng) => setCoords({ lat, lng })}
          />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">{t('provider.price_from')}</span>
            <input required type="number" min="0" value={form.price_from} onChange={(e) => setForm({ ...form, price_from: e.target.value })}
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
        {msg && <p data-testid="provider-msg" className="text-sm text-center text-flag font-semibold">{msg}</p>}
      </form>

      <MockPaymentModal
        open={!!o.payModal}
        onClose={() => o.setPayModal(null)}
        amount={o.payModal?.amount || 0}
        title="Provider registration"
        description={o.payModal?.description || ''}
        onPay={o.finishMockPayment}
        prefill={{ upi: `${(o.form.business_name || 'business').toLowerCase().replace(/\s+/g, '')}@ybl` }}
      />
      <BookingConfirmation
        open={!!o.confirm?.open}
        onClose={() => { o.setConfirm(null); o.nav('/provider/dashboard'); }}
        mode="provider"
        data={o.confirm?.data}
        onView={() => { o.setConfirm(null); o.nav('/provider/dashboard'); }}
      />
    </>
  );
}
