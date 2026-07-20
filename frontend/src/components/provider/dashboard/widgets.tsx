import React from 'react';

/** Gradient stat tile for the dashboard header grid. */
export function StatCard({ label, value, sub, icon: Icon, tone = 'pine' }: {
  label: string;
  value: any;
  sub?: string;
  icon: any;
  tone?: string;
}) {
  const tones = {
    pine: 'from-pine to-pine-dark',
    flag: 'from-flag to-[#8a1e1e]',
    gold: 'from-gold to-[#c69108]',
    ink: 'from-ink to-[#374a41]',
  };
  return (
    <div className={`rounded-2xl p-4 md:p-5 text-white bg-gradient-to-br ${tones[tone]}`}>
      <div className="flex items-center gap-2 opacity-90"><Icon size={16} /> <span className="text-[11px] uppercase tracking-widest font-bold">{label}</span></div>
      <div className="mt-1 font-display font-extrabold text-2xl md:text-3xl leading-none">{value}</div>
      {sub && <div className="mt-1 text-xs text-white/85">{sub}</div>}
    </div>
  );
}

/** Coloured pill for a booking status. */
export function StatusPill({ status }) {
  const map = {
    confirmed: 'bg-pine/10 text-pine',
    pending_payment: 'bg-gold/20 text-[#8a6b04]',
    cancelled: 'bg-flag/10 text-flag',
  };
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${map[status] || 'bg-mist text-ink-soft'}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}
