import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { checklistLabel } from '@/lib/serverText';
import { useAuth } from '@/context/AuthContext';
import { Upload, CheckCircle as CheckCircle2, Clock, XCircle, Circle, MapPin } from '@phosphor-icons/react';
import { Box, Button, FieldError, Status, TextField } from '@/components/ag';
import { getMyProfile, uploadKycDoc, uploadKycVideo, deleteKycDoc, KycApiError, KycProfile, ChecklistItem, verifyMapsLink, captureLiveLocation } from '@/lib/kyc';
import ProfileCompletionBar from '../ProfileCompletionBar';

export default function KycSection({ onProfileChange }: { onProfileChange?: (p: KycProfile) => void }) {
  const { t } = useTranslation();
  const businessType = (useAuth() as any).provider?.business_type as string | undefined;
  const [profile, setProfile] = useState<KycProfile | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initial-load state is tracked explicitly rather than inferred from `!profile`, so a
  // failed first load can render a proper error (or "not active yet") panel instead of
  // being indistinguishable from "still loading" forever.
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ status?: number; message: string } | null>(null);

  const stateMeta: Record<ChecklistItem['state'], { icon: React.ReactNode; label: string; tone: 'ok' | 'pending' | 'no'; cls: string }> = {
    done: { icon: <CheckCircle2 size={18} weight="fill" />, label: t('kyc.verified'), tone: 'ok', cls: 'text-[var(--ok)]' },
    in_review: { icon: <Clock size={18} />, label: t('kyc.inReview'), tone: 'pending', cls: 'text-[var(--pending)]' },
    rejected: { icon: <XCircle size={18} />, label: t('kyc.rejected'), tone: 'no', cls: 'text-[var(--fail)]' },
    missing: { icon: <Circle size={18} />, label: t('kyc.missing'), tone: 'pending', cls: 'text-[var(--ink-muted)]' },
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

  if (loading) return <Box><p className="ag-small">{t('kyc.loading')}</p></Box>;

  if (loadError) {
    // A 404 here means "no active provider profile yet" - completely normal for a provider
    // who onboarded but has not paid/activated yet. That is not a failure, so it gets a plain
    // explanatory message rather than the alarming error panel + retry button.
    if (loadError.status === 404) {
      return <Box><p className="ag-small">{t('kyc.notActiveYet')}</p></Box>;
    }
    return (
      <Box tone="blush">
        <FieldError>{loadError.message}</FieldError>
        <Button size="sm" className="self-start" onClick={loadInitial}>{t('kyc.tryAgain')}</Button>
      </Box>
    );
  }

  if (!profile) return null;

  const kycItems = profile.checklist.filter(c => c.kind === 'kyc');
  const profileItems = profile.checklist.filter(c => c.kind === 'profile');

  return (
    <>
      <Box as="section">
        <ProfileCompletionBar percent={profile.completion_percent} />
        <FieldError>{error}</FieldError>
        <h2>{t('kyc.completeYourListing')}</h2>
        <ul className="grid gap-2">
          {profileItems.map(item => {
            const m = stateMeta[item.state];
            return (
              <li key={item.key} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className={m.cls}>{m.icon}</span>
                  <span className={item.state === 'done' ? 'text-[var(--ink-muted)] line-through' : 'text-[var(--ink-strong)]'}>{checklistLabel(t, item, businessType)}</span>
                </div>
                {item.action && item.state !== 'done' && (
                  <LocationCheck action={item.action} onDone={async () => { await load().catch(() => {}); }} />
                )}
              </li>
            );
          })}
        </ul>
      </Box>

      <Box as="section">
        <div>
          <h2>{t('kyc.verification')}</h2>
          <p className="ag-small">{t('kyc.verificationHelp')}</p>
        </div>
        <ul className="grid">
          {kycItems.map(item => {
            const m = stateMeta[item.state];
            const doc = profile.documents.find(d => d.doc_type === item.key);
            return (
              <li key={item.key} className="grid gap-2 border-t border-[var(--warmline)] py-3 first:border-t-0 first:pt-0 last:pb-0">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 ${m.cls}`}>{m.icon}</span>
                  <div className="min-w-0 flex-1">
                    <b className="block text-sm font-medium text-[var(--ink-strong)]">
                      {checklistLabel(t, item, businessType)}{!item.required && <span className="font-normal text-[var(--ink-muted)]"> ({t('kyc.optional')})</span>}
                    </b>
                    <Status tone={m.tone} className="mt-1">{m.label}</Status>
                    {item.media === 'video' && item.state === 'missing' && (
                      <p className="ag-small mt-1">{t('kyc.videoHint')}</p>
                    )}
                  </div>
                </div>
                <div className="ag-row pl-7">
                  {/* A label styled as a small button, so the file picker opens from it. */}
                  <label className="ag-btn sm cursor-pointer">
                    <Upload />
                    <span>{busyKey === item.key ? t('kyc.uploading') : (item.state === 'missing' ? t('kyc.upload') : t('kyc.replace'))}</span>
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
                    <Button variant="stop" size="sm" onClick={() => onDelete(item.key)} disabled={busyKey === item.key}>
                      {t('kyc.remove')}
                    </Button>
                  )}
                </div>
                {item.state === 'rejected' && doc?.rejection_reason && (
                  <p className="pl-7 text-sm text-[var(--fail)]">{t('kyc.rejectionReason', { reason: doc.rejection_reason })}</p>
                )}
              </li>
            );
          })}
        </ul>
      </Box>
    </>
  );
}

/**
 * The location check the board's verification needs (server: providers.ts /me/location/*).
 * A homestay pastes its Google Maps link; a cafe or shop taps once while standing there.
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
    <div className="mt-2 grid gap-2 rounded-[18px] border border-[var(--warmline)] bg-[var(--surface)] p-3" data-testid={`location-check-${action}`}>
      {action === 'maps_link' ? (
        <TextField hint={t('kyc.mapsLinkHelp')} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://maps.app.goo.gl/..."
          inputMode="url" aria-label={t('kyc.mapsLinkHelp')} data-testid="location-maps-url" />
      ) : (
        <p className="ag-small">{t('kyc.liveHelp')}</p>
      )}
      <Button size="sm" className="self-start" icon={<MapPin />} onClick={run} disabled={busy || (action === 'maps_link' && !url.trim())} data-testid="location-check-run">
        {busy ? t('kyc.locationChecking') : action === 'maps_link' ? t('kyc.mapsLinkVerify') : t('kyc.liveCapture')}
      </Button>
      <FieldError id="location-check-error">{err}</FieldError>
    </div>
  );
}
