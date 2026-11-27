import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleNotch as Loader2 } from '@phosphor-icons/react';
import { Icon } from '@/components/ag/Icon';
import { FieldError, Status } from '@/components/ag';
import { getMyProfile, uploadKycDoc, KycApiError, KycDoc } from '@/lib/kyc';

const DOC_TYPE = 'driving_license';

/**
 * A photo or PDF of the driving licence, next to the licence number on the driver's profile.
 * It is the same Verification document as on the dashboard (doc_type driving_license), so
 * uploading here or there is one and the same file; the team reads the number off it.
 */
export default function LicenceUpload() {
  const { t } = useTranslation();
  const [doc, setDoc] = useState<KycDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // No profile yet (404) or a failed load just leaves the button as "Upload".
    getMyProfile().then((p) => setDoc(p.documents.find((d) => d.doc_type === DOC_TYPE) || null)).catch(() => {});
  }, []);

  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      setDoc(await uploadKycDoc(DOC_TYPE, file));
    } catch (e) {
      setErr((e as KycApiError)?.message || t('kyc.uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const status = doc?.status;
  const tone = status === 'approved' ? 'ok' : status === 'rejected' ? 'no' : 'pending';
  const label = status === 'approved' ? t('kyc.verified') : status === 'rejected' ? t('kyc.rejected') : t('kyc.inReview');

  return (
    <div className="grid gap-1.5" data-testid="profile-licence-upload">
      <div className="flex flex-wrap items-center gap-2">
        <label className="ag-btn ag-host-upl cursor-pointer" aria-busy={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Icon name="download" />}
          <span>{busy ? t('kyc.uploading') : doc ? t('hostProfile.licence_replace', 'Replace licence photo') : t('hostProfile.licence_upload', 'Upload licence photo')}</span>
          <input type="file" accept="image/jpeg,image/png,application/pdf" className="sr-only" disabled={busy}
            aria-label={t('hostProfile.licence_upload', 'Upload licence photo')}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pick(f); }} />
        </label>
        {doc && <Status tone={tone}>{label}</Status>}
      </div>
      <p className="ag-small">{t('hostProfile.licence_upload_hint', 'Photo or PDF, up to 5 MB. Saves typing; we check the number against it.')}</p>
      <FieldError>{err}</FieldError>
    </div>
  );
}
