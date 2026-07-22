import axios from 'axios';
import { SUPPORT_ROUTE } from './support';

// Empty by default so the API is called same-origin ('/api') and nginx proxies it
// to the backend. Without the fallback, CRA inlines a missing var as the literal
// string "undefined" and every request goes to /undefined/api/... instead.
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL ?? '';
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

/**
 * True when the server is telling us the caller's support fee is not active. The status alone is
 * not enough — 402 could mean something else later — so the machine-readable code decides.
 */
export function isSupportRequiredError(error: any): boolean {
  return error?.response?.status === 402 && error?.response?.data?.code === 'support_required';
}

// SupportGate is the primary gate, but client state goes stale: a window that lapsed mid-session,
// or a second tab holding an older user object. A 402 is the server's authoritative answer, so
// honour it. A full navigation rather than a router push, because axios has no router access —
// acceptable for a path that should be rare.
//
// This is a full page load, so router state (the `state.from` SupportGate uses) cannot travel
// with it. Carry the current path + query as a `next` query param instead, so Support.tsx can
// still send the user back to what they were doing (e.g. booking a listing) after paying.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (isSupportRequiredError(error) && window.location.pathname !== SUPPORT_ROUTE) {
      const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
      window.location.assign(`${SUPPORT_ROUTE}?next=${next}`);
    }
    return Promise.reject(error);
  }
);

export default api;

// -------- Payment helpers (mock + Razorpay) --------

// -------- Type definitions for payment helpers --------
export interface PaymentOrderParams {
  flow: string;
  reference_id: string;
}

export interface MockPaymentParams {
  order_id: string;
  flow: string;
  reference_id: string;
}

export interface RazorpayPaymentParams {
  order: any;
  key_id: string;
  flow: string;
  reference_id: string;
  name?: string;
  description?: string;
  prefill?: any;
}

/**
 * Creates an order on the backend. Returns { mock, key_id, order, amount }.
 */
export async function createPaymentOrder({ flow, reference_id }: PaymentOrderParams) {
  const { data } = await api.post('/payments/order', { flow, reference_id });
  return data;
}

/**
 * Completes a mock payment on the backend.
 */
export async function completeMockPayment({ order_id, flow, reference_id }: MockPaymentParams) {
  const { data } = await api.post('/payments/mock/complete', { order_id, flow, reference_id });
  return data;
}

// Real Razorpay checkout (unchanged from before) — kept for prod use
export const loadRazorpay = () =>
  new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

export async function payWithRazorpay({ order, key_id, flow, reference_id, name, description, prefill = {} }: RazorpayPaymentParams) {
  const ok = await loadRazorpay();
  if (!ok) throw new Error('Razorpay SDK failed to load');
  return new Promise((resolve, reject) => {
    const rzp = new (window as any).Razorpay({
      key: key_id,
      amount: order.amount,
      currency: 'INR',
      name: name || '1 Darjeeling',
      description: description || 'Payment',
      order_id: order.id,
      prefill,
      theme: { color: '#2C5E3B' },
      modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
      handler: async (resp: any) => {
        try {
          await api.post('/payments/verify', { ...resp, flow, reference_id });
          resolve(resp);
        } catch (e) { reject(e); }
      },
    });
    rzp.open();
  });
}
