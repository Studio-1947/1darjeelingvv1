import React from 'react';
import { CaretDown } from '@phosphor-icons/react';

/**
 * One collapsible card of a host form (Business profile, a listing's editor): a box whose title row
 * opens and closes it, so a long form shows as a short list of cards. A native <details>, as the
 * Account profile's "More" (EditProfile) and PointsRules are, so it opens with the keyboard and
 * screen readers announce it without extra code.
 *
 * `open` only sets how it starts (and reopens it when it turns true, e.g. a link to #photos).
 */
export default function Fold({ title, summary, open, id, testid, children }: {
  title: string;
  /** A short line under the title saying what is inside, shown open or closed ("3 rooms · from ₹1,500"). */
  summary?: React.ReactNode;
  open?: boolean;
  id?: string;
  testid?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDetailsElement>(null);
  React.useEffect(() => { if (open && ref.current) ref.current.open = true; }, [open]);
  return (
    <details ref={ref} id={id} className="ag-box ag-host-fold scroll-mt-20" data-testid={testid} open={open || undefined}>
      <summary>
        <span className="min-w-0">
          <b>{title}</b>
          {summary && <span className="ag-small">{summary}</span>}
        </span>
        <CaretDown className="chev" aria-hidden="true" />
      </summary>
      <div className="ag-host-fold-body">{children}</div>
    </details>
  );
}
