import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, CheckCircle2, Clock, XCircle, Circle } from 'lucide-react';
import { getMyProfile, uploadKycDoc, deleteKycDoc, KycApiError, KycProfile, ChecklistItem } from '@/lib/kyc';
import ProfileCompletionBar from '../ProfileCompletionBar';

export default function KycSection({ onProfileChange }: { onProfileChange?: (p: KycProfile) => void }) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<KycProfile | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initial-load state is tracked explicitly rather than inferred from `!profile`, so a
  // failed first load can render a proper error (or "not active yet") panel instead of
  // being indistinguishable from "still loading" forever.
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ status?: number; message: string } | null>(null);

  const stateMeta: Record<ChecklistItem['state'], { icon: React.ReactNode; label: string; cls: string }> = {
    done: { icon: <CheckCircle2 size={16} />, label: t('kyc.verified'), cls: 'text-pine' },
    in_review: { icon: <Clock size={16} />, label: t('kyc.inReview'), cls: 'text-gold' },
    rejected: { icon: <XCircle size={16} />, label: t('kyc.rejected'), cls: 'text-flag' },
    missing: { icon: <Circle size={16} />, label: t('kyc.missing'), cls: 'text-ink-soft' },
  };

  const load = async () => {
    const p = await getMyProfile();
    setProfile(p);
    onProfileChange?.(p);
  };

  const loadInitial = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      await load();
    } catch (e) {
      const err = e as KycApiError;
      setLoadError({ status: err?.status, message: err?.message || t('kyc.loadError') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: load once on mount; "Try again" re-runs it explicitly
  }, []);

  const onPick = async (docType: string, file?: File) => {
    if (!file) return;
    setBusyKey(docType);
    setError(null);
    try {
      await uploadKycDoc(docType, file);
    } catch (e) {
      const err = e as KycApiError;
      setError(err?.message || t('kyc.uploadFailed'));
      setBusyKey(prev => (prev === docType ? null : prev));
      return;
    }
    // The upload itself succeeded - a failure past this point is a reload problem, not an
    // upload problem, and must not be reported as "Upload failed" (that would invite a
    // needless duplicate upload of a document that's already saved).
    try {
      await load();
    } catch (e) {
      setError(t('kyc.reloadFailed'));
    } finally {
      setBusyKey(prev => (prev === docType ? null : prev));
    }
  };

  const onDelete = async (docType: string) => {
    setBusyKey(docType);
    setError(null);
    try {
      await deleteKycDoc(docType);
      await load();
    } catch (e) {
      const err = e as KycApiError;
      setError(err?.message || t('kyc.removeFailed'));
    } finally {
      setBusyKey(prev => (prev === docType ? null : prev));
    }
  };

  if (loading) return <div className="text-sm text-ink-soft">{t('kyc.loading')}</div>;

  if (loadError) {
    // A 404 here means "no active provider profile yet" - completely normal for a provider
    // who onboarded but hasn't paid/activated yet. That's not a failure, so it gets a plain
    // explanatory message rather than the alarming error panel + retry button.
    if (loadError.status === 404) {
      return (
        <div className="mist-panel rounded-2xl border border-[var(--line)] p-4 text-sm text-ink-soft">
          {t('kyc.notActiveYet')}
        </div>
      );
    }
    return (
      <div className="mist-panel rounded-2xl border border-[var(--line)] p-4 space-y-3">
        <div className="text-sm text-flag font-semibold">{loadError.message}</div>
        <button type="button" className="text-xs font-bold text-pine" onClick={loadInitial}>
          {t('kyc.tryAgain')}
        </button>
      </div>
    );
  }

  if (!profile) return null;

  const kycItems = profile.checklist.filter(c => c.kind === 'kyc');
  const profileItems = profile.checklist.filter(c => c.kind === 'profile');

  return (
    <div className="space-y-6">
      <ProfileCompletionBar percent={profile.completion_percent} />
      {error && <div className="text-sm text-flag font-semibold">{error}</div>}

      <div>
        <h3 className="font-bold text-ink mb-2">{t('kyc.completeYourListing')}</h3>
        <ul className="space-y-2">
          {profileItems.map(item => {
            const m = stateMeta[item.state];
            return (
              <li key={item.key} className="flex items-center gap-2 text-sm">
                <span className={m.cls}>{m.icon}</span>
                <span className={item.state === 'done' ? 'text-ink-soft line-through' : 'text-ink'}>{item.label}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <h3 className="font-bold text-ink mb-1">{t('kyc.verification')}</h3>
        <p className="text-xs text-ink-soft mb-3">{t('kyc.verificationHelp')}</p>
        <ul className="space-y-3">
          {kycItems.map(item => {
            const m = stateMeta[item.state];
            const doc = profile.documents.find(d => d.doc_type === item.key);
            return (
              <li key={item.key} className="rounded-2xl border border-[var(--line)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={m.cls}>{m.icon}</span>
                    <div>
                      <div className="text-sm font-semibold text-ink">
                        {item.label}{!item.required && <span className="text-ink-soft font-normal"> ({t('kyc.optional')})</span>}
                      </div>
                      <div className={`text-xs ${m.cls}`}>{m.label}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 text-xs font-bold text-pine cursor-pointer">
                      <Upload size={12} /> {busyKey === item.key ? t('kyc.uploading') : (item.state === 'missing' ? t('kyc.upload') : t('kyc.replace'))}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,application/pdf"
                        className="sr-only"
                        aria-label={
                          busyKey === item.key
                            ? t('kyc.uploadingAriaLabel', { label: item.label })
                            : item.state === 'missing'
                              ? t('kyc.uploadAriaLabel', { label: item.label })
                              : t('kyc.replaceAriaLabel', { label: item.label })
                        }
                        disabled={busyKey === item.key}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          // Reset so re-picking the identical file still fires onChange -
                          // otherwise retrying the same document after a failed upload does
                          // nothing, silently.
                          e.target.value = '';
                          onPick(item.key, file);
                        }}
                      />
                    </label>
                    {doc && (
                      <button className="text-xs text-flag font-semibold" onClick={() => onDelete(item.key)} disabled={busyKey === item.key}>
                        {t('kyc.remove')}
                      </button>
                    )}
                  </div>
                </div>
                {item.state === 'rejected' && doc?.rejection_reason && (
                  <div className="mt-2 text-xs text-flag">{t('kyc.rejectionReason', { reason: doc.rejection_reason })}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
