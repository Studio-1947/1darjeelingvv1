import React from 'react';

/** One small figure tile on the dashboard: red icon, the number, a short label. */
export function Insight({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-[18px] border border-[var(--warmline)] bg-[var(--surface)] p-3">
      <Icon size={20} className="text-[var(--r)]" aria-hidden="true" />
      <b className="text-xl leading-6 text-[var(--ink-strong)] tabular-nums">{value}</b>
      <span className="ag-small !text-xs !leading-4">{label}</span>
    </div>
  );
}
