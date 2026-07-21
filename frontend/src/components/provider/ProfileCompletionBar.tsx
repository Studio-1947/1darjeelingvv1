import React from 'react';

/** A pine-green progress bar with a percentage label. */
export default function ProfileCompletionBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-ink-soft">Profile completion</span>
        <span className="text-xs font-bold text-pine">{clamped}%</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-[var(--line)] overflow-hidden">
        <div
          className="h-full rounded-full bg-pine transition-all duration-500"
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
