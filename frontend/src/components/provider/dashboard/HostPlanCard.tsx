import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, Star, WarningCircle } from '@phosphor-icons/react';
import api, { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import MockPaymentModal from '@/components/MockPaymentModal';
import PriceBreakup from '@/components/PriceBreakup';
import { rupees, useHostPlanPrice } from '@/lib/prices';
import { graceLeft, type GraceState } from '@/lib/hostQuickFill';

/**
 * Within this many days of the end, renewal opens and the card starts nudging the host to renew.
 * Mirrors HOST_RENEWAL_WINDOW_DAYS on the server, which refuses an earlier renewal (409) so a
 * second year is never bought by accident.
 */
const RENEW_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The host's yearly plan: ₹499 a year for homestays and drivers, ₹99 for cafes, shops and guides
 * (plus GST and the fee), the first year and every year after.
 *
 * Shows when the current year ends and offers the renewal once it opens, 30 days before the
 * end. Renewing inside that window adds the year on top of what is left. Once the year has ended
 * the host's listings
 * are hidden from travellers and stop taking bookings (the server enforces that, see
 * backend/src/lib/hostPlan.ts), and this card says so plainly.
 */
export default function HostPlanCard({ provider, user, reviews, onRenewed }: {
  provider: any;
  user: any;
  /** Shown on the card, which is the board's "Membership card" on the host dashboard. */
  reviews?: { count: number; average: number | string | null };
  onRenewed: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [payModal, setPayModal] = useState<any>(null);
  // The server sends this host's price (plan_price); the type decides it until that arrives.
  const typePrice = useHostPlanPrice(provider?.business_type);
  const firstYear = provider?.plan_price ?? typePrice;
  const renewal = firstYear;
  const price = rupees(firstYear.base);

  if (!provider) return null;

  // Paying the first year is what gives a business its plan expiry, and the server allows the
  // registration payment per business (never activated), not per account. So a host whose earlier
  // business is paid still sees Activate on a new one, rather than "Live until Invalid Date".
  const registrationPending = !provider.plan_expires_at;
  // The free start (backend lib/hostGrace.ts): live without paying until the first bookings.
  const grace: GraceState | null = provider.status === 'active' ? provider.grace ?? null : null;
  // Signed up but stopped at the payment: they can start free from here.
  const notStarted = provider.status === 'pending_payment';
  const expiry = registrationPending ? Number.NaN : Date.parse(provider.plan_expires_at);
  const lapsed = !registrationPending && !provider.plan_active;
  const daysLeft = Math.ceil((expiry - Date.now()) / DAY_MS);
  const soon = !registrationPending && !lapsed && daysLeft <= RENEW_SOON_DAYS;
  const until = new Date(expiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  // Before the window opens the server would answer 409, so the button is not offered at all.
  const canRenew = registrationPending || lapsed || soon;
  const flow = registrationPending ? 'provider_registration' : 'provider_renewal';
  const paymentTitle = registrationPending ? t('pd.plan_activate_title') : t('pd.plan_renew_title');

  const startFree = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.post('/providers/me/start-free');
      await onRenewed();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || t('pd.plan_renew_failed'));
    } finally {
      setBusy(false);
    }
  };

  const renew = async () => {
    setBusy(true);
    setErr('');
    try {
      const order = await createPaymentOrder({ flow, reference_id: provider.id });
      if (order.mock) {
        setPayModal({ amount: order.amount, order: order.order });
      } else {
        await payWithRazorpay({
          order: order.order,
          key_id: order.key_id,
          flow,
          reference_id: provider.id,
          description: paymentTitle,
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
      await completeMockPayment({ order_id: payModal.order.id, flow, reference_id: provider.id });
      setPayModal(null);
      await onRenewed();
    } catch (e: any) {
      setPayModal(null);
      await onRenewed();
      setErr(e?.response?.data?.detail || t('pd.plan_renew_failed'));
    }
  };

  const tone = grace
    ? grace.paused ? 'border-flag/30 bg-flag/5' : 'border-pine/30 bg-pine/5'
    : registrationPending
    ? 'border-gold/40 bg-gold/10'
    : lapsed
    ? 'border-flag/30 bg-flag/5'
    : soon
      ? 'border-gold/40 bg-gold/10'
      : 'border-[var(--line)] bg-white';

  return (
    <div data-testid="host-plan-card" className={`mb-6 rounded-2xl border p-4 md:p-5 flex flex-wrap items-center justify-between gap-4 ${tone}`}>
      <div className="flex items-start gap-3 min-w-0">
        {lapsed || grace?.paused
          ? <WarningCircle size={22} className="text-flag shrink-0 mt-0.5" />
          : <CalendarCheck size={22} className={`${registrationPending && !grace ? 'text-gold' : 'text-pine'} shrink-0 mt-0.5`} />}
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">{grace ? t('pd.grace.label') : registrationPending ? t('pd.plan_activation_label') : t('pd.plan_label')}</div>
          <div className="mt-0.5 font-display font-extrabold text-lg text-ink" data-testid="host-plan-title">
            {grace
              ? grace.paused ? t('pd.grace.paused_title') : t('pd.grace.title', { used: grace.used, limit: grace.limit })
              : notStarted ? t('pd.start_free_title')
              : registrationPending ? t('pd.plan_activate_title') : lapsed ? t('pd.plan_lapsed_title') : (provider.approval_pending ? t('pd.plan_paid_until', { date: until }) : t('pd.plan_valid_until', { date: until }))}
          </div>
          <p className="text-sm text-ink-soft">
            {grace
              ? grace.paused
                ? t('pd.grace.paused_body', { total: rupees(firstYear.total) })
                : t('pd.grace.body', { count: graceLeft(grace), total: rupees(firstYear.total) })
              : notStarted
              ? t('pd.start_free_body', { total: rupees(firstYear.total) })
              : registrationPending
              ? t('pd.plan_activate_body', { price })
              : lapsed
              ? t('pd.plan_lapsed_body', { price })
              : soon
                ? t('pd.plan_ends_soon', { count: Math.max(daysLeft, 0), price })
                : t('pd.plan_renew_body', { price })}
          </p>
          {reviews && !registrationPending && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-ink" data-testid="host-plan-reviews">
              <Star size={15} weight="fill" className="text-gold" />
              {reviews.count ? t('pd.plan_reviews', { count: reviews.count, average: reviews.average }) : t('pd.plan_no_reviews')}
            </p>
          )}
          {err && <p className="mt-1 text-sm font-semibold text-flag">{err}</p>}
        </div>
      </div>
      {canRenew && provider.access === 'co_owner' && (
        <p className="text-sm text-ink-soft" data-testid="host-plan-owner-pays">{t('owners.plan_main_owner')}</p>
      )}
      {notStarted && provider.access !== 'co_owner' && (
        <button
          onClick={startFree}
          disabled={busy}
          data-testid="host-plan-start-free"
          className="inline-flex items-center justify-center rounded-full bg-pine text-white font-bold text-sm px-5 disabled:opacity-60 btn-hover"
        >
          {t('ob.free.cta')}
        </button>
      )}
      {canRenew && provider.access !== 'co_owner' && (
        <PriceBreakup breakup={registrationPending ? firstYear : renewal}
          label={registrationPending ? t('price.host_first_year') : t('price.host_renewal')}
          className="w-full sm:max-w-xs" />
      )}
      {canRenew && provider.access !== 'co_owner' && (
        <button
          onClick={renew}
          disabled={busy}
          data-testid="host-plan-renew"
          className={`inline-flex items-center justify-center rounded-full font-bold text-sm px-5 disabled:opacity-60 btn-hover ${notStarted ? 'border border-pine text-pine bg-white' : 'bg-pine text-white'}`}
        >
          {busy ? t('pd.plan_renewing') : grace ? t('pd.grace.pay_cta', { total: rupees(firstYear.total) }) : registrationPending ? t('pd.plan_activate_cta', { total: rupees(firstYear.total) }) : t('pd.plan_renew_cta', { total: rupees(renewal.total) })}
        </button>
      )}

      <MockPaymentModal
        open={!!payModal}
        onClose={() => setPayModal(null)}
        amount={payModal?.amount || 0}
        title={paymentTitle}
        description={provider.business_name}
        onPay={finishMockPayment}
        prefill={{ upi: `${(user?.name || 'host').toLowerCase().replace(/\s+/g, '')}@ybl` }}
      />
    </div>
  );
}
