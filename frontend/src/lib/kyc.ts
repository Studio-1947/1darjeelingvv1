import api from '@/lib/api';
import i18n from '@/i18n';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type DocState = 'missing' | 'in_review' | 'done' | 'rejected';
export interface ChecklistItem {
  key: string;
  label: string;
  kind: 'profile' | 'kyc';
  required: boolean;
  state: DocState;
}
export interface KycDoc {
  id: string;
  doc_type: string;
  status: string;
  rejection_reason: string | null;
  uploaded_at: string;
  reviewed_at: string | null;
}
export interface KycProfile {
  provider_id: string;
  business_type: string;
  completion_percent: number;
  kyc_status: 'none' | 'partial' | 'submitted' | 'verified';
  checklist: ChecklistItem[];
  documents: KycDoc[];
}

/**
 * Typed error thrown by every function in this module. Carries the server's own `detail`
 * message when one was given, plus the HTTP status so callers can special-case things like a
 * 404 ("no active provider profile yet") or a 503 ("storage temporarily unavailable")
 * differently from a generic failure, instead of matching on string content.
 */
export class KycApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'KycApiError';
    this.status = status;
  }
}

function toKycApiError(err: any, fallbackMessage: string): KycApiError {
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail;
  return new KycApiError(detail || fallbackMessage, status);
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject('File reading failed');
    reader.readAsDataURL(file);
  });
}

export async function getMyProfile(): Promise<KycProfile> {
  try {
    const { data } = await api.get('/providers/me/profile');
    return data;
  } catch (err: any) {
    throw toKycApiError(err, i18n.t('kyc.loadError'));
  }
}

export async function uploadKycDoc(docType: string, file: File): Promise<KycDoc> {
  // The backend caps stored files at 5 MB and answers an 8 MB overage with a bare 413 (no
  // `detail` body), which the caller can only show as the generic "Upload failed". Catch it
  // here instead so the provider gets an accurate, localized reason before we even upload.
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new KycApiError(i18n.t('kyc.fileTooLarge'));
  }
  const dataUrl = await toDataUrl(file);
  try {
    const { data } = await api.post('/providers/me/kyc', { doc_type: docType, file: dataUrl, filename: file.name });
    return data.document;
  } catch (err: any) {
    throw toKycApiError(err, i18n.t('kyc.uploadFailed'));
  }
}

export async function deleteKycDoc(docType: string): Promise<void> {
  try {
    await api.delete(`/providers/me/kyc/${docType}`);
  } catch (err: any) {
    throw toKycApiError(err, i18n.t('kyc.removeFailed'));
  }
}
