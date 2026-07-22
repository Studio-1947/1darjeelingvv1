import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HeartHandshake, Check, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import MockPaymentModal from '@/components/MockPaymentModal';

// Mirrors DONATION_MIN_PAISE / DONATION_MAX_PAISE in backend/src/config.ts. This copy exists to
// give immediate feedback, not to enforce anything — the server's check is the real one, and it
// re-validates every amount regardless of what happens here.
const MIN_PAISE = 1000;
const MAX_PAISE = 10_000_000;

const PRESETS_PAISE = [10000, 25000, 50000, 100000];

export default function Donate() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();

  const [selected, setSelected] = useState<number | null>(PRESETS_PAISE[1]);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [payModal, setPayModal] = useState<any>(null);
  const [thanks, setThanks] = useState<number | null>(null);

  // Donations are for signed-in users only, so the payment is attributable. Preserve the
  // destination so logging in returns them here rather than dumping them on the feed.
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent('/donate')}`} replace />;

  // A custom entry always wins over a preset — it is the field the user touched most recently in
  // any flow that reaches here, and silently charging the preset instead would be theft-adjacent.
  const customPaise = custom.trim() === '' ? null : Math.round(Number(custom) * 100);
  const amountPaise = customPaise !== null ? customPaise : selected;

  const valid =
    amountPaise !== null &&
    Number.isFinite(amountPaise) &&
    Number.isInteger(amountPaise) &&
    amountPaise >= MIN_PAISE &&
    amountPaise <= MAX_PAISE;

  const rupees = (paise: number) => (paise / 100).toLocaleString('en-IN');

  const donate = async () => {
    if (!valid || amountPaise === null) {
      setErr(t('donate.invalid'));
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const order = await createPaymentOrder({
        flow: 'donation',
        reference_id: user.id,
        amount: amountPaise,
      });
      if (order.mock) {
        setPayModal({ amount: order.amount, order: order.order });
      } else {
        await payWithRazorpay({
          order: order.order,
          key_id: order.key_id,
          flow: 'donation',
          reference_id: user.id,
          description: t('donate.modal_title'),
          prefill: { contact: user.phone, name: user.name },
        });
        // Trust the order's amount, not the local state, in case anything diverged.
        setThanks(order.amount);
      }
    } catch (e: any) {
      setErr(e?.response?.data?.detail || t('donate.error'));
    } finally {
      setBusy(false);
    }
  };

  const finishMockPayment = async () => {
    try {
      const res = await completeMockPayment({
        order_id: payModal.order.id,
        flow: 'donation',
        reference_id: user.id,
      });
      setPayModal(null);
      // The figure comes from the server's record of the order, never from local state.
      setThanks(res?.record?.amount ?? payModal.amount);
    } catch (e: any) {
      setPayModal(null);
      setErr(e?.response?.data?.detail || t('donate.error'));
    }
  };

  if (thanks !== null) {
    return (
      <div className="mx-auto max-w-md px-4 md:px-8 py-10 md:py-16">
        <div className="mist-panel p-8 text-center" data-testid="donate-thanks">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-pine text-white grid place-items-center">
            <Check size={26} />
          </div>
          <p className="mt-5 font-display font-extrabold text-2xl text-ink">
            {t('donate.thanks', { amount: rupees(thanks) })}
          </p>
          <button
            onClick={() => nav('/', { replace: true })}
            data-testid="donate-done"
            className="mt-7 w-full py-3 rounded-full bg-pine text-white font-extrabold btn-hover"
          >
            {t('donate.back')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 md:px-8 py-8 md:py-14">
      <div className="mist-panel p-6 md:p-8" data-testid="donate-screen">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-pine text-white grid place-items-center">
            <HeartHandshake size={26} />
          </div>
          <h1 className="mt-4 font-display font-extrabold text-2xl md:text-3xl text-ink leading-tight">
            {t('donate.title')}
          </h1>
        </div>

        <p className="mt-4 text-sm text-ink-soft">{t('donate.lead')}</p>

        <div className="mt-6">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">
            {t('donate.choose')}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS_PAISE.map((p) => {
              const active = custom.trim() === '' && selected === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setSelected(p); setCustom(''); setErr(''); }}
                  data-testid={`donate-preset-${p}`}
                  aria-pressed={active}
                  className={`py-2.5 rounded-xl border font-bold text-sm ${
                    active ? 'border-pine bg-pine/10 text-pine' : 'border-[var(--line)] text-ink-soft'
                  }`}
                >
                  ₹{rupees(p)}
                </button>
              );
            })}
          </div>
        </div>

        <label className="block mt-4">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            {t('donate.custom')}
          </span>
          <div className="mt-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--line)] bg-white">
            <span className="text-ink-soft">₹</span>
            <input
              value={custom}
              onChange={(e) => { setCustom(e.target.value); setErr(''); }}
              inputMode="decimal"
              data-testid="donate-custom"
              placeholder="500"
              className="flex-1 bg-transparent outline-none py-1 text-ink"
            />
          </div>
        </label>

        <button
          onClick={donate}
          disabled={busy || !valid}
          data-testid="donate-pay"
          className="mt-6 w-full py-3 rounded-full bg-pine text-white font-extrabold btn-hover disabled:opacity-50"
        >
          {busy
            ? t('common.loading')
            : t('donate.cta', { amount: valid && amountPaise !== null ? rupees(amountPaise) : '—' })}
        </button>

        <p className="mt-3 text-[11px] text-center text-ink-soft">{t('donate.note')}</p>

        {err && (
          <p data-testid="donate-error" className="mt-4 text-sm text-flag font-semibold text-center">
            {err}
          </p>
        )}

        <Link
          to="/"
          data-testid="donate-back"
          className="mt-6 w-full text-xs text-ink-soft flex items-center justify-center gap-1"
        >
          <ArrowLeft size={12} /> {t('donate.back')}
        </Link>
      </div>

      <MockPaymentModal
        open={!!payModal}
        onClose={() => setPayModal(null)}
        amount={payModal?.amount || 0}
        title={t('donate.modal_title')}
        description=""
        onPay={finishMockPayment}
        prefill={{ upi: `${(user.name || 'traveller').toLowerCase().replace(/\s+/g, '')}@ybl` }}
      />
    </div>
  );
}
