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

// Razorpay checkout loader
export const loadRazorpay = () =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

export async function payWithRazorpay({ flow, reference_id, name, description, prefill = {} }) {
  const ok = await loadRazorpay();
  if (!ok) throw new Error('Razorpay SDK failed to load');
  const { data } = await api.post('/payments/order', { flow, reference_id });
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay({
      key: data.key_id,
      amount: data.order.amount,
      currency: 'INR',
      name: name || '1 Darjeeling',
      description: description || 'Payment',
      order_id: data.order.id,
      prefill,
      theme: { color: '#2C5E3B' },
      modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
      handler: async (resp) => {
        try {
          await api.post('/payments/verify', { ...resp, flow, reference_id });
          resolve(resp);
        } catch (e) { reject(e); }
      },
    });
    rzp.open();
  });
}
