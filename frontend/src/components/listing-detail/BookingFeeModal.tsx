import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ag/Icon';
import api, { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import MockPaymentModal from '@/components/MockPaymentModal';
import PriceBreakup from '@/components/PriceBreakup';
import { rupees, usePrice, usePassPrice } from '@/lib/prices';
import PassOffer from '@/components/PassOffer';
import { FieldError } from '@/components/ag';
import Sheet, { SheetHead } from './Sheet';

type Flow = 'booking_commission' | 'platform_support';

/**
 * A traveller without the aangan pass sends a request only after picking: take the pass (every
 * request free for a year) or pay ₹1 for this one, refunded if the host says no. Either payment
 * ends with the request sent to the host (POST /bookings/{id}/send).
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
  const pass = usePassPrice(user);
  const fee = usePrice('booking_commission');

  if (!bookingId) return null;

  const reference = (flow: Flow) => (flow === 'platform_support' ? user.id : bookingId);

  // Paying the fee sends the request on the server; with the pass, /send sends it free. /send is
  // safe to repeat, so calling it after either one returns the sent request.
  const finish = async () => {
    await refresh();
    const { data } = await api.post(`/bookings/${bookingId}/send`);
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
        description: flow === 'platform_support' ? t('fee.pass_title') : t('fee.send_fee_title'),
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
    <>
      <Sheet onClose={onClose} labelledBy="fee-title" testid="booking-fee-modal">
        <SheetHead id="fee-title" eyebrow={t('fee.send_eyebrow')} title={t('fee.send_title')}>
          <p className="ag-small">{t('fee.send_body')}</p>
        </SheetHead>

        <div className="ag-pick">
          {/* Two ways to pay, each a tap that starts its payment (not a choice to confirm later). */}
          <button type="button" className="ag-option !items-start !border-[var(--r)] !bg-[var(--r-tint)]" onClick={() => pay('platform_support')}
            disabled={!!busy} data-testid="fee-take-pass">
            <Icon name="badge" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-3">
                <b>{t('fee.pass_title')}</b>
                <b className="text-[var(--r)] whitespace-nowrap">{rupees(pass.total)}</b>
              </span>
              {busy === 'platform_support'
                ? <span className="ag-small">{t('common.loading')}</span>
                : <PassOffer renewing={!!user?.supportExpiresAt} compact className="mt-1" />}
            </span>
          </button>

          <button type="button" className="ag-option !items-start" onClick={() => pay('booking_commission')}
            disabled={!!busy} data-testid="fee-pay-once">
            <Icon name="t_trip" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-3">
                <b>{t('fee.send_fee_title')}</b>
                <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium">{rupees(fee.total)} <Icon name="arrowne" size={16} className="text-[var(--r)]" /></span>
              </span>
              <span className="ag-small">{busy === 'booking_commission' ? t('common.loading') : t('fee.send_fee_body')}</span>
              <PriceBreakup breakup={fee} label={t('price.request_fee', 'Fee · this request')} compact className="mt-2" />
            </span>
          </button>
        </div>

        <FieldError id="fee-error">{err}</FieldError>
        <p className="ag-small !text-[13px]">{t('fee.send_note')}</p>
      </Sheet>

      <MockPaymentModal
        open={!!mock}
        onClose={() => setMock(null)}
        amount={mock?.amount || 0}
        title={mock?.flow === 'platform_support' ? t('fee.pass_title') : t('fee.send_fee_title')}
        description={mock?.flow === 'platform_support' ? t('support.modal_duration') : ''}
        onPay={finishMock}
        prefill={{ upi: `${(user?.name || 'traveller').toLowerCase().replace(/\s+/g, '')}@ybl` }}
      />
    </>
  );
}
