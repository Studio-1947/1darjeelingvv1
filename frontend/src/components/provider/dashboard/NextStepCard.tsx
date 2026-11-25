import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';

/**
 * The dashboard's "Next step" card in two lines: a ring with how far along the host is, what to do
 * and one line of detail, then round buttons (call support, go). The title is also the go button,
 * so the action keeps its words even though the round button has none.
 */
export default function NextStepCard({ done, total, percent, title, detail, goLabel, onGo, supportPhone, children, testId }: {
  /** Steps done out of `total` ("1/4"), or a `percent` when there are no steps. */
  done?: number;
  total?: number;
  percent?: number;
  title: React.ReactNode;
  detail?: React.ReactNode;
  goLabel?: string;
  onGo?: () => void;
  supportPhone?: string | null;
  /** Anything that must not be cut short, under the two lines (a document the team turned down). */
  children?: React.ReactNode;
  testId?: string;
}) {
  const { t } = useTranslation();
  const hasSteps = done != null && !!total;
  const frac = hasSteps ? done / total : percent != null ? percent / 100 : null;
  const R = 20;
  const C = 2 * Math.PI * R;
  return (
    <Box as="section" className="ag-host-step" data-testid={testId}>
      <div className="ag-host-step-row">
        {frac != null ? (
          <span className="ag-host-ring" role="progressbar" aria-label={t('host.next', 'Next step')}
            aria-valuemin={0} aria-valuemax={hasSteps ? total : 100} aria-valuenow={hasSteps ? done : percent}>
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <circle cx="24" cy="24" r={R} className="track" />
              <circle cx="24" cy="24" r={R} className="fill" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, Math.max(0, frac)))} />
            </svg>
            <b>{hasSteps ? `${done}/${total}` : `${Math.round(percent!)}%`}</b>
          </span>
        ) : (
          <span className="ag-host-ring"><Icon name="plus" /></span>
        )}
        <div className="ag-host-step-text">
          {onGo ? <button type="button" className="ttl" onClick={onGo}>{title}</button> : <b className="ttl">{title}</b>}
          {detail && <span className="ag-small">{detail}</span>}
        </div>
        <span className="ag-host-step-acts">
          {supportPhone && (
            <a className="ag-host-rowic" href={`tel:${supportPhone}`} aria-label={t('verify.call_support')} title={t('verify.call_support')}>
              <Icon name="phone" />
            </a>
          )}
          {onGo && (
            <button type="button" className="ag-host-rowic go" onClick={onGo} aria-label={goLabel} title={goLabel} data-testid={testId ? `${testId}-go` : undefined}>
              <Icon name="arrowne" />
            </button>
          )}
        </span>
      </div>
      {children}
    </Box>
  );
}
