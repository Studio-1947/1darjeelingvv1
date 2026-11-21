import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface BookingsTabProps {
  bookings: any[];
  /** Reload after the team accepts or cancels a booking. */
  onChanged?: () => void;
}

type Filter = 'all' | 'waiting' | 'accepted' | 'confirmed' | 'cancelled';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'waiting', label: 'Waiting for host' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'cancelled', label: 'Cancelled' },
];

function statusOf(bk: any): { label: string; cls: string } {
  if (bk.awaitingHost) return { label: 'waiting for host', cls: 'bg-gold/15 text-gold-dark' };
  if (bk.status === 'confirmed') return { label: 'confirmed', cls: 'bg-pine/10 text-pine' };
  if (bk.status === 'accepted') return { label: 'accepted, guest to confirm', cls: 'bg-emerald-50 text-emerald-700' };
  if (bk.status === 'cancelled') return { label: 'cancelled', cls: 'bg-flag/10 text-flag' };
  return { label: bk.status?.replace('_', ' '), cls: 'bg-gold/10 text-gold-dark' };
}

/**
 * Every booking, newest first, with the guest's contact. The team can step in for a host:
 * accept a request that is waiting (board: "Waiting for approval"), or cancel a booking
 * (the server refunds anything paid for it).
 */
export default function BookingsTab({ bookings, onChanged }: BookingsTabProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [askCancel, setAskCancel] = useState<string | null>(null);
  const [error, setError] = useState('');

  const shown = bookings.filter((bk) =>
    filter === 'all' ? true
      : filter === 'waiting' ? bk.awaitingHost
        : bk.status === filter && !bk.awaitingHost);
  const waitingCount = bookings.filter((bk) => bk.awaitingHost).length;

  const act = async (bk: any, action: 'accept' | 'cancel') => {
    setBusy(bk.id);
    setError('');
    try {
      await api.patch(`/bookings/${bk.id}/${action === 'accept' ? 'confirm' : 'cancel'}`);
      setAskCancel(null);
      onChanged?.();
    } catch (e: any) {
      setError(e?.response?.data?.detail || `Could not ${action} this booking.`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter bookings">
        {FILTERS.map(({ key, label }) => (
          <button key={key} role="tab" aria-selected={filter === key} onClick={() => setFilter(key)}
            data-testid={`bookings-filter-${key}`}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${filter === key ? 'bg-ink text-white border-ink' : 'border-[var(--line)] text-ink-soft hover:text-ink'}`}>
            {label}{key === 'waiting' && waitingCount ? ` (${waitingCount})` : ''}
          </button>
        ))}
      </div>
      {error && <p className="text-sm font-semibold text-flag">{error}</p>}

      <div className="mist-panel overflow-hidden border border-[var(--line)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-mist text-ink-soft text-xs uppercase font-bold tracking-wider border-b border-[var(--line)]">
                <th className="p-4">Listing</th>
                <th className="p-4">Guest</th>
                <th className="p-4">Dates</th>
                <th className="p-4">Guests</th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] text-sm text-ink">
              {shown.map((bk) => {
                const s = statusOf(bk);
                return (
                  <tr key={bk.id} className="hover:bg-mist/40 transition-colors" data-testid={`admin-booking-${bk.id}`}>
                    <td className="p-4">
                      <div className="font-bold">{bk.listingTitle}</div>
                      <div className="text-xs text-ink-soft capitalize">{bk.listingType}</div>
                      {bk.services?.length > 0 && <div className="text-xs text-ink-soft">Asked for: {bk.services.join(', ')}</div>}
                    </td>
                    <td className="p-4">
                      <div className="font-semibold">{bk.guestName || '—'}</div>
                      {bk.guestPhone && <a href={`tel:${bk.guestPhone}`} className="text-xs text-pine font-semibold">{bk.guestPhone}</a>}
                    </td>
                    <td className="p-4 text-xs text-ink-soft">
                      {bk.checkIn ? `${bk.checkIn}${bk.checkOut ? ` to ${bk.checkOut}` : ''}` : 'N/A'}
                      <div className="mt-0.5">Made {new Date(bk.createdAt).toLocaleDateString()}</div>
                    </td>
                    <td className="p-4 font-semibold">{bk.guests}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${s.cls}`}>{s.label}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        {bk.awaitingHost && (
                          <button onClick={() => act(bk, 'accept')} disabled={busy === bk.id} data-testid={`admin-booking-accept-${bk.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-pine text-white text-xs font-bold btn-hover disabled:opacity-50">
                            {busy === bk.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Accept for host
                          </button>
                        )}
                        {bk.status !== 'cancelled' && (askCancel === bk.id ? (
                          <span className="inline-flex items-center gap-2 text-xs">
                            <span className="text-ink-soft">Cancel{bk.status === 'confirmed' ? ' and refund' : ''}?</span>
                            <button onClick={() => act(bk, 'cancel')} disabled={busy === bk.id} className="font-bold text-flag">Yes</button>
                            <button onClick={() => setAskCancel(null)} className="font-bold text-ink-soft">No</button>
                          </span>
                        ) : (
                          <button onClick={() => setAskCancel(bk.id)} data-testid={`admin-booking-cancel-${bk.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-flag/40 text-flag text-xs font-bold btn-hover">
                            <XCircle size={13} /> Cancel
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && (
            <div className="p-8 text-center text-ink-soft">No booking records found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
