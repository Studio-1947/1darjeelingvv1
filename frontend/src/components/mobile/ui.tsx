import React from 'react';

/**
 * Shared primitives for the mobile-app-matched UI, mirroring
 * 1-Darjeeling-Mobile-App's src/components/ui.tsx 1:1 by name so porting a
 * screen from that app is close to a mechanical translation. Every element
 * here assumes it renders inside a `.mobile-ui` subtree (see
 * src/styles/mobile-tokens.css) - it reads --mu-* custom properties, not the
 * desktop --pine/--ink tokens.
 */

type DivProps = React.HTMLAttributes<HTMLDivElement>;
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Card({ className = '', style, ...rest }: DivProps) {
  return (
    <div
      className={`bg-[var(--mu-surface)] border border-[var(--mu-border)] rounded-[var(--mu-r-card)] ${className}`}
      style={{ boxShadow: 'var(--mu-shadow-card)', ...style }}
      {...rest}
    />
  );
}

/** Press-scale feedback in place of RN's Pressable + haptics - no vibration API equivalent, so just the visual squash. */
export function Touch({ className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`transition-transform duration-100 active:scale-[0.97] active:opacity-80 ${className}`}
      {...rest}
    />
  );
}

export function PrimaryButton({ className = '', children, ...rest }: ButtonProps) {
  return (
    <Touch
      className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-[var(--mu-r-chip)] bg-[var(--mu-green)] text-[var(--mu-cream)] font-[family-name:var(--mu-font-display)] font-bold text-sm disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </Touch>
  );
}

export function SecondaryButton({ className = '', children, ...rest }: ButtonProps) {
  return (
    <Touch
      className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-[var(--mu-r-chip)] bg-transparent border border-[var(--mu-border-strong)] text-[var(--mu-ink)] font-[family-name:var(--mu-font-display)] font-bold text-sm disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </Touch>
  );
}

export function Chip({ className = '', active = false, ...rest }: DivProps & { active?: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--mu-r-chip)] text-xs font-semibold border ${
        active
          ? 'bg-[var(--mu-green)] border-[var(--mu-green)] text-[var(--mu-cream)]'
          : 'bg-[var(--mu-surface)] border-[var(--mu-border)] text-[var(--mu-text-body)]'
      } ${className}`}
      {...rest}
    />
  );
}

/** Rotated lime "sticker" badge - RN's promo/new-item marker. */
export function Tag({ className = '', children, ...rest }: DivProps) {
  return (
    <div
      className={`inline-flex items-center px-2 py-0.5 rounded-full bg-[var(--mu-lime)] text-[var(--mu-lime-ink)] text-[10px] font-extrabold uppercase tracking-wide -rotate-2 shadow-sm ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Badge({ className = '', children, ...rest }: DivProps) {
  return (
    <div
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--mu-danger)] text-white text-[10px] font-bold leading-none ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function FilterPill({
  active = false,
  className = '',
  children,
  ...rest
}: ButtonProps & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`flex-shrink-0 px-4 py-2 rounded-[var(--mu-r-chip)] text-sm font-semibold border transition-colors ${
        active
          ? 'bg-[var(--mu-green)] border-[var(--mu-green)] text-[var(--mu-cream)]'
          : 'bg-[var(--mu-surface)] border-[var(--mu-border)] text-[var(--mu-text-body)]'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Monogram({ label, className = '' }: { label: string; className?: string }) {
  const letter = (label || '?').trim().charAt(0).toUpperCase();
  return (
    <div
      className={`flex items-center justify-center rounded-[var(--mu-r-avatar)] bg-[var(--mu-green-tint)] border border-[var(--mu-green-tint-border)] text-[var(--mu-green-deep)] font-[family-name:var(--mu-font-display)] font-bold ${className}`}
    >
      {letter}
    </div>
  );
}

export function Rating({ value, className = '' }: { value?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold text-[var(--mu-text-body)] ${className}`}>
      {value ? (
        <>
          <span aria-hidden="true" className="text-[var(--mu-orange)]">★</span> {value.toFixed(1)}
        </>
      ) : (
        <span className="text-[var(--mu-orange)]">New</span>
      )}
    </span>
  );
}

export function Price({
  amount,
  suffix,
  className = '',
}: {
  amount: string | number;
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={`font-[family-name:var(--mu-font-display)] font-extrabold text-[var(--mu-ink)] ${className}`}>
      {amount}
      {suffix && <span className="ml-1 text-xs font-semibold text-[var(--mu-text-muted)]">{suffix}</span>}
    </span>
  );
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-1.5 rounded-full bg-[var(--mu-border)] overflow-hidden ${className}`}>
      <div className="h-full rounded-full bg-[var(--mu-green)]" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Row({ className = '', ...rest }: DivProps) {
  return <div className={`flex items-center ${className}`} {...rest} />;
}
