import { useState } from 'react';
import api from '@/lib/api';

interface PaymentsTabProps {
  payments: any[];
  /** Refetches the admin tables after a refund, so the row reflects its new state. */
  onRefunded?: () => void;
}

/** Paise as rupees, with paise only when there are some. */
const inr = (paise: number) => {
  const whole = paise % 100 === 0;
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
};

/** Our own state code (WBIN 1947 Studio LLP, West Bengal): a buyer in the same state pays CGST + SGST, anyone else IGST. */
const SUPPLIER_STATE = '19';

/**
 * Host plans paid by a GST-registered business (payments.billing, backend lib/gstin.ts), as a CSV
 * for the B2B part of the GST return: one row per paid, unrefunded payment, amounts in rupees.
 */
function downloadB2bCsv(payments: any[]) {
  const rs = (paise: number) => (paise / 100).toFixed(2);
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = payments
    .filter((pm) => pm.billing?.gstin && pm.status === 'paid' && pm.breakup)
    .sort((a, b) => String(a.paidAt || a.createdAt).localeCompare(String(b.paidAt || b.createdAt)))
    .map((pm) => {
      const { base, gst } = pm.breakup;
      const intra = pm.billing.state_code === SUPPLIER_STATE;
      const half = Math.round(gst / 2);
      return [
        (pm.paidAt || pm.createdAt || '').slice(0, 10), pm.paymentId || pm.orderId, pm.billing.gstin, pm.billing.legal_name,
        pm.billing.state_code, intra ? 'Intra-state' : 'Inter-state', flowLabel(pm), rs(base), pm.breakup.gst_rate ?? 18,
        intra ? '0.00' : rs(gst), intra ? rs(half) : '0.00', intra ? rs(gst - half) : '0.00', rs(pm.amount),
      ].map(cell).join(',');
    });
  const head = ['Date', 'Payment ID', 'Buyer GSTIN', 'Legal name', 'Place of supply (state code)', 'Supply', 'For', 'Taxable value', 'GST rate %', 'IGST', 'CGST', 'SGST', 'Invoice total']
    .map(cell).join(',');
  const blob = new Blob([[head, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `aangan-gst-b2b-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** What a payment was for, in words. The pass is ₹12 the first time and ₹99 after that. */
const flowLabel = (pm: any) => {
  if (pm.flow === 'platform_support') {
    if (pm.breakup?.base === 9900) return 'aangan pass · renewal';
    if (pm.breakup?.base === 1200) return 'aangan pass · first year';
    return 'aangan pass';
  }
  return ({
    booking_commission: 'Booking fee (₹1)',
    provider_registration: 'Host plan · first year (older app)',
    provider_renewal: 'Host plan · renewal (older app)',
    // One listing's yearly membership (plans are per listing since 2026-11-25).
    listing_plan: 'Listing membership · first year',
    listing_renewal: 'Listing membership · renewal',
    donation: 'Donation',
  } as Record<string, string>)[pm.flow] || pm.flow;
};

/**
 * PaymentsTab displays payment logs, order references, dates and amounts, and is where an
 * operator returns money.
 *
 * The refund column is not decoration. `lib/refunds.ts` deliberately never throws  it runs after
 * the money has moved and the cancellation has already committed, so a Razorpay outage records the
 * debt instead of failing the request. A payment left `paid` with a refund reason on it is money
 * the platform owes and has not returned, which is why those rows are called out here rather than
 * left to look like any other paid row.
 */
export default function PaymentsTab({ payments, onRefunded }: PaymentsTabProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [owedOnly, setOwedOnly] = useState(false);

  /** A payment that was charged, is owed back, and whose refund has not gone through. */
  const isOwed = (pm: any) => pm.status === 'paid' && pm.refundReason && !pm.refundedAt;
  const owedCount = payments.filter(isOwed).length;
  const b2bCount = payments.filter((pm) => pm.billing?.gstin && pm.status === 'paid').length;

  const handleRefund = async (pm: any) => {
    const label = `₹${(pm.amount / 100).toLocaleString('en-IN')} (${pm.flow})`;
    if (!window.confirm(`Refund ${label}?\n\nThis sends the money back to the original payment method and cannot be undone from here.`)) {
      return;
    }
    setBusyId(pm.id);
    setMsg('');
    try {
      const res = await api.post(`/admin/payments/${pm.id}/refund`, { reason: 'refunded by admin' });
      // The endpoint is idempotent: an already-refunded payment answers 200 with refunded=false
      // rather than sending a second refund to the gateway. Say which of the two happened.
      setMsg(res.data?.refunded ? `Refunded ${label}.` : `${label} was already refunded  nothing sent.`);
      onRefunded?.();
    } catch (e: any) {
      // A gateway refusal is a 502 here, never a silent success  the money really is still held.
      setMsg(e?.response?.data?.detail || 'Refund failed. The payment is still marked as owed; try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {owedCount > 0 && (
        <div className="rounded-2xl border border-flag/30 bg-flag/5 p-4 text-sm text-ink">
          <span className="font-bold text-flag">{owedCount} payment{owedCount === 1 ? '' : 's'} owed a refund.</span>{' '}
          A refund was attempted and the gateway refused it, so this money is still with the platform.
          Retry each one below.
          <button type="button" onClick={() => setOwedOnly((v) => !v)} data-testid="payments-owed-only"
            className="ml-2 font-bold text-flag underline underline-offset-2">
            {owedOnly ? 'Show all payments' : 'Show only these'}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft">
        <span>{b2bCount} paid host plan{b2bCount === 1 ? '' : 's'} invoiced to a GSTIN (B2B).</span>
        <button type="button" onClick={() => downloadB2bCsv(payments)} disabled={b2bCount === 0} data-testid="payments-gst-csv"
          className="rounded-full border border-[var(--line)] px-4 py-2 font-bold text-ink hover:bg-mist disabled:opacity-50">
          Export GST (B2B) CSV
        </button>
      </div>

      {msg && (
        <div className="rounded-2xl border border-[var(--line)] bg-mist p-4 text-sm text-ink" role="status">{msg}</div>
      )}

      <div className="mist-panel overflow-hidden border border-[var(--line)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-mist text-ink-soft text-xs uppercase font-bold tracking-wider border-b border-[var(--line)]">
                <th className="p-4">Flow / Order ID</th>
                <th className="p-4">Reference ID</th>
                <th className="p-4">Amount</th>
                <th className="p-4">Status</th>
                <th className="p-4">Transaction Date</th>
                <th className="p-4">Refund</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] text-sm text-ink">
              {payments.filter((pm) => !owedOnly || isOwed(pm)).map((pm) => (
                <tr key={pm.id} className={`transition-colors ${isOwed(pm) ? 'bg-flag/5' : 'hover:bg-mist/40'}`}>
                  {/* Flow type and Order Id */}
                  <td className="p-4">
                    <div className="font-bold">{flowLabel(pm)}</div>
                    <div className="text-xs text-ink-soft font-mono select-all">{pm.orderId}</div>
                    {/* Invoiced to the host's GST registration (B2B), when they gave one. */}
                    {pm.billing?.gstin && (
                      <div className="mt-1 text-xs text-ink" data-testid={`payment-gstin-${pm.id}`}>
                        <span className="font-mono select-all">GSTIN {pm.billing.gstin}</span> · {pm.billing.legal_name}
                      </div>
                    )}
                  </td>

                  {/* Gateway reference */}
                  <td className="p-4 font-mono text-xs text-ink-soft select-all">{pm.referenceId}</td>

                  {/* Transaction Amount (converted from paisa) */}
                  <td className="p-4 text-ink">
                    <div className="font-bold">{inr(pm.amount)}</div>
                    {/* Stored at order time: base, 18% GST and the platform fee (2% on orders before 2026-11-23, 0 since). */}
                    {pm.breakup ? (
                      <div className="text-[11px] text-ink-soft leading-snug mt-0.5" data-testid={`payment-breakup-${pm.id}`}>
                        {inr(pm.breakup.base)} + GST {inr(pm.breakup.gst)}
                        {pm.breakup.platform_fee ? ` + fee ${inr(pm.breakup.platform_fee)}` : ''}
                      </div>
                    ) : null}
                  </td>

                  {/* Payment status badge */}
                  <td className="p-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${pm.status === 'refunded' ? 'bg-ink/10 text-ink-soft'
                        : pm.status === 'paid' ? 'bg-pine/10 text-pine'
                          : 'bg-flag/10 text-flag'
                      }`}>
                      {pm.status}
                    </span>
                  </td>

                  {/* Transaction Date */}
                  <td className="p-4 text-xs text-ink-soft">
                    {pm.paidAt ? new Date(pm.paidAt).toLocaleString() : 'N/A'}
                  </td>

                  {/* Refund state and action */}
                  <td className="p-4 text-xs">
                    {pm.refundedAt ? (
                      <div className="text-ink-soft">
                        <div className="font-bold text-ink">Refunded</div>
                        <div>{new Date(pm.refundedAt).toLocaleDateString()}</div>
                        {pm.refundReason && <div className="mt-0.5 italic">{pm.refundReason}</div>}
                      </div>
                    ) : isOwed(pm) ? (
                      <div className="space-y-1.5">
                        <div className="font-bold text-flag">Owed</div>
                        {pm.refundError && <div className="text-ink-soft italic">{pm.refundError}</div>}
                        <button
                          onClick={() => handleRefund(pm)}
                          disabled={busyId === pm.id}
                          className="px-2.5 py-1 rounded-full bg-flag text-white font-bold disabled:opacity-50"
                        >
                          {busyId === pm.id ? 'Retrying…' : 'Retry refund'}
                        </button>
                      </div>
                    ) : pm.status === 'paid' ? (
                      <button
                        onClick={() => handleRefund(pm)}
                        disabled={busyId === pm.id}
                        className="px-2.5 py-1 rounded-full border border-[var(--line)] text-ink-soft font-bold hover:text-ink disabled:opacity-50"
                      >
                        {busyId === pm.id ? 'Refunding…' : 'Refund'}
                      </button>
                    ) : (
                      // Never settled, so there is nothing to send back.
                      <span className="text-ink-soft"></span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {payments.length === 0 && (
            <div className="p-8 text-center text-ink-soft">No payment records found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
