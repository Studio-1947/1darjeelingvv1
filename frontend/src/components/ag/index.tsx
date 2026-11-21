/*
 * aangan design-system primitives (red /7). Each one only emits the classes in
 * src/styles/aangan.css; pages compose these instead of restating colours, sizes or radii.
 */
import { forwardRef, type ReactNode, type ButtonHTMLAttributes, type AnchorHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { ArrowUpRight, Check } from '@phosphor-icons/react';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/* ---------- buttons ---------- */

export type BtnVariant = 'primary' | 'std' | 'tonal' | 'text' | 'stop';
type BtnLook = {
  variant?: BtnVariant;
  /** Navigation and next steps end in a circled arrow. */
  go?: boolean;
  block?: boolean;
  center?: boolean;
  size?: 'md' | 'sm';
  icon?: ReactNode;
};

function btnClass({ variant = 'std', go, block, center, size }: BtnLook, extra?: string) {
  return cx('ag-btn', variant !== 'std' && variant, go && 'hasgo', block && 'wide', center && 'center', size === 'sm' && 'sm', extra);
}
function BtnInner({ icon, go, children }: { icon?: ReactNode; go?: boolean; children?: ReactNode }) {
  return (
    <>
      {icon}
      {children != null && <span className="min-w-0 truncate">{children}</span>}
      {go && <span className="ag-go" aria-hidden="true"><ArrowUpRight weight="bold" /></span>}
    </>
  );
}

export const Button = forwardRef<HTMLButtonElement, BtnLook & ButtonHTMLAttributes<HTMLButtonElement>>(
  function Button({ variant, go, block, center, size, icon, className, children, type = 'button', ...rest }, ref) {
    return (
      <button ref={ref} type={type} className={btnClass({ variant, go, block, center, size }, className)} {...rest}>
        <BtnInner icon={icon} go={go}>{children}</BtnInner>
      </button>
    );
  },
);

export function ButtonLink({ variant, go, block, center, size, icon, className, children, ...rest }: BtnLook & LinkProps) {
  return (
    <Link className={btnClass({ variant, go, block, center, size }, className)} {...rest}>
      <BtnInner icon={icon} go={go}>{children}</BtnInner>
    </Link>
  );
}

export function ButtonA({ variant, go, block, center, size, icon, className, children, ...rest }: BtnLook & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={btnClass({ variant, go, block, center, size }, className)} {...rest}>
      <BtnInner icon={icon} go={go}>{children}</BtnInner>
    </a>
  );
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tint?: boolean; on?: boolean; small?: boolean }>(
  function IconButton({ label, tint, on, small, className, children, type = 'button', ...rest }, ref) {
    return (
      <button ref={ref} type={type} aria-label={label} title={label} className={cx('ag-iconbtn', tint && 'tint', on && 'on', small && 'sm', className)} {...rest}>
        {children}
      </button>
    );
  },
);

/* ---------- chips ---------- */

export function Chip({ on, className, children, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { on?: boolean }) {
  return (
    <button type={type} aria-pressed={on} className={cx('ag-chip', className)} {...rest}>
      {children}
    </button>
  );
}

export function Chips({ scroll, className, children, ...rest }: { scroll?: boolean; className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('ag-chips', scroll && 'scroll', className)} {...rest}>{children}</div>;
}

/* ---------- fields ---------- */

type FieldShell = { label?: ReactNode; hint?: ReactNode; error?: ReactNode; errorId?: string; className?: string };

function Shell({ label, hint, error, errorId, className, children }: FieldShell & { children: ReactNode }) {
  return (
    <label className={cx('ag-field', className)}>
      {label != null && <span>{label}</span>}
      {children}
      {hint != null && !error && <span className="hint">{hint}</span>}
      {error ? <p className="ag-err" role="alert" id={errorId} data-testid={errorId}>{error}</p> : null}
    </label>
  );
}

export const TextField = forwardRef<HTMLInputElement, FieldShell & InputHTMLAttributes<HTMLInputElement>>(
  function TextField({ label, hint, error, errorId, className, ...rest }, ref) {
    return (
      <Shell label={label} hint={hint} error={error} errorId={errorId} className={className}>
        <input ref={ref} className="ag-in" aria-invalid={error ? true : undefined} aria-describedby={error && errorId ? errorId : undefined} {...rest} />
      </Shell>
    );
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ label, hint, error, errorId, className, ...rest }, ref) {
    return (
      <Shell label={label} hint={hint} error={error} errorId={errorId} className={className}>
        <textarea ref={ref} className="ag-in" aria-invalid={error ? true : undefined} {...rest} />
      </Shell>
    );
  },
);

