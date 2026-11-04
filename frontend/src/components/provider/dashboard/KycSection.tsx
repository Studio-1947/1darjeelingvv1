import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, CheckCircle as CheckCircle2, Clock, XCircle, Circle } from '@phosphor-icons/react';
import { getMyProfile, uploadKycDoc, uploadKycVideo, deleteKycDoc, KycApiError, KycProfile, ChecklistItem, verifyMapsLink, captureLiveLocation } from '@/lib/kyc';
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

  const onPick = async (docType: string, file?: File, video = false) => {
    if (!file) return;
    setBusyKey(docType);
    setError(null);
    try {
      await (video ? uploadKycVideo(docType, file) : uploadKycDoc(docType, file));
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
              <li key={item.key} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className={m.cls}>{m.icon}</span>
                  <span className={item.state === 'done' ? 'text-ink-soft line-through' : 'text-ink'}>{item.label}</span>
                </div>
                {item.action && item.state !== 'done' && (
                  <LocationCheck action={item.action} onDone={async () => { await load().catch(() => {}); }} />
                )}
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
                      {item.media === 'video' && item.state === 'missing' && (
                        <div className="text-[11px] text-ink-soft">{t('kyc.videoHint')}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1 text-xs font-bold text-pine cursor-pointer">
                      <Upload size={12} /> {busyKey === item.key ? t('kyc.uploading') : (item.state === 'missing' ? t('kyc.upload') : t('kyc.replace'))}
                      <input
                        type="file"
                        accept={item.media === 'video' ? 'video/mp4,video/quicktime,video/webm' : 'image/jpeg,image/png,application/pdf'}
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
                          onPick(item.key, file, item.media === 'video');
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

/**
 * The location check the board's verification needs (server: providers.ts /me/location/*).
 * A homestay pastes its Google Maps link; a café or shop taps once while standing there.
 */
function LocationCheck({ action, onDone }: { action: 'maps_link' | 'live_capture'; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (action === 'maps_link') await verifyMapsLink(url.trim());
      else await captureLiveLocation();
      await onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 ml-6 rounded-xl border border-[var(--line)] bg-white p-3 space-y-2" data-testid={`location-check-${action}`}>
      {action === 'maps_link' ? (
        <>
          <p className="text-xs text-ink-soft">{t('kyc.mapsLinkHelp')}</p>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://maps.app.goo.gl/..." inputMode="url"
            className="w-full px-3 py-2 rounded-lg border border-[var(--line)] text-sm outline-none focus:border-pine" data-testid="location-maps-url" />
        </>
      ) : (
        <p className="text-xs text-ink-soft">{t('kyc.liveHelp')}</p>
      )}
      <button type="button" onClick={run} disabled={busy || (action === 'maps_link' && !url.trim())} data-testid="location-check-run"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pine text-white text-xs font-bold disabled:opacity-50">
        {busy ? t('kyc.locationChecking') : action === 'maps_link' ? t('kyc.mapsLinkVerify') : t('kyc.liveCapture')}
      </button>
      {err && <p className="text-xs text-flag font-semibold" data-testid="location-check-error">{err}</p>}
    </div>
  );
}
