import React, { useState } from 'react';
import { X, Shield, CheckCircle2, IndianRupee, Loader2 } from 'lucide-react';

/**
 * Dummy payment gateway modal — mimics a real Razorpay-style checkout
 * without hitting any real gateway. Used when MOCK_PAYMENTS=true on backend.
 *
 * Props:
 *   open, onClose, amount (paise), title, description, onPay (async), onSuccess
 */
export default function MockPaymentModal({ open, onClose, amount, title = 'Complete payment', description = '', onPay, prefill = {} }) {
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState('upi');
  const [done, setDone] = useState(false);

  if (!open) return null;

  const rupees = (amount || 0) / 100;

  const handlePay = async () => {
    setBusy(true);
    try {
      // Simulate 1.5s gateway processing
      await new Promise((r) => setTimeout(r, 1200));
      await onPay();
      setDone(true);
      // Auto-close after brief success flash
      setTimeout(() => { setDone(false); onClose(); }, 800);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog" aria-modal="true" data-testid="mock-payment-modal">
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl overflow-hidden animate-fade-up">
        {/* Header */}
        <div className="flex items-center justify-between p-4 md:p-5 border-b border-[var(--line)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-display font-extrabold">১</div>
            <div>
              <div className="font-display font-bold text-sm text-ink leading-none">1 Darjeeling · Secure Pay</div>
              <div className="text-[10px] text-ink-soft flex items-center gap-1 mt-0.5"><Shield size={10} /> Sandbox mode · No real charge</div>
            </div>
          </div>
          <button onClick={onClose} data-testid="mock-payment-close" className="p-1.5 rounded-full hover:bg-mist" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 md:p-6">
          <div className="text-xs uppercase tracking-widest text-ink-soft font-bold">{title}</div>
          <div className="mt-1 flex items-baseline gap-1">
            <IndianRupee size={22} className="text-ink" />
            <span className="font-display font-extrabold text-4xl text-ink leading-none">{rupees.toFixed(rupees < 10 ? 0 : 0)}</span>
            <span className="text-sm text-ink-soft ml-2">{description}</span>
          </div>

          {/* Payment methods (mock) */}
          <div className="mt-6">
            <div className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">Pay with</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { k: 'upi', label: 'UPI' },
                { k: 'card', label: 'Card' },
                { k: 'netbank', label: 'Net Banking' },
              ].map(({ k, label }) => (
                <button key={k} onClick={() => setMethod(k)} data-testid={`mock-method-${k}`}
                  className={`py-2.5 rounded-xl border font-bold text-xs ${method === k ? 'border-pine bg-pine/10 text-pine' : 'border-[var(--line)] text-ink-soft'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Fake input for realism */}
          <div className="mt-4">
            {method === 'upi' && (
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">UPI ID</div>
                <input defaultValue={prefill.upi || 'user@ybl'} className="w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm" />
              </div>
            )}
            {method === 'card' && (
              <div className="space-y-2">
                <input defaultValue={'4111 1111 1111 1111'} className="w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <input defaultValue={'12/28'} className="w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm" />
                  <input defaultValue={'123'} className="w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm" />
                </div>
              </div>
            )}
            {method === 'netbank' && (
              <select className="w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm">
                <option>State Bank of India</option>
                <option>HDFC Bank</option>
                <option>ICICI Bank</option>
                <option>Axis Bank</option>
              </select>
            )}
          </div>

          {/* CTA */}
          <button onClick={handlePay} disabled={busy || done} data-testid="mock-payment-pay"
            className="mt-6 w-full py-3 rounded-full bg-pine text-white font-extrabold btn-hover disabled:opacity-70 flex items-center justify-center gap-2">
            {done ? (<><CheckCircle2 size={18} /> Payment successful</>) :
             busy ? (<><Loader2 size={18} className="animate-spin" /> Processing…</>) :
             (<>Pay ₹{rupees.toFixed(0)}</>)}
          </button>

          <p className="mt-3 text-[10px] text-center text-ink-soft">🔒 Encrypted. Sandbox mode — no real money is charged.</p>
        </div>
      </div>
    </div>
  );
}
