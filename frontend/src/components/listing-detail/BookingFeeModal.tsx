import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Ticket, X } from '@phosphor-icons/react';
import api, { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import MockPaymentModal from '@/components/MockPaymentModal';
import PriceBreakup from '@/components/PriceBreakup';
import { rupees, usePrice } from '@/lib/prices';

type Flow = 'booking_commission' | 'platform_support';

/**
 * The board's booking flow for a traveller without the aangan pass: take the pass (₹12 a year,
 * every booking free) or pay ₹1 for this one. Either payment ends with the booking confirmed.
 * The app shows the same choice (src/components/BookingFeeSheet.tsx).
 */
export default function BookingFeeModal({ bookingId, onConfirmed, onClose }: {
  bookingId: string | null;
  onConfirmed: (booking: any) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState<Flow | null>(null);
  const [err, setErr] = useState('');
  const [mock, setMock] = useState<{ flow: Flow; amount: number; order: any } | null>(null);
  const pass = usePrice('platform_support');
  const fee = usePrice('booking_commission');

  if (!bookingId) return null;

  const reference = (flow: Flow) => (flow === 'platform_support' ? user.id : bookingId);

  // Paying the fee confirms the booking on the server; paying for the pass makes checkout free.
  // Checkout is idempotent, so calling it after either one returns the confirmed booking.
  const finish = async () => {
    await refresh();
    const { data } = await api.post(`/bookings/${bookingId}/checkout`);
    onConfirmed(data.booking);
  };

  const pay = async (flow: Flow) => {
    setBusy(flow);
    setErr('');
    try {
      const order = await createPaymentOrder({ flow, reference_id: reference(flow) });
      if (order.mock) {
        setMock({ flow, amount: order.amount, order: order.order });
        return;
      }
      await payWithRazorpay({
        order: order.order,
        key_id: order.key_id,
        flow,
        reference_id: reference(flow),
        description: flow === 'platform_support' ? t('fee.pass_title') : t('fee.fee_title'),
        prefill: { contact: user?.phone, name: user?.name },
      });
      await finish();
    } catch (e: any) {
      await refresh();
      setErr(e?.response?.data?.detail || e?.message || t('fee.failed'));
    } finally {
      setBusy(null);
    }
  };

  const finishMock = async () => {
    if (!mock) return;
    try {
      await completeMockPayment({ order_id: mock.order.id, flow: mock.flow, reference_id: reference(mock.flow) });
      setMock(null);
      await finish();
    } catch (e: any) {
      setMock(null);
      setErr(e?.response?.data?.detail || t('fee.failed'));
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog" aria-modal="true" data-testid="booking-fee-modal">
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl p-5 md:p-6 animate-fade-up max-h-[90svh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-pine">{t('fee.eyebrow')}</div>
            <h2 className="mt-1 font-display font-extrabold text-2xl text-ink leading-tight">{t('fee.title')}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close', 'Close')} className="p-1.5 rounded-full hover:bg-mist">
            <X size={18} />
          </button>
        </div>
        <p className="mt-2 text-sm text-ink-soft">{t('fee.body')}</p>

        <button type="button" onClick={() => pay('platform_support')} disabled={!!busy} data-testid="fee-take-pass"
          className="mt-5 w-full text-left rounded-2xl border-2 border-pine bg-pine/5 p-4 btn-hover disabled:opacity-60">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 font-bold text-ink"><Ticket size={20} className="text-pine" /> {t('fee.pass_title')}</span>
            <span className="font-display font-extrabold text-lg text-pine">{t('fee.pass_price', { total: rupees(pass.total) })}</span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">{busy === 'platform_support' ? t('common.loading') : t('fee.pass_body')}</p>
          <PriceBreakup breakup={pass} label={t('price.pass')} compact className="mt-3" />
        </button>

        <button type="button" onClick={() => pay('booking_commission')} disabled={!!busy} data-testid="fee-pay-once"
          className="mt-3 w-full text-left rounded-2xl border border-[var(--line)] bg-white p-4 btn-hover disabled:opacity-60">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-ink">{t('fee.fee_title')}</span>
            <span className="inline-flex items-center gap-1 font-display font-extrabold text-lg text-ink">{rupees(fee.total)} <ArrowRight size={16} /></span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">{busy === 'booking_commission' ? t('common.loading') : t('fee.fee_body')}</p>
          <PriceBreakup breakup={fee} label={t('price.booking_fee')} compact className="mt-3" />
        </button>

        {err && <p className="mt-3 text-sm font-semibold text-flag" data-testid="fee-error">{err}</p>}
        <p className="mt-4 text-xs text-ink-soft">{t('fee.note')}</p>
      </div>

      <MockPaymentModal
        open={!!mock}
        onClose={() => setMock(null)}
        amount={mock?.amount || 0}
        title={mock?.flow === 'platform_support' ? t('fee.pass_title') : t('fee.fee_title')}
        description={mock?.flow === 'platform_support' ? t('support.modal_duration') : ''}
        onPay={finishMock}
        prefill={{ upi: `${(user?.name || 'traveller').toLowerCase().replace(/\s+/g, '')}@ybl` }}
      />
    </div>
  );
}
