import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import api from '@/lib/api';

type Preview = {
  users: number;
  travellers: number;
  hosts: number;
  listings: number;
  bookings: number;
  payments: number;
  settled_payments: number;
  kyc_documents: number;
  phrase: string;
};

/**
 * Clean all live user data. Preview first, then type the phrase; the server refuses without it.
 * Admin accounts, curated spots/events and promotions are never touched.
 */
export default function CleanupPanel({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setMessage('');
    setBusy(true);
    try {
      const res = await api.get('/admin/cleanup/preview');
      setPreview(res.data);
      setOpen(true);
    } catch (e: any) {
      setMessage(e?.response?.data?.detail || 'Could not load the preview.');
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!preview || typed !== preview.phrase) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await api.post('/admin/cleanup/users', { mode: 'all', confirm: typed });
      setMessage(
        `Deleted ${res.data.deleted} account(s)` +
          (res.data.failed ? `; ${res.data.failed} could not be deleted - check the server log.` : '.')
      );
      setOpen(false);
      setPreview(null);
      setTyped('');
      onDone();
    } catch (e: any) {
      setMessage(e?.response?.data?.detail || 'The clean-up failed.');
    } finally {
      setBusy(false);
    }
  };

  const rows: [string, number][] = preview
    ? [
        ['Accounts', preview.users],
        ['Travellers', preview.travellers],
        ['Hosts / businesses', preview.hosts],
        ['Their listings', preview.listings],
        ['Bookings', preview.bookings],
        ['Payments (all)', preview.payments],
        ['  of which settled', preview.settled_payments],
        ['KYC documents', preview.kyc_documents],
      ]
    : [];

  return (
    <div className="mist-panel border border-flag/30 p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-bold text-ink flex items-center gap-2">
            <AlertTriangle size={16} className="text-flag" /> Clean user data
          </div>
          <p className="text-xs text-ink-soft mt-1">
            Removes every traveller and host with their listings, bookings, payments, reviews and uploaded
            documents. Admin accounts, curated spots and promotions stay. Take a database backup first;
            this cannot be undone.
          </p>
        </div>
        {!open && (
          <button
            onClick={load}
            disabled={busy}
            className="shrink-0 px-4 py-2 rounded-lg border border-flag/40 text-flag text-xs font-bold hover:bg-flag/5 cursor-pointer disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : 'Review what will be deleted'}
          </button>
        )}
      </div>

      {open && preview && (
        <div className="space-y-3">
          <table className="text-sm text-ink w-full max-w-sm">
            <tbody>
              {rows.map(([label, n]) => (
                <tr key={label} className="border-b border-[var(--line)]">
                  <td className="py-1 whitespace-pre">{label}</td>
                  <td className="py-1 text-right font-bold">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="block text-xs text-ink-soft">
            Type <span className="font-bold text-ink">{preview.phrase}</span> to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1 block w-full max-w-sm px-3 py-2 rounded-lg border border-[var(--line)] text-sm text-ink bg-white"
              autoComplete="off"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={run}
              disabled={busy || typed !== preview.phrase || preview.users === 0}
              className="px-4 py-2 rounded-lg bg-flag text-white text-xs font-bold disabled:opacity-40 cursor-pointer"
            >
              {busy ? 'Deleting...' : 'Delete everything listed'}
            </button>
            <button
              onClick={() => { setOpen(false); setTyped(''); }}
              className="px-4 py-2 rounded-lg border border-[var(--line)] text-xs font-bold text-ink-soft cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && <div className="text-xs font-bold text-ink">{message}</div>}
    </div>
  );
}
