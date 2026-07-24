import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

/**
 * Booking form state and the book → pay (mock or Razorpay) → confirm flow
 * for a listing. `msg` doubles as the general feedback line under the form.
 */
export function useBookingFlow(item: any, id: string) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();

  const [form, setForm] = useState({ check_in: '', check_out: '', guests: 1, notes: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [payModal, setPayModal] = useState(null); // { order, amount, description, bookingId }
  const [confirm, setConfirm] = useState(null); // { open, data }

  const doBook = async () => {
    if (!user) { nav('/login?next=' + encodeURIComponent(`/listing/${id}`)); return; }
    if (item.type === 'homestay') {
      if (!form.check_in || !form.check_out) {
        setMsg(t('booking.dates_required'));
        return;
      }
      if (new Date(form.check_out) <= new Date(form.check_in)) {
        setMsg(t('booking.dates_order'));
        return;
      }
    }
    setBusy(true);
    setMsg('');
    try {
      const { data } = await api.post('/bookings', {
        listing_id: item.id,
        listing_type: item.type,
        check_in: form.check_in || null,
        check_out: form.check_out || null,
        guests: Number(form.guests) || 1,
        notes: form.notes,
      });
      const bookingId = data.booking.id;
      const orderRes = await createPaymentOrder({ flow: 'booking_commission', reference_id: bookingId });
      if (orderRes.mock) {
        setPayModal({
          amount: orderRes.amount,
          order: orderRes.order,
          description: `platform fee - ${item.title}`,
          bookingId,
        });
      } else {
        await payWithRazorpay({
          order: orderRes.order,
          key_id: orderRes.key_id,
          flow: 'booking_commission',
          reference_id: bookingId,
          description: `₹1 platform fee - ${item.title}`,
          prefill: { contact: user.phone, name: user.name },
        });
        setMsg(t('booking.success'));
        setTimeout(() => nav('/dashboard'), 1200);
      }
    } catch (e) {
      setMsg(e?.response?.data?.detail || e.message || t('booking.failed'));
    } finally {
      setBusy(false);
    }
  };

  const finishMockPayment = async () => {
    if (!payModal) return;
    const res = await completeMockPayment({
      order_id: payModal.order.id,
      flow: 'booking_commission',
      reference_id: payModal.bookingId,
    });
    setPayModal(null);
    setConfirm({ open: true, data: res.record });
  };

  return {
    user,
    form, setForm,
    busy,
    msg, setMsg,
    payModal, setPayModal,
    confirm, setConfirm,
    doBook, finishMockPayment,
  };
}

export type BookingFlow = ReturnType<typeof useBookingFlow>;
