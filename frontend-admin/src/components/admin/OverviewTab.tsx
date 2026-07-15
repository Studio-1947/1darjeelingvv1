import { Database } from 'lucide-react';

interface OverviewTabProps {
  stats: Record<string, any> | null;
  onSeed: () => Promise<void>;
}

/**
 * OverviewTab displays business statistics conversions and development tools.
 */
export default function OverviewTab({ stats, onSeed }: OverviewTabProps) {
  const usersCount = stats?.users || 0;
  const providersCount = stats?.providers || 0;
  const listingsCount = stats?.listings || 0;
  const bookingsCount = stats?.bookings || 0;
  const paymentsCount = stats?.payments || 0;

  // Compute metrics safely to avoid NaN division errors
  const providerRate = usersCount > 0 ? Math.round((providersCount / usersCount) * 100) : 0;
  const bookingsPerService = listingsCount > 0 ? (bookingsCount / listingsCount).toFixed(1) : '0';
  const paymentRate = bookingsCount > 0 ? Math.round((paymentsCount / bookingsCount) * 100) : 0;

  return (
    <div className="space-y-6">
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
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-ink-soft">Paid Bookings Rate</span>
              <span className="text-sm font-bold text-ink">{paymentRate}%</span>
            </div>
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
