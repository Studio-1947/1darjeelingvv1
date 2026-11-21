import { normalizeRoutes, routeForTrip } from '@/lib/routeFares';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { readTrip } from '@/lib/tripParams';
import { roomFit, roomNightly, roomOpen } from '@/lib/roomFit';

export interface BookingForm {
  check_in: string;
  check_out: string;
  guests: number;
  notes: string;
  /** A driver booking: which of the driver's routes (host dashboard km and places). */
  route?: string;
  /** A guide booking: which of the guide's services (board: "Asking for given items"). */
  services?: string[];
  /** A homestay booking: which of the host's rooms (prototype staybook.js). Its price sets the total. */
  room?: string;
  /** A driver booking (prototype drivebook.js): where from, where to, pickup time, and days on a day-rate route. */
  pickup_place?: string;
  drop_place?: string;
  pickup_time?: string;
  days?: number;
  /** A referral voucher to take off the host's price (GET /users/me/vouchers), as in the app. */
  voucher_id?: string;
  /** Its discount, for the price breakdown. */
  voucher_pct?: number;
}

export interface BookingErrors {
  /** A driver request with no From or To. */
  route?: string;
  check_in?: string;
  check_out?: string;
  guests?: string;
  /** A stay whose room the host has since marked full (or every room is full). */
  room?: string;
}

const draftKey = (id: string) => `booking_draft_${id}`;

/** The host's rooms, each with a name (listing extras, as the profile writes them). */
export function roomsOf(item: any): { name: string; price: number; unit: string; occ?: number; extra_beds?: number; extra_bed_price?: number; photo?: string; available?: boolean }[] {
  const rooms = Array.isArray(item?.extras?.rooms) ? item.extras.rooms : [];
  return rooms.filter((r: any) => r && String(r.name || '').trim());
}

/** The driver's routes in one shape; a bare string is a one-way route with no price of its own. */
export function routesOf(item: any): { name: string; price: number; unit: 'trip' | 'day' }[] {
  const routes = Array.isArray(item?.extras?.routes) ? item.extras.routes : [];
  return routes.map((r: any) => (typeof r === 'string'
    ? { name: r.trim(), price: 0, unit: 'trip' as const }
    : { name: String(r?.route || r?.name || '').trim(), price: Number(r?.price) || 0, unit: r?.unit === 'day' ? 'day' as const : 'trip' as const }))
    .filter((r: { name: string }) => r.name);
}

/** The chosen route, when it is one of the driver's. */
export function chosenRoute(item: any, name?: string) {
  const want = String(name || '').trim().toLowerCase();
  return want ? routesOf(item).find((r) => r.name.toLowerCase() === want) || null : null;
}

/** The chosen room, when it is one of the host's. */
export function chosenRoom(item: any, name?: string) {
  const want = String(name || '').trim().toLowerCase();
  return want ? roomsOf(item).find((r) => r.name.trim().toLowerCase() === want) || null : null;
}

/**
 * What the request comes to, by the server's rule (lib/bookingAmount.ts + lib/bookingDetails.ts):
 * a room is its price a night for the whole room, plus each extra-mattress guest's charge
 * (lib/roomFit.ts); otherwise a homestay is the rate x
 * people x nights. A driver is the route's price per trip, or its day rate x days, else the listing
 * rate. A guide is the listing rate.
 */
export function bookingTotal(item: any, form: BookingForm): number {
  const rate = Number(item?.price) || 0;
  const guests = Math.max(1, Number(form.guests) || 1);
  if (item?.type === 'homestay') {
    const nights = form.check_in && form.check_out
      ? Math.max(0, Math.round((Date.parse(form.check_out) - Date.parse(form.check_in)) / 86_400_000)) : 0;
    const room = chosenRoom(item, form.room);
    // The server uses the room whenever its night comes to more than 0 (a free room with a paid mattress too).
    const nightly = room ? roomNightly(room, guests) : 0;
    if (nightly > 0) return nightly * nights;
    return rate * guests * nights;
  }
  if (item?.type === 'driver') {
    const route = chosenRoute(item, form.route);
    if (route?.unit === 'day') return (route.price || rate) * Math.max(1, Number(form.days) || 1);
    return route?.price || rate;
  }
  return rate;
}

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
 *   2. the dates and guest count carried over from the search (lib/tripParams), and for a driver
 *      the From and To of Find a ride;
 *   3. empty.
 */
function initialForm(id: string, search: string): BookingForm {
  const sp = new URLSearchParams(search);
  const trip = readTrip(sp);
  const base: BookingForm = {
    check_in: trip.checkIn,
    check_out: trip.checkOut,
    guests: trip.guests,
    notes: '',
    ...(sp.get('from') ? { pickup_place: sp.get('from')!.slice(0, 120) } : {}),
    ...(sp.get('to') ? { drop_place: sp.get('to')!.slice(0, 120) } : {}),
  };
  return { ...base, ...(loadDraft(id) || {}) };
}

