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

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject('File reading failed');
    reader.readAsDataURL(file);
  });
}

export async function getMyProfile(): Promise<KycProfile> {
  const { data } = await api.get('/providers/me/profile');
  return data;
}

export async function uploadKycDoc(docType: string, file: File): Promise<KycDoc> {
  // The backend caps stored files at 5 MB and answers an 8 MB overage with a bare 413 (no
  // `detail` body), which the caller can only show as the generic "Upload failed". Catch it
  // here instead so the provider gets an accurate, localized reason before we even upload.
  if (file.size > MAX_UPLOAD_BYTES) {
    throw i18n.t('kyc.fileTooLarge');
  }
  const dataUrl = await toDataUrl(file);
  try {
    const { data } = await api.post('/providers/me/kyc', { doc_type: docType, file: dataUrl, filename: file.name });
    return data.document;
  } catch (err: any) {
    throw err?.response?.data?.detail || 'Upload failed';
  }
}

export async function deleteKycDoc(docType: string): Promise<void> {
  await api.delete(`/providers/me/kyc/${docType}`);
}
