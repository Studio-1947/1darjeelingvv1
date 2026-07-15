import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
}

/**
 * StatCard component renders a single statistic panel with an icon.
 */
export default function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  return (
    <div className="mist-panel p-5 flex items-center justify-between gap-4">
      <div>
        <div className="text-xs uppercase font-bold tracking-widest text-ink-soft">{label}</div>
        <div className="mt-1 font-display font-extrabold text-3xl text-ink">{value}</div>
      </div>
      <div className={`w-12 h-12 rounded-xl grid place-items-center ${color}`}>
        <Icon size={22} />
      </div>
    </div>
  );
}
