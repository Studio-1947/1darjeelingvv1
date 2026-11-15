import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleNotch as Loader2, Prohibit } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { blockUser, reportContent, ReportReason } from '@/lib/reviews';
import { Button, Chip, Chips, FieldError, TextArea } from '@/components/ag';
import Sheet, { SheetHead } from './Sheet';

const REASONS: ReportReason[] = ['fake', 'offensive', 'unsafe', 'spam', 'other'];

export type ReportTarget =
  | { type: 'listing'; id: string }
  | { type: 'review' | 'post'; id: string; authorId: string; authorName: string };

/**
 * Report a listing or a review, and for a review, block its author. The same choices as the
 * mobile app's report sheet; both post to /api/reports and /api/users/me/blocks.
 */
export default function ReportDialog({
  target,
  onClose,
  onBlocked,
}: {
  target: ReportTarget | null;
  onClose: () => void;
  onBlocked?: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState<'report' | 'block' | null>(null);
  const [error, setError] = useState('');

  const close = () => {
    setReason(null);
    setDetails('');
    setError('');
    onClose();
  };

  const message = (e: any) => e?.response?.data?.detail || t('report.failed');

  const submit = async () => {
    if (!target || !reason) return;
    setBusy('report');
    setError('');
    try {
      await reportContent({ target_type: target.type, target_id: target.id, reason, details: details.trim() || undefined });
      toast.success(t('report.sent'));
      close();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const block = async () => {
    if (target?.type !== 'review' && target?.type !== 'post') return;
    setBusy('block');
    setError('');
    try {
      await blockUser(target.authorId);
      toast.success(t('report.blocked', { name: target.authorName }));
      close();
      onBlocked?.();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  if (!target) return null;

  return (
    <Sheet onClose={close} labelledBy="report-title" testid="report-dialog">
      <SheetHead id="report-title"
        title={target.type === 'review' ? t('report.review_title') : target.type === 'post' ? t('report.post_title') : t('report.listing_title')}>
        <p className="ag-small">{t('report.intro')}</p>
      </SheetHead>

      <span className="ag-eyebrow">{t('report.reason_label')}</span>
      <Chips role="radiogroup" aria-label={t('report.reason_label')}>
        {REASONS.map((r) => (
          <Chip key={r} role="radio" aria-checked={reason === r} on={reason === r} onClick={() => setReason(r)} data-testid={`report-reason-${r}`}>
            {t(`report.reason_${r}`)}
          </Chip>
        ))}
      </Chips>

      <TextArea value={details} onChange={(e) => setDetails(e.target.value.slice(0, 1000))} rows={3} className="[&_textarea]:!min-h-[96px]"
        placeholder={t('report.details_placeholder')} aria-label={t('report.details_placeholder')} />

      {(target.type === 'review' || target.type === 'post') && (
        <div className="flex flex-col items-start gap-2 border-t border-[var(--warmline)] pt-3">
          <p className="ag-small">{t('report.block_explain', { name: target.authorName })}</p>
          <Button variant="stop" size="sm" onClick={block} disabled={busy !== null} data-testid="report-block"
            icon={busy === 'block' ? <Loader2 className="animate-spin" /> : <Prohibit />}>
            {t('report.block_cta', { name: target.authorName })}
          </Button>
        </div>
      )}

      <FieldError id="report-error">{error}</FieldError>

      <div className="ag-flowbar justify-end">
        <Button onClick={close}>{t('report.cancel')}</Button>
        <Button variant="primary" onClick={submit} disabled={!reason || busy !== null} data-testid="report-submit"
          icon={busy === 'report' ? <Loader2 className="animate-spin" /> : undefined}>
          {t('report.send')}
        </Button>
      </div>
    </Sheet>
  );
}
