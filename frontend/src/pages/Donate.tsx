import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check } from '@phosphor-icons/react';
import { Box, Button, ButtonLink, Chip, Chips, PageHead, TextField } from '@/components/ag';
import { useAuth } from '@/context/AuthContext';
import { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import MockPaymentModal from '@/components/MockPaymentModal';
import { useSeo } from '@/components/Seo';

// Mirrors DONATION_MIN_PAISE / DONATION_MAX_PAISE in backend/src/config.ts. This copy exists to
// give immediate feedback, not to enforce anything  the server's check is the real one, and it
// re-validates every amount regardless of what happens here.
const MIN_PAISE = 1000;
const MAX_PAISE = 10_000_000;

const PRESETS_PAISE = [10000, 25000, 50000, 100000];

export default function Donate() {
  const { t } = useTranslation();
  useSeo({ title: t('donate.title'), description: t('donate.lead') });
  const { user } = useAuth();
  const nav = useNavigate();

  const [selected, setSelected] = useState<number | null>(PRESETS_PAISE[1]);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [payModal, setPayModal] = useState<any>(null);
  const [thanks, setThanks] = useState<number | null>(null);

  // Donations are for signed-in users only, so the payment is attributable. Preserve the
  // destination so logging in returns them here rather than dumping them on the feed.
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent('/donate')}`} replace />;

  // A custom entry always wins over a preset  it is the field the user touched most recently in
  // any flow that reaches here, and silently charging the preset instead would be theft-adjacent.
  const customPaise = custom.trim() === '' ? null : Math.round(Number(custom) * 100);
  const amountPaise = customPaise !== null ? customPaise : selected;

  const valid =
    amountPaise !== null &&
    Number.isFinite(amountPaise) &&
    Number.isInteger(amountPaise) &&
    amountPaise >= MIN_PAISE &&
    amountPaise <= MAX_PAISE;

  const rupees = (paise: number) => (paise / 100).toLocaleString('en-IN');

  const donate = async () => {
    if (!valid || amountPaise === null) {
      setErr(t('donate.invalid'));
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const order = await createPaymentOrder({
        flow: 'donation',
        reference_id: user.id,
        amount: amountPaise,
      });
      if (order.mock) {
        setPayModal({ amount: order.amount, order: order.order });
      } else {
        await payWithRazorpay({
          order: order.order,
          key_id: order.key_id,
          flow: 'donation',
          reference_id: user.id,
          description: t('donate.modal_title'),
          prefill: { contact: user.phone, name: user.name },
        });
        // Trust the order's amount, not the local state, in case anything diverged.
        setThanks(order.amount);
      }
    } catch (e: any) {
      setErr(e?.response?.data?.detail || t('donate.error'));
    } finally {
      setBusy(false);
    }
  };

  const finishMockPayment = async () => {
    try {
      const res = await completeMockPayment({
        order_id: payModal.order.id,
        flow: 'donation',
        reference_id: user.id,
      });
      setPayModal(null);
      // The figure comes from the server's record of the order, never from local state.
      setThanks(res?.record?.amount ?? payModal.amount);
    } catch (e: any) {
      setPayModal(null);
      setErr(e?.response?.data?.detail || t('donate.error'));
    }
  };

  if (thanks !== null) {
    return (
      <div className="ag-wrap">
        <div className="ag-main">
          <div className="ag-done" data-testid="donate-thanks">
            <span className="big"><Check weight="bold" /></span>
            <h1 className="m-0 font-medium text-[28px] leading-[34px] text-[var(--ink7)]">{t('donate.thanks', { amount: rupees(thanks) })}</h1>
            <Button variant="primary" go block onClick={() => nav('/', { replace: true })} data-testid="donate-done">{t('donate.back')}</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ag-wrap">
      <div className="ag-main" data-testid="donate-screen">
        <PageHead eyebrow={t('ui.donate.eyebrow', 'Support aangan')} title={t('donate.title')} />
        <p className="text-[var(--ink7)]">{t('donate.lead')}</p>

        <Box>
          <span className="ag-eyebrow">{t('donate.choose')}</span>
          <Chips>
            {PRESETS_PAISE.map((p) => (
              <Chip key={p} on={custom.trim() === '' && selected === p} onClick={() => { setSelected(p); setCustom(''); setErr(''); }}
                data-testid={`donate-preset-${p}`}>
                ₹{rupees(p)}
              </Chip>
            ))}
          </Chips>
          <TextField label={t('donate.custom')} value={custom} onChange={(e) => { setCustom(e.target.value); setErr(''); }}
            inputMode="decimal" data-testid="donate-custom" placeholder="₹ 500" />
        </Box>

        <div className="flex flex-col gap-2">
          <Button variant="primary" go block onClick={donate} disabled={busy || !valid} data-testid="donate-pay">
            {busy
              ? t('common.loading')
              : t('donate.cta', { amount: valid && amountPaise !== null ? rupees(amountPaise) : '' })}
          </Button>
          <p className="ag-small !text-xs text-center">{t('donate.note')}</p>
        </div>

        {err && <p data-testid="donate-error" role="alert" className="ag-err !text-sm text-center">{err}</p>}

        <ButtonLink to="/" variant="text" className="self-center" data-testid="donate-back">{t('donate.back')}</ButtonLink>
      </div>

      <MockPaymentModal
        open={!!payModal}
        onClose={() => setPayModal(null)}
        amount={payModal?.amount || 0}
        title={t('donate.modal_title')}
        description=""
        onPay={finishMockPayment}
        prefill={{ upi: `${(user.name || 'traveller').toLowerCase().replace(/\s+/g, '')}@ybl` }}
      />
    </div>
  );
}
