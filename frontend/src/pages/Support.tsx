import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HeartHandshake, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import MockPaymentModal from '@/components/MockPaymentModal';

export default function Support() {
  const { t } = useTranslation();
  const { user, refresh, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [payModal, setPayModal] = useState<any>(null);

  // Where SupportGate intercepted them. Falling back to the feed keeps a direct visit sensible.
  const destination = (location.state as any)?.from?.pathname || '/';

  if (!user) return <Navigate to="/login" replace />;

  const finish = async () => {
    await refresh();
    nav(destination, { replace: true });
  };

  const startPayment = async () => {
    setBusy(true);
    setErr('');
    try {
      const order = await createPaymentOrder({ flow: 'platform_support', reference_id: user.id });
      if (order.mock) {
        setPayModal({ amount: order.amount, order: order.order });
      } else {
        await payWithRazorpay({
          order: order.order,
          key_id: order.key_id,
          flow: 'platform_support',
          reference_id: user.id,
          description: t('support.modal_title'),
          prefill: { contact: user.phone, name: user.name },
        });
        await finish();
      }
    } catch (e: any) {
      setErr(e?.response?.data?.detail || t('support.error'));
    } finally {
      setBusy(false);
    }
  };

  const finishMockPayment = async () => {
    await completeMockPayment({
      order_id: payModal.order.id,
      flow: 'platform_support',
      reference_id: user.id,
    });
    setPayModal(null);
    await finish();
  };

  // The escape hatch. A hard gate on a logged-in user with no way out is a trap: they cannot
  // pay, cannot browse, cannot leave. Public browsing was always free — this makes it reachable.
  const browseAnonymously = () => {
    logout();
    nav('/', { replace: true });
  };

  return (
    <div className="mx-auto max-w-md px-4 md:px-8 py-8 md:py-14">
      <div className="mist-panel p-6 md:p-8" data-testid="support-screen">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-pine text-white grid place-items-center">
            <HeartHandshake size={26} />
          </div>
          <h1 className="mt-4 font-display font-extrabold text-2xl md:text-3xl text-ink leading-tight">
            {t('support.title')}
          </h1>
        </div>

        <p className="mt-5 text-sm text-ink font-semibold">{t('support.amount_line')}</p>
        <p className="mt-3 text-sm text-ink-soft">{t('support.body')}</p>

        <button
          onClick={startPayment}
          disabled={busy}
          data-testid="support-pay"
          className="mt-7 w-full py-3 rounded-full bg-pine text-white font-extrabold btn-hover disabled:opacity-60"
        >
          {busy ? t('common.loading') : t('support.cta')}
        </button>

        <p className="mt-3 text-[11px] text-center text-ink-soft flex items-center justify-center gap-1">
          <Check size={11} /> {t('support.reassurance')}
        </p>

        {err && (
          <p data-testid="support-error" className="mt-4 text-sm text-flag font-semibold text-center">
            {err}
          </p>
        )}

        <button
          type="button"
          onClick={browseAnonymously}
          data-testid="support-skip"
          className="mt-6 w-full text-xs text-ink-soft underline"
        >
          {t('support.skip')}
        </button>

        <p className="mt-6 text-xs text-center text-ink-soft">
          <Link to="/privacy" className="underline">{t('support.privacy_link')}</Link>
        </p>
      </div>

      <MockPaymentModal
        open={!!payModal}
        onClose={() => setPayModal(null)}
        amount={payModal?.amount || 0}
        title={t('support.modal_title')}
        description={t('support.modal_duration')}
        onPay={finishMockPayment}
        prefill={{ upi: `${(user.name || 'traveller').toLowerCase().replace(/\s+/g, '')}@ybl` }}
      />
    </div>
  );
}
