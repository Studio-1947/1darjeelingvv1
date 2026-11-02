import React from 'react';

export function Insight({ icon: Icon, label, value, accent }: { icon: any; label: string; value: React.ReactNode; accent: string }) {
  const tone = accent === 'blue' ? 'text-blue-700 bg-blue-100' : accent === 'rose' ? 'text-rose-700 bg-rose-100' : 'text-emerald-700 bg-emerald-100';
  return <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm"><div className={`inline-flex rounded-xl p-2 ${tone}`}><Icon size={17} /></div><div className="mt-3 text-2xl font-display font-extrabold text-ink">{value}</div><div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink-soft">{label}</div></div>;
}
