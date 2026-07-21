import api from '@/lib/api';

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
