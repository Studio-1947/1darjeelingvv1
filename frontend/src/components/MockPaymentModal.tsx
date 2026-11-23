import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleNotch as Loader2 } from '@phosphor-icons/react';
import { Icon } from '@/components/ag/Icon';
import Logo from '@/components/Logo';
import { rupees } from '@/lib/prices';
import { Button, Seg, SelectField, TextField } from '@/components/ag';
import Sheet from '@/components/listing-detail/Sheet';

/**
 * Dummy payment gateway modal - mimics a real Razorpay-style checkout
 * without hitting any real gateway. Used when MOCK_PAYMENTS=true on backend.
 *
 * Props:
 *   open, onClose, amount (paise), title, description, onPay (async), onSuccess
 */
export default function MockPaymentModal({ open, onClose, amount, title, description = '', onPay, prefill = {} as any }: { open: boolean, onClose: () => void, amount: number, title?: string, description?: string, onPay: () => Promise<void>, prefill?: any }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<'upi' | 'card' | 'netbank'>('upi');
  const [done, setDone] = useState(false);

  if (!open) return null;

  // ₹588.82, not ₹589: totals carry GST, so paise matter.
  const shown = rupees(amount || 0).replace(/^₹/, '');

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
    <Sheet onClose={onClose} labelledBy="mock-pay-title" testid="mock-payment-modal" closeTestid="mock-payment-close">
      <div className="flex items-center gap-2 pr-10">
        <Logo className="w-8 h-8" />
        <div className="min-w-0">
          <div className="ag-lead !text-[14px] !leading-5">{t('pay.secure')}</div>
          <div className="ag-small !text-[12px] !leading-4 inline-flex items-center gap-1"><Icon name="badge" size={14} className="text-[var(--ok)]" /> {t('pay.sandbox')}</div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="ag-eyebrow">{title ?? t('pay.title')}</span>
        <p id="mock-pay-title" className="m-0 flex items-baseline gap-2 flex-wrap">
          <span className="text-[34px] leading-[38px] font-medium text-[var(--ink-strong)] tabular-nums">₹{shown}</span>
          {description && <span className="ag-small">{description}</span>}
        </p>
      </div>

      <span className="ag-eyebrow">{t('pay.pay_with')}</span>
      <Seg label={t('pay.pay_with')} value={method} onChange={(v) => setMethod(v as typeof method)} options={[
        { value: 'upi', label: t('pay.upi'), testId: 'mock-method-upi' },
        { value: 'card', label: t('pay.card'), testId: 'mock-method-card' },
        { value: 'netbank', label: t('pay.netbanking'), testId: 'mock-method-netbank' },
      ]} />

      {/* Stand-in fields so the sandbox reads like a checkout; nothing typed here is sent. */}
      {method === 'upi' && <TextField label={t('pay.upi_id')} defaultValue={prefill.upi || 'user@ybl'} />}
      {method === 'card' && (
        <div className="grid gap-2">
          <TextField aria-label={t('pay.card')} defaultValue="4111 1111 1111 1111" inputMode="numeric" />
          <div className="grid grid-cols-2 gap-2">
            <TextField aria-label="MM/YY" defaultValue="12/28" />
            <TextField aria-label="CVV" defaultValue="123" inputMode="numeric" />
          </div>
        </div>
      )}
      {method === 'netbank' && (
        <SelectField aria-label={t('pay.netbanking')}>
          <option>State Bank of India</option>
          <option>HDFC Bank</option>
          <option>ICICI Bank</option>
          <option>Axis Bank</option>
        </SelectField>
      )}

      <Button variant="primary" block center onClick={handlePay} disabled={busy || done} data-testid="mock-payment-pay" data-autofocus
        icon={done ? <Icon name="check" /> : busy ? <Loader2 className="animate-spin" /> : undefined}>
        {done ? t('pay.success') : busy ? t('common.processing') : t('pay.pay_amount', { amount: shown })}
      </Button>

      <p className="ag-small !text-[12px] !leading-4 text-center inline-flex items-center justify-center gap-1"><Icon name="badge" size={12} /> {t('pay.footer')}</p>
    </Sheet>
  );
}
