import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleNotch as Loader2, X } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { blockUser, reportContent, ReportReason } from '@/lib/reviews';

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

  // Escape closes it, as the site's other modals do.
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-title"
      data-testid="report-dialog"
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={close}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] cursor-default"
      />
      <div className="relative w-full max-w-md bg-white rounded-3xl border border-[var(--line)] shadow-2xl p-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
        <button
          type="button"
          onClick={close}
          aria-label={t('common.close')}
          className="absolute top-3 right-3 w-9 h-9 rounded-full grid place-items-center text-ink-soft hover:bg-mist transition-colors"
        >
          <X size={18} />
        </button>

        <div className="pr-10">
          <h2 id="report-title" className="font-display font-bold text-xl text-ink">
            {target.type === 'review' ? t('report.review_title') : target.type === 'post' ? t('report.post_title') : t('report.listing_title')}
          </h2>
          <p className="mt-2 text-sm text-ink-soft">{t('report.intro')}</p>
        </div>

        <div className="text-xs font-bold uppercase tracking-widest text-ink-soft">{t('report.reason_label')}</div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('report.reason_label')}>
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              data-testid={`report-reason-${r}`}
              onClick={() => setReason(r)}
              className={`px-4 py-2 rounded-full border text-sm font-semibold transition-colors ${
                reason === r ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[var(--line)] hover:border-pine'
              }`}
            >
              {t(`report.reason_${r}`)}
            </button>
          ))}
        </div>

        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
          rows={3}
          placeholder={t('report.details_placeholder')}
          aria-label={t('report.details_placeholder')}
          className="w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-ink text-sm resize-none focus:ring-2 focus:ring-pine/20"
        />

        {(target.type === 'review' || target.type === 'post') && (
          <div className="border-t border-[var(--line)] pt-4">
            <p className="text-sm text-ink-soft">{t('report.block_explain', { name: target.authorName })}</p>
            <button
              type="button"
              onClick={block}
              disabled={busy !== null}
              data-testid="report-block"
              className="mt-3 inline-flex items-center gap-2 px-5 py-2 rounded-full border border-[var(--line)] text-ink font-bold text-sm hover:border-flag hover:text-flag disabled:opacity-50"
            >
              {busy === 'block' && <Loader2 size={14} className="animate-spin" />}
              {t('report.block_cta', { name: target.authorName })}
            </button>
          </div>
        )}

        {error && <p className="text-sm text-flag font-semibold">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={close} className="px-5 py-2.5 rounded-full border border-[var(--line)] text-ink font-bold">
            {t('report.cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!reason || busy !== null}
            data-testid="report-submit"
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-pine text-white font-bold btn-hover disabled:opacity-50"
          >
            {busy === 'report' && <Loader2 size={15} className="animate-spin" />}
            {t('report.send')}
          </button>
        </div>
      </div>
    </div>
  );
}
