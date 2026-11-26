import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import MockPaymentModal from '@/components/MockPaymentModal';
import PriceBreakup from '@/components/PriceBreakup';
import { Button, FieldError, cx } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import { rupees } from '@/lib/prices';
import { gstDraftError, gstDraftFrom, gstPayload, type GstDraft } from '@/lib/gstin';
import GstDetails from '@/components/provider/GstDetails';
import Sheet, { SheetHead } from '@/components/listing-detail/Sheet';

/** What the server sends for a listing's membership (backend lib/listingPlan.ts listingPlanShape). */
export type ListingPlan =
  | { needed: false; free: boolean }
  | {
    needed: true;
    member: boolean;
    lapsed: boolean;
    on_free_start: boolean;
    grace: { used: number; limit: number; paused: boolean } | null;
    expires_at: string | null;
    member_no: string | null;
    price: { base: number; gst: number; total: number; platform_fee: number };
  };

/** Renewal opens this many days before the year ends (the server's HOST_RENEWAL_WINDOW_DAYS). */
const RENEW_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Each listing's membership card on the dashboard (user decision 2026-11-25: one yearly membership
 * per listing). Paid: "aangan member", the type, valid until, the card number. On the free start
 * (every listing starts there: sign-up asks for no payment): the good news first, then bookings used
 * of the free ones and the yearly price. Lapsed: says so, with Renew. A local shop
 * lists free. Pay opens the same confirm sheet as before (price, optional GSTIN), for this listing.
 */
