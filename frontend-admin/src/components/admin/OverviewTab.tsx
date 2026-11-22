import { useEffect, useState } from 'react';
import { Database, Loader2, Power } from 'lucide-react';
import { Link } from 'react-router-dom';

import api from '@/lib/api';

interface OverviewTabProps {
  stats: Record<string, any> | null;
  onSeed: () => Promise<void>;
}

type Maintenance = {
  enabled: boolean;
  source: 'admin' | 'env';
  env_default: boolean;
  updated_at: string | null;
};

const errText = (e: any, fallback: string) => e?.response?.data?.detail || fallback;

/**
 * The website's "Under maintenance" switch (backend lib/siteSettings.ts). The admin's choice beats
 * the server's MAINTENANCE .env value until it is reset; the Android app and this panel keep
 * working either way.
 */
function MaintenanceSwitch() {
  const [state, setState] = useState<Maintenance | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/admin/settings/maintenance')
      .then(({ data }) => setState(data))
      .catch((e) => setMessage(errText(e, 'Could not read the maintenance switch.')));
  }, []);

  const set = async (enabled: boolean | null, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setMessage('');
    try {
      const { data } = await api.put('/admin/settings/maintenance', { enabled });
      setState(data);
    } catch (e) {
      setMessage(errText(e, 'That did not work. Nothing was changed.'));
    } finally {
      setBusy(false);
    }
  };

  const on = !!state?.enabled;
  return (
    <div className="mist-panel p-6" data-testid="maintenance-switch">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h3 className="font-display font-bold text-lg text-ink">Website maintenance</h3>
            {state && (
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${on ? 'bg-flag/10 text-flag' : 'bg-pine/10 text-pine'}`}
                data-testid="maintenance-state">
                {on ? 'ON' : 'OFF'}
              </span>
            )}
          </div>
          <p className="text-sm text-ink-soft mt-2 leading-relaxed">
            {on
              ? 'Visitors to the website see the "Under maintenance" screen instead of any page.'
              : 'The website is open to everyone.'}{' '}
            The Android app and this admin panel keep working either way. Open tabs pick up a change within about two minutes.
          </p>
          {state && (
            <p className="text-xs text-ink-soft mt-1">
              {state.source === 'admin'
                ? `Set from this panel${state.updated_at ? ` on ${new Date(state.updated_at).toLocaleString()}` : ''}. The server default is ${state.env_default ? 'on' : 'off'}.`
                : `Following the server default (MAINTENANCE in .env: ${state.env_default ? 'on' : 'off'}).`}
            </p>
          )}
        </div>
        {state && (
          <div className="flex flex-col items-stretch gap-2 shrink-0">
            <button
              onClick={() => set(!on, on
                ? 'Turn maintenance OFF? The website opens to everyone again.'
                : 'Turn maintenance ON? Every visitor to the website will see the "Under maintenance" screen.')}
              disabled={busy}
              className={`py-3 px-5 rounded-xl text-white font-bold btn-hover flex items-center justify-center gap-2 disabled:opacity-50 ${on ? 'bg-pine' : 'bg-flag'}`}
              data-testid="maintenance-toggle"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />}
              {on ? 'Turn maintenance off' : 'Turn maintenance on'}
            </button>
            {state.source === 'admin' && state.env_default !== on && (
              <button
                onClick={() => set(null, `Go back to the server default? Maintenance will be ${state.env_default ? 'ON' : 'OFF'}.`)}
                disabled={busy}
                className="text-xs font-bold text-ink-soft hover:text-ink disabled:opacity-50"
              >
                Use server default ({state.env_default ? 'on' : 'off'})
              </button>
            )}
          </div>
        )}
      </div>
      {message && <div className="text-xs font-bold text-flag mt-3">{message}</div>}
    </div>
  );
}

/**
 * OverviewTab displays business statistics conversions and development tools, and the website's
 * maintenance switch.
 */
export default function OverviewTab({ stats, onSeed }: OverviewTabProps) {
  const usersCount = stats?.users || 0;
  const providersCount = stats?.providers || 0;
  // Live business listings, not every row (spots, events, drafts and hosts not live are left out).
  const listingsCount = stats?.active_services ?? stats?.listings ?? 0;
  const bookingsCount = stats?.bookings || 0;


  // Compute metrics safely to avoid NaN division errors
  const providerRate = usersCount > 0 ? Math.round((providersCount / usersCount) * 100) : 0;
  const bookingsPerService = listingsCount > 0 ? (bookingsCount / listingsCount).toFixed(1) : '0';
  // Bookings whose fee was paid, over bookings (host plans and passes are payments too, but not bookings).
  const paidBookings = stats?.paid_bookings ?? 0;
  const paymentRate = bookingsCount > 0 ? Math.min(100, Math.round((paidBookings / bookingsCount) * 100)) : 0;

  return (
    <div className="space-y-6">
      <MaintenanceSwitch />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Insights Block */}
        <div className="mist-panel p-6">
          <h3 className="font-display font-bold text-lg text-ink mb-4">Quick Insights</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-[var(--line)]">
              <span className="text-sm text-ink-soft">Business Conversion Rate</span>
              <span className="text-sm font-bold text-ink">{providerRate}%</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[var(--line)]">
              <span className="text-sm text-ink-soft">Bookings per Active Service</span>
              <span className="text-sm font-bold text-ink">{bookingsPerService}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[var(--line)]">
              <span className="text-sm text-ink-soft">Paid Bookings Rate</span>
              <span className="text-sm font-bold text-ink">{paymentRate}%</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[var(--line)]">
              <span className="text-sm text-ink-soft">Active aangan passes</span>
              <span className="text-sm font-bold text-ink" data-testid="stat-active-passes">{stats?.active_passes ?? 0}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[var(--line)]">
              <span className="text-sm text-ink-soft">Travellers who set up their profile</span>
              <span className="text-sm font-bold text-ink">{stats?.traveller_profiles ?? 0}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[var(--line)]">
              <span className="text-sm text-ink-soft">Comments on host posts</span>
              <span className="text-sm font-bold text-ink">{stats?.post_comments ?? 0}</span>
            </div>
            <Link to="/feedback" className="flex justify-between items-center py-2 hover:text-flag" data-testid="stat-open-feedback">
              <span className="text-sm text-ink-soft">Open feedback (travellers + hosts)</span>
              <span className="text-sm font-bold text-flag">{stats?.open_feedback ?? 0} →</span>
            </Link>
            <Link to="/deliveries" className="flex justify-between items-center py-2 border-t border-[var(--line)] hover:text-flag" data-testid="stat-open-deliveries">
              <span className="text-sm text-ink-soft">Home delivery requests waiting for a place</span>
              <span className="text-sm font-bold text-flag">{stats?.open_deliveries ?? 0} →</span>
            </Link>
          </div>
        </div>

        {/* Database Seeding Utility */}
        <div className="mist-panel p-6">
          <h3 className="font-display font-bold text-lg text-ink mb-4">System Utilities</h3>
          <p className="text-sm text-ink-soft mb-6 leading-relaxed">
            Use the seed button below to repopulate the environment with default testing services, homestays, spots, and driver listings.
          </p>
          <button
            onClick={onSeed}
            className="w-full py-3 rounded-xl bg-flag text-white font-bold btn-hover flex items-center justify-center gap-2"
          >
            <Database size={16} /> Seed Sample Content
          </button>
        </div>
      </div>
    </div>
  );
}
