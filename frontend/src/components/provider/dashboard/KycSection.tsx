import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, CheckCircle2, Clock, XCircle, Circle } from 'lucide-react';
import { getMyProfile, uploadKycDoc, deleteKycDoc, KycProfile, ChecklistItem } from '@/lib/kyc';
import ProfileCompletionBar from '../ProfileCompletionBar';

export default function KycSection({ onProfileChange }: { onProfileChange?: (p: KycProfile) => void }) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<KycProfile | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  useEffect(() => {
    load().catch(() => setError(t('kyc.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: load once on mount only
  }, []);

  const onPick = async (docType: string, file?: File) => {
    if (!file) return;
    setBusyKey(docType);
    setError(null);
    try {
      await uploadKycDoc(docType, file);
    } catch (e) {
      setError(typeof e === 'string' ? e : t('kyc.uploadFailed'));
      setBusyKey(prev => (prev === docType ? null : prev));
      return;
    }
    // The upload itself succeeded — a failure past this point is a reload problem, not an
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
      setError(typeof e === 'string' ? e : t('kyc.removeFailed'));
    } finally {
      setBusyKey(prev => (prev === docType ? null : prev));
    }
  };

  if (!profile) return <div className="text-sm text-ink-soft">{t('kyc.loading')}</div>;

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
                        aria-label={t('kyc.uploadAriaLabel', { label: item.label })}
                        disabled={busyKey === item.key}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          // Reset so re-picking the identical file still fires onChange —
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
