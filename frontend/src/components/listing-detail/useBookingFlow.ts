import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { readTrip } from '@/lib/tripParams';

export interface BookingForm {
  check_in: string;
  check_out: string;
  guests: number;
  notes: string;
}

export interface BookingErrors {
  check_in?: string;
  check_out?: string;
  guests?: string;
}

const draftKey = (id: string) => `booking_draft_${id}`;

/**
 * sessionStorage rather than localStorage: a half-filled booking is context for
 * this visit, not a preference to remember on the next one. Both accessors are
 * guarded - Safari in private mode throws on write, and losing a draft is not a
 * reason to take the page down.
 */
function loadDraft(id: string): Partial<BookingForm> | null {
  try {
    const raw = sessionStorage.getItem(draftKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft(id: string, form: BookingForm) {
  try { sessionStorage.setItem(draftKey(id), JSON.stringify(form)); } catch { /* nothing to do */ }
}

function clearDraft(id: string) {
  try { sessionStorage.removeItem(draftKey(id)); } catch { /* nothing to do */ }
}

/**
 * The form's opening state, in order of authority:
 *   1. a draft from earlier in this visit - what the visitor actually typed,
 *      including whatever they had entered when the login wall interrupted them;
 *   2. the dates and guest count carried over from the search (lib/tripParams);
 *   3. empty.
 */
function initialForm(id: string, search: string): BookingForm {
  const trip = readTrip(new URLSearchParams(search));
  const base: BookingForm = {
    check_in: trip.checkIn,
    check_out: trip.checkOut,
    guests: trip.guests,
    notes: '',
  };
  return { ...base, ...(loadDraft(id) || {}) };
}

/**
 * Booking form state and the book → pay (mock or Razorpay) → confirm flow
 * for a listing. `msg` doubles as the general feedback line under the form;
 * `errors` holds the per-field ones.
 */
export function useBookingFlow(item: any, id: string) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const { pathname, search } = useLocation();

  const [form, setForm] = useState<BookingForm>(() => initialForm(id, search));
  const [errors, setErrors] = useState<BookingErrors>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [payModal, setPayModal] = useState(null); // { order, amount, description, bookingId }
  const [confirm, setConfirm] = useState(null); // { open, data }

  // Moving between listings has to start a fresh form; the hook is not remounted
  // by the router, so without this the second listing would inherit the first
  // one's dates and notes.
  useEffect(() => {
    setForm(initialForm(id, search));
    setErrors({});
    setMsg('');
    // Re-reading `search` on every change would fight the visitor's own edits, so
    // this deliberately keys on the listing alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Kept up to date on every keystroke rather than only on submit: the visitor may
  // leave for the login wall from anywhere on the page - the sticky bar, a share
  // sheet, the back button - not just by pressing Reserve.
  useEffect(() => { saveDraft(id, form); }, [id, form]);

  /**
   * What has to be true before this booking is worth sending anywhere.
   *
   * Runs *before* the login redirect, not after it. Pressing Reserve with the
   * whole form empty used to bounce straight to /login with no explanation, so
   * the visitor signed in, came back, and only then learned they needed dates
   * (QA 2.4).
   */
  const validate = useCallback((): boolean => {
    const next: BookingErrors = {};
    if (item?.type === 'homestay') {
      if (!form.check_in) next.check_in = t('booking.dates_required');
      if (!form.check_out) next.check_out = t('booking.dates_required');
      if (form.check_in && form.check_out && form.check_out <= form.check_in) {
        next.check_out = t('booking.dates_order');
      }
    }
    if (!(Number(form.guests) >= 1)) next.guests = t('booking.guests_required');

    setErrors(next);
    if (Object.keys(next).length === 0) return true;

    // The mobile sticky bar can submit from anywhere on a page that is several
    // screens tall, so the field that needs fixing is usually nowhere near the
    // visitor. Inline errors nobody scrolls to are no better than the silent
    // redirect they replaced. rAF so the aria-invalid attributes exist first.
    requestAnimationFrame(() => {
      const field = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      field?.focus({ preventScroll: true });
    });
    return false;
  }, [item, form, t]);

  const doBook = async () => {
    setMsg('');
    if (!item) return;
    if (!validate()) return;

    if (!user) {
      // The draft is already in sessionStorage, and the query string comes along
      // so the dates survive even in a browser that clears it.
      nav('/login?next=' + encodeURIComponent(`${pathname}${search}`));
      return;
    }

    setBusy(true);
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
        clearDraft(id);
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
    clearDraft(id);
    setPayModal(null);
    setConfirm({ open: true, data: res.record });
  };

  // Editing a field clears its own complaint; leaving the message up while the
  // visitor fixes it reads as though the fix didn't take.
  const updateForm = (patch: Partial<BookingForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[k as keyof BookingErrors]);
      return next;
    });
  };

  return {
    user,
    form, setForm, updateForm,
    errors,
    busy,
    msg, setMsg,
    payModal, setPayModal,
    confirm, setConfirm,
    doBook, finishMockPayment,
  };
}

export type BookingFlow = ReturnType<typeof useBookingFlow>;
