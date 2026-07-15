interface PaymentsTabProps {
  payments: any[];
}

/**
 * PaymentsTab displays payment logs, order references, dates, and amounts
 * to track platform transaction revenue.
 */
export default function PaymentsTab({ payments }: PaymentsTabProps) {
  return (
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
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] text-sm text-ink">
            {payments.map((pm) => (
              <tr key={pm.id} className="hover:bg-mist/40 transition-colors">
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
                    pm.status === 'paid' ? 'bg-pine/10 text-pine' : 'bg-flag/10 text-flag'
                  }`}>
                    {pm.status}
                  </span>
                </td>

                {/* Transaction Date */}
                <td className="p-4 text-xs text-ink-soft">
                  {pm.paidAt ? new Date(pm.paidAt).toLocaleString() : 'N/A'}
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
  );
}