/**
 * Booking form state and the book → confirm flow (bookings are free; there is no payment step)
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
  const [confirm, setConfirm] = useState(null); // { open, data }
  // The booking waiting on the ₹1 fee or the pass, for a traveller without the pass.
  const [feeFor, setFeeFor] = useState<string | null>(null);
  // A driver, homestay or guide request waiting for the host (board: "Waiting for approval").
  const [requested, setRequested] = useState<any | null>(null);

  // Find a ride's From and To pick the driver's matching route, so the total is that trip's fare.
  useEffect(() => {
    if (item?.type !== 'driver' || form.route) return;
    const sp = new URLSearchParams(search);
    const hit = routeForTrip(normalizeRoutes(item?.extras?.routes), sp.get('from') || '', sp.get('to') || '');
    if (hit) setForm((f) => (f.route ? f : { ...f, route: hit.route }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

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
      // A room the host marked full after the draft was made cannot be sent (the server refuses it too).
      const rooms = roomsOf(item);
      const picked = chosenRoom(item, form.room);
      if (rooms.length && !rooms.some(roomOpen)) next.room = t('listing.rooms_all_full');
      else if (picked && !roomOpen(picked)) next.room = t('booking.room_full_pick');
    }
    // A driver or guide request needs the day, so the host knows what they are accepting and a
    // guide's seasons can be checked.
    if ((item?.type === 'driver' || item?.type === 'guide') && !form.check_in) {
      next.check_in = t('booking.date_required');
    }
    if (item?.type === 'driver' && (!form.pickup_place?.trim() || !form.drop_place?.trim())) {
      next.route = t('booking.route_required', 'Pick where to start and where to go.');
    }
    // A room takes what it sleeps plus its extra mattresses (lib/roomFit.ts).
    const roomOcc = item?.type === 'homestay' ? roomFit(chosenRoom(item, form.room)).max || 0 : 0;
    const baseMax = item?.type === 'driver' ? (item?.extras?.seats || 6) : (item?.guests || item?.extras?.capacity || 10);
    const maxGuests = roomOcc > 0 ? Math.min(baseMax, roomOcc) : baseMax;
    if (!(Number(form.guests) >= 1)) {
      next.guests = t('booking.guests_required');
    } else if (Number(form.guests) > maxGuests) {
      next.guests = t('booking.guests_max', { max: maxGuests, defaultValue: `Maximum ${maxGuests} ${item?.type === 'driver' ? 'passengers' : 'guests'} allowed for this booking` });
    }

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
        route_name: item.type === 'driver' && form.route ? form.route : undefined,
        services: item.type === 'guide' && form.services?.length ? form.services : undefined,
        room: item.type === 'homestay' && chosenRoom(item, form.room) ? form.room : undefined,
        // The fare itself is worked out by the server from the driver's prices.
        pickup_place: item.type === 'driver' && form.pickup_place?.trim() ? form.pickup_place.trim() : undefined,
        drop_place: item.type === 'driver' && form.drop_place?.trim() ? form.drop_place.trim() : undefined,
        pickup_time: item.type === 'driver' && form.pickup_time ? form.pickup_time : undefined,
        days: item.type === 'driver' && chosenRoute(item, form.route)?.unit === 'day' ? Math.max(1, Number(form.days) || 1) : undefined,
        voucher_id: form.voucher_id || undefined,
      });
      // Without the aangan pass the request is saved, not sent: the fee sheet offers ₹1 or the
      // pass, and sends it (afterSent). The draft stays until then, so closing the sheet loses nothing.
      if (data.fee_due) {
        setFeeFor(data.booking.id);
        return;
      }
      // Board: drivers, homestays and guides wait for the host to accept. Nothing is confirmed
      // now; the traveller confirms from My Trips once the host says yes.
      if (data.booking.awaiting_host) {
        clearDraft(id);
        setRequested(data.booking);
        return;
      }
      // Checkout confirms under the server's listing lock (so two guests cannot both take the
      // same nights). Free with the aangan pass; without it the server answers 402 fee_required
      // and the traveller picks ₹1 for this booking or the ₹12 pass (BookingFeeModal).
      try {
        const { data: checkout } = await api.post(`/bookings/${data.booking.id}/checkout`);
        clearDraft(id);
        setConfirm({ open: true, data: checkout.booking });
      } catch (e) {
        if (e?.response?.status === 402 && e?.response?.data?.code === 'fee_required') {
          clearDraft(id);
          setFeeFor(data.booking.id);
          return;
        }
        if (e?.response?.status === 409 && e?.response?.data?.code === 'awaiting_host') {
          clearDraft(id);
          setRequested(data.booking);
          return;
        }
        throw e;
      }
    } catch (e) {
      // A voucher the server no longer accepts would fail every retry: drop it, as the app does.
      if (form.voucher_id && /voucher/i.test(e?.response?.data?.detail || '')) setForm((f) => ({ ...f, voucher_id: undefined, voucher_pct: undefined }));
      setMsg(e?.response?.data?.detail || e.message || t('booking.failed'));
    } finally {
      setBusy(false);
    }
  };

  /** The fee sheet sent the request: show "Request sent", or confirm one no host has to accept. */
  const afterSent = async (sent: any) => {
    setFeeFor(null);
    if (!item) return;
    clearDraft(id);
    if (sent?.awaiting_host) { setRequested(sent); return; }
    try {
      const { data: checkout } = await api.post(`/bookings/${sent.id}/checkout`);
      setConfirm({ open: true, data: checkout.booking });
    } catch (e) {
      setMsg(e?.response?.data?.detail || e.message || t('booking.failed'));
    }
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
    confirm, setConfirm,
    feeFor, setFeeFor,
    requested, setRequested,
    doBook,
    afterSent,
    validate,
  };
}

export type BookingFlow = ReturnType<typeof useBookingFlow>;
