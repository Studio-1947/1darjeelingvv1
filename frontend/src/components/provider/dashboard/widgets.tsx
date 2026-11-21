import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from '@phosphor-icons/react';
import { IconButton, Status } from '@/components/ag';

/**
 * A bottom sheet on phones and a centred dialog from 640px: title bar with a close button, the
 * body scrolls. Used by the add-listing and edit-listing forms.
 */
export function Sheet({ title, onClose, closeTestId, children, testId }: {
  title: React.ReactNode; onClose: () => void; closeTestId?: string; children: React.ReactNode; testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="sheet-title" data-testid={testId}>
      <div className="flex max-h-[92vh] w-full max-w-[720px] flex-col overflow-hidden rounded-t-[var(--r-card)] bg-[var(--page)] sm:rounded-[var(--r-card)]">
        <div className="flex items-center gap-3 border-b border-[var(--hairline)] px-4 py-3">
          <h2 id="sheet-title" className="m-0 flex-1 text-lg font-medium text-[var(--ink-strong)]">{title}</h2>
          <IconButton label={t('common.close')} onClick={onClose} data-testid={closeTestId}><X /></IconButton>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

const TONE: Record<string, 'ok' | 'no' | 'info' | 'pending'> = {
  confirmed: 'ok',
  accepted: 'info',
  cancelled: 'no',
  pending_payment: 'pending',
  awaiting_host: 'pending',
};

/** A booking's status as a labelled pill. */
export function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Status tone={TONE[status] || 'pending'} className="shrink-0">
      {status === 'awaiting_host'
        ? t('approval.host_new_request')
        : t(`booking.status.${status}`, { defaultValue: status?.replace('_', ' ') })}
    </Status>
  );
}
