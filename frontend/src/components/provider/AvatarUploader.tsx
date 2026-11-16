import React from 'react';
import { useTranslation } from 'react-i18next';
import { Upload } from '@phosphor-icons/react';

/**
 * Round avatar (photo, or the initial while there is none) with an upload button.
 * Presentational - the caller owns the upload.
 */
export default function AvatarUploader({ src, initial, uploading, onFileSelected, label }: {
  src?: string;
  initial: string;
  uploading: boolean;
  onFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-4">
      <div className="relative grid h-20 w-20 flex-none place-items-center overflow-hidden rounded-full bg-[var(--r-tint)] text-3xl font-medium text-[var(--r)]">
        {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : (initial || 'H').charAt(0).toUpperCase()}
        {uploading && <div className="absolute inset-0 grid place-items-center bg-black/40 text-xs text-white">…</div>}
      </div>
      {/* A label styled as a small button, so the file picker opens from it. */}
      <label className="ag-btn sm cursor-pointer">
        <Upload />
        <span>{uploading ? t('common.uploading') : (label ?? t('widgets.upload_photo'))}</span>
        <input type="file" accept="image/*" onChange={onFileSelected} className="sr-only" />
      </label>
    </div>
  );
}
