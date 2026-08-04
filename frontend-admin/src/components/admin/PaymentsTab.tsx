import { useState } from 'react';
import api from '@/lib/api';

interface PaymentsTabProps {
  payments: any[];
  /** Refetches the admin tables after a refund, so the row reflects its new state. */
  onRefunded?: () => void;
}

/**
 * PaymentsTab displays payment logs, order references, dates and amounts, and is where an
 * operator returns money.
 *
 * The refund column is not decoration. `lib/refunds.ts` deliberately never throws — it runs after
 * the money has moved and the cancellation has already committed, so a Razorpay outage records the
 * debt instead of failing the request. A payment left `paid` with a refund reason on it is money
 * the platform owes and has not returned, which is why those rows are called out here rather than
 * left to look like any other paid row.
 */
export default function PaymentsTab({ payments, onRefunded }: PaymentsTabProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  /** A payment that was charged, is owed back, and whose refund has not gone through. */
  const isOwed = (pm: any) => pm.status === 'paid' && pm.refundReason && !pm.refundedAt;
  const owedCount = payments.filter(isOwed).length;

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
      setMsg(res.data?.refunded ? `Refunded ${label}.` : `${label} was already refunded — nothing sent.`);
      onRefunded?.();
    } catch (e: any) {
      // A gateway refusal is a 502 here, never a silent success — the money really is still held.
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
        </div>
      )}

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
              {payments.map((pm) => (
                <tr key={pm.id} className={`transition-colors ${isOwed(pm) ? 'bg-flag/5' : 'hover:bg-mist/40'}`}>
                  {/* Flow type and Order Id */}
                  <td className="p-4">
                    <div className="font-bold capitalize">{pm.flow}</div>
                    <div className="text-xs text-ink-soft font-mono select-all">{pm.orderId}</div>
                  </td>

                  {/* Gateway reference */}
                  <td className="p-4 font-mono text-xs text-ink-soft select-all">{pm.referenceId}</td>

                  {/* Transaction Amount (converted from paisa) */}
                  <td className="p-4 font-bold text-ink">₹{(pm.amount / 100).toLocaleString('en-IN')}</td>

                  {/* Payment status badge */}
                  <td className="p-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      pm.status === 'refunded' ? 'bg-ink/10 text-ink-soft'
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
                      <span className="text-ink-soft">—</span>
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
