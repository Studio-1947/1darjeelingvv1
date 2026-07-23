import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HeartHandshake, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import { needsSupport } from '@/lib/support';
import MockPaymentModal from '@/components/MockPaymentModal';

export default function Support() {
  const { t } = useTranslation();
  const { user, refresh, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [payModal, setPayModal] = useState<any>(null);

  // Where SupportGate intercepted them. Rebuilt from pathname + search + hash so a query-bearing
  // URL like /search?q=momo survives the round trip; falling back to the feed keeps a direct
  // visit sensible.
  const from = (location.state as any)?.from;

  // The 402 interceptor (frontend/src/lib/api.ts) has no router access — it does a full page
  // navigation — so it can't carry state.from and instead appends the destination as a `next`
  // query param. Unlike state.from (which only this app's own SupportGate produces), `next` is
  // attacker-suppliable: anyone can send a link to /support?next=.... Only accept it if it is a
  // same-origin relative path — starting with a single '/' and NOT with '//' or '/\', both of
  // which a browser/URL parser treats as protocol-relative and resolves to a different host.
  // Anything else is rejected and we fall back to '/'.
  const rawNext = new URLSearchParams(location.search).get('next');
  const next =
    rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/\\')
      ? rawNext
      : null;

  const destination = from?.pathname
    ? `${from.pathname}${from.search || ''}${from.hash || ''}`
    : next || '/';

  // A year settled by the Razorpay webhook while the user was away (e.g. modal.ondismiss fired
  // after capture but before the success handler ran) needs to be reflected here on arrival,
  // otherwise the pay button stays live and invites a second charge. `refresh` has a stable
  // identity (useCallback with no deps in AuthContext), so this runs exactly once on mount.
  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!user) return <Navigate to="/login" replace />;

  // Fee already active (paid just now in another tab, settled by webhook while away, etc.) —
  // don't show the pay screen again, just send them on to where they were headed.
  if (!needsSupport(user)) return <Navigate to={destination} replace />;

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
      // A rejection here (e.g. modal.ondismiss firing after Razorpay captured the payment but
      // before our handler ran) may actually be a success on the server. Re-sync first so the
      // needsSupport guard above can catch it on the next render instead of leaving the Pay
      // button live and inviting a second charge.
      await refresh();
      setErr(e?.response?.data?.detail || t('support.error'));
    } finally {
      setBusy(false);
    }
  };

  const finishMockPayment = async () => {
    try {
      await completeMockPayment({
        order_id: payModal.order.id,
        flow: 'platform_support',
        reference_id: user.id,
      });
      setPayModal(null);
      await finish();
    } catch (e: any) {
      // Same reasoning as startPayment's catch: re-sync before surfacing the error in case the
      // payment actually went through.
      await refresh();
      setErr(e?.response?.data?.detail || t('support.error'));
      setPayModal(null);
    }
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
