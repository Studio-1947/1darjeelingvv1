import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { checklistLabel } from '@/lib/serverText';
import { useAuth } from '@/context/AuthContext';
import { CheckCircle as CheckCircle2, Clock, XCircle, Circle, MapPin } from '@phosphor-icons/react';
import { Icon } from '@/components/ag/Icon';
import { Box, Button, FieldError, Status, TextField } from '@/components/ag';
import { getMyProfile, uploadKycDoc, uploadKycVideo, deleteKycDoc, KycApiError, KycProfile, ChecklistItem, verifyMapsLink, captureLiveLocation } from '@/lib/kyc';

/** Where each listing item is fixed on the Business profile (a section id there), and its link text. */
const FIX_AT: Record<string, string> = { description: 'about', photos: 'photos', price: 'prices' };
const FIX_LABEL: Record<string, string> = { description: 'Write it', photos: 'Add photos', price: 'Set prices' };

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

  // Only the documents that are needed (the prototype's short list: an ID and one photo).
  const kycItems = profile.checklist.filter(c => c.kind === 'kyc' && c.required);
  const profileItems = profile.checklist.filter(c => c.kind === 'profile');
  const pct = Math.max(0, Math.min(100, Math.round(profile.completion_percent || 0)));

  return (
    <>
      {/* provider.js documents screen: "Profile completion" with the bar and what is left. */}
      <Box as="section" data-testid="kyc-completion">
        <h2>{t('kyc.verifyProgress', 'Getting the Verified tick')}</h2>
        <div className="ag-host-pct">
          <span className="ag-host-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('kyc.verifyProgress', 'Getting the Verified tick')}><i style={{ width: `${pct}%` }} /></span>
          <b>{pct}%</b>
        </div>
        <FieldError>{error}</FieldError>
        {profileItems.length > 0 && (
          <>
            <span className="ag-small">{t('kyc.completeYourListing')}</span>
            <ul className="ag-host-dots">
              {profileItems.map(item => (
                <li key={item.key} className={item.state === 'done' ? 'done' : undefined}>
                  <span className="d" aria-hidden="true">{item.state === 'done' ? <Icon name="check" /> : '•'}</span>
                  <div className="min-w-0 flex-1">
                    <span>{checklistLabel(t, item, businessType)}</span>
                    {/* Not done yet: a link straight to where it is fixed on the Business profile. */}
                    {!item.action && item.state !== 'done' && FIX_AT[item.key] && (
                      <Link to={`/provider/profile#${FIX_AT[item.key] === 'prices' && (businessType === 'cafe' || businessType === 'shop') ? 'menu' : FIX_AT[item.key]}`}
                        className="ag-host-fix" data-testid={`kyc-fix-${item.key}`}>
                        {t(`kyc.fix.${item.key}`, FIX_LABEL[item.key])} <Icon name="arrowne" />
                      </Link>
                    )}
                    {item.action && item.state !== 'done' && (
                      <LocationCheck action={item.action} onDone={async () => { await load().catch(() => {}); }} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Box>

      <Box as="section">
        <h2>{t('kyc.verification')}</h2>
        {/* What the upload takes, before a host picks a file (the server's own limits, routes/kyc.ts). */}
        <p className="ag-small" data-testid="kyc-docs-help">{t('kyc.verificationHelp')}</p>
        <ul className="grid" data-testid="kyc-docs">
          {kycItems.map(item => {
            const m = stateMeta[item.state];
            const doc = profile.documents.find(d => d.doc_type === item.key);
            return (
              <li key={item.key} className="ag-host-docrow">
                <div className="top">
                  <div className="min-w-0">
                    <b>{checklistLabel(t, item, businessType)}</b>
                    <Status tone={m.tone}>{m.label}</Status>
                    {item.media === 'video' && item.state === 'missing' && (
                      <p className="ag-small mt-1">{t('kyc.videoHint')}</p>
                    )}
                  </div>
                  <div className="acts">
                    {/* A label styled as a button, so the file picker opens from it. */}
                    <label className="ag-btn ag-host-upl cursor-pointer">
                      <Icon name="download" />
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
                    {/* A verified document stays: removing it would take a live business off verified. */}
                    {doc && item.state !== 'done' && (
                      <Button variant="text" className="!text-[var(--fail)]" onClick={() => onDelete(item.key)} disabled={busyKey === item.key}>
                        {t('kyc.remove')}
                      </Button>
                    )}
                  </div>
                </div>
                {item.state === 'rejected' && doc?.rejection_reason && (
                  <p className="text-sm text-[var(--fail)]">{t('kyc.rejectionReason', { reason: doc.rejection_reason })}</p>
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
