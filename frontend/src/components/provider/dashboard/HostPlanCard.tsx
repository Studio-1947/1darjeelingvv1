import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, Star, WarningCircle } from '@phosphor-icons/react';
import api, { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import MockPaymentModal from '@/components/MockPaymentModal';
import PriceBreakup from '@/components/PriceBreakup';
import { Box, Button, FieldError, MenuIcon } from '@/components/ag';
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

  // Lapsed or paused needs attention (blush); everything else is the plain creme panel.
  const alarm = lapsed || !!grace?.paused;

  return (
    <Box as="section" tone={alarm ? 'blush' : undefined} data-testid="host-plan-card">
      <div className="flex items-start gap-3">
        <MenuIcon>{alarm ? <WarningCircle /> : <CalendarCheck />}</MenuIcon>
        <div className="min-w-0 flex-1">
          <span className="ag-eyebrow">{grace ? t('pd.grace.label') : registrationPending ? t('pd.plan_activation_label') : t('pd.plan_label')}</span>
          <h2 data-testid="host-plan-title">
            {grace
              ? grace.paused ? t('pd.grace.paused_title') : t('pd.grace.title', { used: grace.used, limit: grace.limit })
              : notStarted ? t('pd.start_free_title')
              : registrationPending ? t('pd.plan_activate_title') : lapsed ? t('pd.plan_lapsed_title') : (provider.approval_pending ? t('pd.plan_paid_until', { date: until }) : t('pd.plan_valid_until', { date: until }))}
          </h2>
          <p className="ag-small">
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
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-[var(--ink-strong)]" data-testid="host-plan-reviews">
              <Star size={15} weight="fill" className="text-[var(--star)]" />
              {reviews.count ? t('pd.plan_reviews', { count: reviews.count, average: reviews.average }) : t('pd.plan_no_reviews')}
            </p>
          )}
        </div>
      </div>
      <FieldError>{err}</FieldError>
      {canRenew && provider.access === 'co_owner' && (
        <p className="ag-small" data-testid="host-plan-owner-pays">{t('owners.plan_main_owner')}</p>
      )}
      {canRenew && provider.access !== 'co_owner' && (
        <PriceBreakup breakup={registrationPending ? firstYear : renewal}
          label={registrationPending ? t('price.host_first_year') : t('price.host_renewal')} />
      )}
      {(notStarted || canRenew) && provider.access !== 'co_owner' && (
        <div className="ag-row">
          {notStarted && (
            <Button variant="primary" go onClick={startFree} disabled={busy} data-testid="host-plan-start-free">{t('ob.free.cta')}</Button>
          )}
          {canRenew && (
            <Button variant={notStarted || (grace && !grace.paused) ? 'std' : 'primary'} onClick={renew} disabled={busy} data-testid="host-plan-renew">
              {busy ? t('pd.plan_renewing') : grace ? t('pd.grace.pay_cta', { total: rupees(firstYear.total) }) : registrationPending ? t('pd.plan_activate_cta', { total: rupees(firstYear.total) }) : t('pd.plan_renew_cta', { total: rupees(renewal.total) })}
            </Button>
          )}
        </div>
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
    </Box>
  );
}
