import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, CircleNotch as Loader2, Trash } from '@phosphor-icons/react';
import { Button } from '@/components/ag';
import { SUPPORTED_IMAGE_ACCEPT } from '@/lib/uploadImage';
import { loadImage } from '@/lib/cropImage';
import PhotoCropSheet from './PhotoCropSheet';

/**
 * Round avatar (photo, or the initial while there is none) with upload / change / remove.
 * A picked photo is framed in a crop sheet first; the caller gets the cropped file and owns
 * the upload, telling us back through `uploading`. While it uploads, the cropped photo shows
 * under a spinner so the person can see what is going up.
 */
export default function AvatarUploader({ src, initial, uploading, onFile, onRemove, label }: {
  src?: string;
  initial: string;
  uploading: boolean;
  /** Called with the cropped photo (or the original, when the browser cannot open it to crop). */
  onFile: (file: File) => void;
  /** Shown as "Remove" once there is a photo. Omit where a photo cannot be removed. */
  onRemove?: () => void;
  label?: string;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<{ url: string; name: string } | null>(null);
  const [preview, setPreview] = useState('');
  const wasUploading = useRef(uploading);

  // Once the upload settles, the caller's `src` is the truth again (new photo, or the old one on failure).
  useEffect(() => {
    if (wasUploading.current && !uploading) setPreview('');
    wasUploading.current = uploading;
  }, [uploading]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked.url); }, [picked]);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so picking the same file again still fires
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      await loadImage(url);
      setPicked({ url, name: file.name });
    } catch {
      // Formats the browser can't draw (HEIC on most desktops) go up as they are, uncropped;
      // uploadImage still refuses anything the server won't take, with its own message.
      URL.revokeObjectURL(url);
      onFile(file);
    }
  };

  const onCropped = (file: File) => {
    setPicked(null);
    setPreview(URL.createObjectURL(file));
    onFile(file);
  };

  const shown = preview || src;
  return (
    <div className="flex flex-wrap items-center gap-4" data-testid="avatar-uploader">
      <div className="relative grid h-20 w-20 flex-none place-items-center overflow-hidden rounded-full bg-[var(--r-tint)] text-3xl font-medium text-[var(--r)]">
        {shown ? <img src={shown} alt="" className="h-full w-full object-cover" /> : (initial || 'H').charAt(0).toUpperCase()}
        {uploading && (
          <div className="absolute inset-0 grid place-items-center bg-black/45 text-white" data-testid="avatar-uploading">
            <Loader2 size={24} className="animate-spin" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={uploading} onClick={() => input.current?.click()} data-testid="avatar-pick"
          icon={uploading ? <Loader2 className="animate-spin" /> : <Upload />}>
          {uploading ? t('common.uploading') : src ? t('photoCrop.change') : (label ?? t('widgets.upload_photo'))}
        </Button>
        {src && onRemove && !uploading && (
          <Button size="sm" variant="text" icon={<Trash />} onClick={onRemove} data-testid="avatar-remove">
            {t('common.remove')}
          </Button>
        )}
        <input ref={input} type="file" accept={SUPPORTED_IMAGE_ACCEPT} onChange={onChange} className="sr-only" tabIndex={-1} aria-hidden="true" />
      </div>
      <span className="sr-only" role="status" aria-live="polite">{uploading ? t('photoCrop.uploading') : ''}</span>

      {picked && (
        <PhotoCropSheet src={picked.url} fileName={picked.name} onDone={onCropped} onCancel={() => setPicked(null)} />
      )}
    </div>
  );
}
