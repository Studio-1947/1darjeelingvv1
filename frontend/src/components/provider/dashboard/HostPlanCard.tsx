import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, WarningCircle } from '@phosphor-icons/react';
import { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import MockPaymentModal from '@/components/MockPaymentModal';

/** Within this many days of the end, the card starts nudging the host to renew. */
const RENEW_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The host's yearly plan: ₹1 for the first year, ₹499 for each year after.
 *
 * Shows when the current year ends and offers the ₹499 renewal. Renewing early adds the year on
 * top of what is left, so there is no reason to wait. Once the year has ended the host's listings
 * are hidden from travellers and stop taking bookings (the server enforces that, see
 * backend/src/lib/hostPlan.ts), and this card says so plainly.
 */
export default function HostPlanCard({ provider, user, onRenewed }: {
  provider: any;
  user: any;
  onRenewed: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [payModal, setPayModal] = useState<any>(null);

  if (!provider?.plan_expires_at) return null;

  const expiry = Date.parse(provider.plan_expires_at);
  const lapsed = !provider.plan_active;
  const daysLeft = Math.ceil((expiry - Date.now()) / DAY_MS);
  const soon = !lapsed && daysLeft <= RENEW_SOON_DAYS;
  const until = new Date(expiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const renew = async () => {
    setBusy(true);
    setErr('');
    try {
      const order = await createPaymentOrder({ flow: 'provider_renewal', reference_id: provider.id });
      if (order.mock) {
        setPayModal({ amount: order.amount, order: order.order });
      } else {
        await payWithRazorpay({
          order: order.order,
          key_id: order.key_id,
          flow: 'provider_renewal',
          reference_id: provider.id,
          description: t('pd.plan_renew_title'),
          prefill: { contact: user?.phone, name: user?.name },
        });
        await onRenewed();
      }
    } catch (e: any) {
      // The payment may have gone through even if the checkout reported a failure (the webhook
      // settles it), so re-read before inviting a second attempt.
      await onRenewed();
      setErr(e?.response?.data?.detail || t('pd.plan_renew_failed'));
    } finally {
      setBusy(false);
    }
  };

  const finishMockPayment = async () => {
    try {
      await completeMockPayment({ order_id: payModal.order.id, flow: 'provider_renewal', reference_id: provider.id });
      setPayModal(null);
      await onRenewed();
    } catch (e: any) {
      setPayModal(null);
      await onRenewed();
      setErr(e?.response?.data?.detail || t('pd.plan_renew_failed'));
    }
  };

  const tone = lapsed
    ? 'border-flag/30 bg-flag/5'
    : soon
      ? 'border-gold/40 bg-gold/10'
      : 'border-[var(--line)] bg-white';

  return (
    <div data-testid="host-plan-card" className={`mb-6 rounded-2xl border p-4 md:p-5 flex flex-wrap items-center justify-between gap-4 ${tone}`}>
      <div className="flex items-start gap-3 min-w-0">
        {lapsed
          ? <WarningCircle size={22} className="text-flag shrink-0 mt-0.5" />
          : <CalendarCheck size={22} className="text-pine shrink-0 mt-0.5" />}
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">{t('pd.plan_label')}</div>
          <div className="mt-0.5 font-display font-extrabold text-lg text-ink">
            {lapsed ? t('pd.plan_lapsed_title') : t('pd.plan_valid_until', { date: until })}
          </div>
          <p className="text-sm text-ink-soft">
            {lapsed
              ? t('pd.plan_lapsed_body')
              : soon
                ? t('pd.plan_ends_soon', { count: Math.max(daysLeft, 0) })
                : t('pd.plan_renew_body')}
          </p>
          {err && <p className="mt-1 text-sm font-semibold text-flag">{err}</p>}
        </div>
      </div>
      <button
        onClick={renew}
        disabled={busy}
        data-testid="host-plan-renew"
        className="inline-flex items-center justify-center rounded-full bg-ink text-white font-bold text-sm px-5 py-2.5 disabled:opacity-60 hover:opacity-90 transition-opacity"
      >
        {busy ? t('pd.plan_renewing') : t('pd.plan_renew_cta')}
      </button>

      <MockPaymentModal
        open={!!payModal}
        onClose={() => setPayModal(null)}
        amount={payModal?.amount || 0}
        title={t('pd.plan_renew_title')}
        description={provider.business_name}
        onPay={finishMockPayment}
        prefill={{ upi: `${(user?.name || 'host').toLowerCase().replace(/\s+/g, '')}@ybl` }}
      />
    </div>
  );
}