export default function ListingMembershipCard({ listing, typeLabel, provider, user, onPaid }: {
  listing: { id: string; title: string; type: string; plan?: ListingPlan };
  typeLabel: string;
  provider: any;
  user: any;
  onPaid: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const plan = listing.plan;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [payModal, setPayModal] = useState<any>(null);
  const [gst, setGst] = useState<GstDraft>(() => gstDraftFrom(provider));
  const [gstTried, setGstTried] = useState(false);

  if (!plan) return null;
  if (plan.needed === false) {
    return (plan as { free: boolean }).free ? (
      <div className="ag-host-mcard free" data-testid={`membership-${listing.id}`}>
        <div className="row"><span className="brand"><Icon name="badge" />{t('host.shop_free', 'Local shops list free')}</span></div>
        <p className="line">{t('host.shop_free_s', 'No yearly pass and no commission. Keep taking orders.')}</p>
      </div>
    ) : null;
  }

  const coOwner = provider?.access === 'co_owner';
  const expiry = plan.expires_at ? Date.parse(plan.expires_at) : Number.NaN;
  const daysLeft = Math.ceil((expiry - Date.now()) / DAY_MS);
  const until = Number.isNaN(expiry) ? '' : new Date(expiry).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const firstYear = plan.on_free_start || !plan.expires_at;
  const soon = plan.member && daysLeft <= RENEW_SOON_DAYS;
  // Before the renewal window the server refuses a second year, so Renew is not offered.
  const canPay = !coOwner && (firstYear || plan.lapsed || soon);
  const due = plan.lapsed || !!plan.grace?.paused;
  const flow = firstYear ? 'listing_plan' : 'listing_renewal';
  const title = firstYear ? t('host.mcard_pay_title', 'Membership for {{name}}', { name: listing.title }) : t('pd.plan_renew_title');
  const total = rupees(plan.price.total);
  // The yearly price as hosts know it (₹499 / ₹99); GST is shown in the pay sheet.
  const yearly = t('host.mcard_yearly', 'Yearly pass {{price}}/year', { price: rupees(plan.price.base) });

  let state: string;
  let line: React.ReactNode;
  if (plan.member) {
    state = t('host.mcard_member', 'aangan member');
    line = <>{typeLabel} · {t('host.mcard_valid', 'Valid until {{date}}', { date: until })}{soon && <> · <b>{t('host.mcard_ends_in', { count: Math.max(daysLeft, 0), defaultValue: 'ends in {{count}} days' })}</b></>}</>;
  } else if (plan.lapsed) {
    state = t('host.mcard_lapsed', 'Membership ended');
    line = <>{t('host.mcard_lapsed_s', 'Hidden from travellers since {{date}}. Renew to bring it back.', { date: until })}</>;
  } else if (plan.grace) {
    // Sign-up asks for no payment, so this card is where the pass is first offered: it opens with
    // the good news (the free start, or the free bookings used well), and the price comes after.
    const { used, limit } = plan.grace;
    const price = rupees(plan.price.base);
    if (plan.grace.paused) {
      state = t('host.mcard_cheer_done', 'Well done, your first {{limit}} bookings are complete', { limit });
      line = <>{t('host.mcard_cheer_done_s', 'Keep the bookings coming with the yearly pass: {{price}}/year.', { price })}</>;
    } else {
      state = t('host.mcard_cheer', 'Your listing is up. Your first {{limit}} bookings are free', { limit });
      line = <>{t('host.mcard_cheer_s', '{{used}} of {{limit}} done. After that, the yearly pass is {{price}}/year. Pay any time.', { used, limit, price })}</>;
    }
  } else {
    state = yearly;
    line = <>{t('host.mcard_price', 'GST is added when you pay.')}</>;
  }

  const open = () => { setErr(''); setGst(gstDraftFrom(provider)); setGstTried(false); setConfirming(true); };

  const pay = async () => {
    if (gstDraftError(gst)) { setGstTried(true); return; }
    setBusy(true);
    setErr('');
    try {
      const order = await createPaymentOrder({ flow, reference_id: listing.id, gst: gstPayload(gst) });
      setConfirming(false);
      if (order.mock) {
        setPayModal({ amount: order.amount, order: order.order });
      } else {
        await payWithRazorpay({
          order: order.order, key_id: order.key_id, flow, reference_id: listing.id,
          description: title, prefill: { contact: user?.phone, name: user?.name },
        });
        await onPaid();
      }
    } catch (e: any) {
      // It may have gone through even if the checkout reported a failure (the webhook settles it).
      await onPaid();
      if (e?.response?.data?.code === 'invalid_gstin') { setGstTried(true); setConfirming(true); }
      setErr(e?.response?.data?.detail || t('pd.plan_renew_failed'));
    } finally {
      setBusy(false);
    }
  };

  const finishMock = async () => {
    try {
      await completeMockPayment({ order_id: payModal.order.id, flow, reference_id: listing.id });
    } catch (e: any) {
      setErr(e?.response?.data?.detail || t('pd.plan_renew_failed'));
    } finally {
      setPayModal(null);
      await onPaid();
    }
  };

  return (
    <div className={cx('ag-host-mcard', plan.member && 'member', due && 'due')} data-testid={`membership-${listing.id}`}>
      <div className="row">
        <span className={plan.member || plan.lapsed ? 'brand' : 'title'}><Icon name="badge" />{state}</span>
        {plan.member_no && <span className="no" data-testid={`membership-no-${listing.id}`}>{plan.member_no}</span>}
      </div>
      <p className="line">{line}</p>
      {canPay && (
        <Button size="sm" variant={due || soon || firstYear ? 'primary' : 'std'} className="self-start" onClick={open} disabled={busy}
          data-testid={`membership-pay-${listing.id}`}>
          {busy ? t('pd.plan_renewing') : firstYear ? t('host.pay_now', 'Pay now') : t('host.mcard_renew', 'Renew · {{total}}', { total })}
        </Button>
      )}
      {coOwner && (firstYear || plan.lapsed || soon) && <span className="ag-small">{t('owners.plan_main_owner')}</span>}
      {err && <FieldError>{err}</FieldError>}

      {confirming && (
        <Sheet onClose={() => { if (!busy) setConfirming(false); }} labelledBy={`mcard-${listing.id}-title`} testid="host-plan-confirm" closeTestid="host-plan-confirm-close">
          <div className="flex flex-col gap-4">
            <SheetHead id={`mcard-${listing.id}-title`} eyebrow={`${listing.title} · ${typeLabel}`} title={title} />
            <PriceBreakup breakup={plan.price as any} label={firstYear ? t('price.host_first_year') : t('price.host_renewal')} />
            <GstDetails value={gst} onChange={setGst} showErrors={gstTried} />
            <FieldError>{err}</FieldError>
            <Button variant="primary" go block onClick={pay} disabled={busy} data-autofocus data-testid="host-plan-pay">
              {busy ? t('pd.plan_renewing') : t('gst.pay_cta', { total, defaultValue: 'Pay {{total}}' })}
            </Button>
          </div>
        </Sheet>
      )}
      <MockPaymentModal open={!!payModal} onClose={() => setPayModal(null)} amount={payModal?.amount || 0}
        title={title} description={listing.title} onPay={finishMock}
        prefill={{ upi: `${(user?.name || 'host').toLowerCase().replace(/\s+/g, '')}@ybl` }} />
    </div>
  );
}