export const SelectField = forwardRef<HTMLSelectElement, FieldShell & SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectField({ label, hint, error, errorId, className, children, ...rest }, ref) {
    return (
      <Shell label={label} hint={hint} error={error} errorId={errorId} className={className}>
        <select ref={ref} className="ag-in" aria-invalid={error ? true : undefined} {...rest}>{children}</select>
      </Shell>
    );
  },
);

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return <p className="ag-err" role="alert" id={id} data-testid={id}>{children}</p>;
}

/* ---------- headings ---------- */

/** Every page: a small red eyebrow over a 34px title. */
// The red label above the title is per page in /7 (data.js eye_<page>): Account "Your account",
// Saved "Your favourites", Notifications "Updates"...; My trip and Feed have none. Pass it only
// where the prototype shows one.
export function PageHead({ eyebrow, title, sub, children, className }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx('ag-pagehead', className)}>
      {eyebrow != null && eyebrow !== '' && <span className="ag-eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {sub != null && <p className="ag-small mt-1">{sub}</p>}
      {children}
    </div>
  );
}

/** Home and page sections: eyebrow + title, See all on the right. */
export function SecHead({ eyebrow, title, action, className, id }: { eyebrow?: ReactNode; title: ReactNode; action?: ReactNode; className?: string; id?: string }) {
  return (
    <div className={cx('ag-sechead', className)}>
      <div className="min-w-0">
        {eyebrow != null && <span className="ag-eyebrow block">{eyebrow}</span>}
        <h2 id={id}>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function SeeAll({ to, children, ...rest }: { to: string; children: ReactNode } & Omit<LinkProps, 'to'>) {
  return <Link to={to} className="ag-seeall" {...rest}>{children}</Link>;
}

/* ---------- surfaces ---------- */

export function Box({ tone, flat, className, children, as: As = 'div', ...rest }: { tone?: 'blush'; flat?: boolean; className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' } & React.HTMLAttributes<HTMLElement>) {
  return <As className={cx('ag-box', tone, flat && 'flat', className)} {...rest}>{children}</As>;
}

export function Status({ tone, children, className, ...rest }: { tone?: 'ok' | 'no' | 'info' | 'pending'; children: ReactNode; className?: string } & React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx('ag-status', tone && tone !== 'pending' && tone, className)} {...rest}>{children}</span>;
}

/* ---------- toggles ---------- */

export function Seg<T extends string>({ value, options, onChange, label, className }: {
  value: T; options: Array<{ value: T; label: ReactNode; icon?: ReactNode; testId?: string }>; onChange: (v: T) => void; label: string; className?: string;
}) {
  return (
    <div className={cx('ag-seg', className)} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} data-testid={o.testId} onClick={() => onChange(o.value)}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- one question per screen ---------- */

export function StepBar({ total, at, label }: { total: number; at: number; label?: string }) {
  return (
    <div className="ag-steps" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={at + 1} aria-label={label}>
      {Array.from({ length: total }, (_, i) => <i key={i} className={i <= at ? 'on' : undefined} />)}
    </div>
  );
}

/** A one-tap choice: icon, title, small line, check dot. */
export function Option({ on, icon, title, sub, className, type = 'button', ...rest }: { on?: boolean; icon?: ReactNode; title: ReactNode; sub?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} aria-pressed={!!on} className={cx('ag-option', className)} {...rest}>
      {icon}
      <span className="min-w-0">
        <b>{title}</b>
        {sub != null && <span className="ag-small">{sub}</span>}
      </span>
      <span className="dot" aria-hidden="true">{on && <Check weight="bold" />}</span>
    </button>
  );
}

export function MenuIcon({ children }: { children: ReactNode }) {
  return <span className="ag-micon" aria-hidden="true">{children}</span>;
}

export { cx };
