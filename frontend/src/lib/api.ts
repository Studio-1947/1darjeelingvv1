import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

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
