import React from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Plus, X } from '@phosphor-icons/react';
import { IconButton } from '@/components/ag';

/**
 * Photo grid with an "add photos" tile and a remove button on each image.
 * Presentational - the caller owns the upload (see lib/uploadImage).
 * With `onMakeCover`, the first photo is the listing's cover (tagged so) and every other photo can
 * be moved to the front: a listing has no cover of its own besides its photos (decision 2026-11-26;
 * the one separate cover is the business's, on the Business profile).
 */
export default function GalleryUploader({ images, uploading, onFilesSelected, onRemove, kinds, onKind, onMakeCover }: {
  images: string[];
  uploading: boolean;
  onFilesSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
  /** Homestays: what each photo shows (front, outside, room, other), keyed by URL. */
  kinds?: Record<string, string>;
  onKind?: (url: string, kind: string) => void;
  /** Move this photo to the front, making it the cover. */
  onMakeCover?: (index: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {images.map((url, i) => (
        <div key={i} className="relative aspect-[4/3] overflow-hidden rounded-[18px] border border-[var(--warmline)] bg-[var(--creme2)]">
          <img src={url} alt={t('widgets.photo_alt', { index: i + 1 })} className="h-full w-full object-cover" />
          {onMakeCover && (i === 0 ? (
            <span className="absolute left-2 top-2 rounded-full bg-[rgb(0_0_0/.6)] px-2.5 py-1 text-xs font-semibold text-white" data-testid="photo-cover-tag">
              {t('widgets.cover', 'Cover')}
            </span>
          ) : (
            <button type="button" onClick={() => onMakeCover(i)} data-testid={`photo-make-cover-${i}`}
              className="absolute left-2 top-2 min-h-8 rounded-full bg-[var(--surface)] px-3 text-xs font-medium text-[var(--ink-strong)] hover:text-[var(--r)]">
              {t('widgets.make_cover', 'Make cover')}
            </button>
          ))}
          {onKind && (
            <select
              value={kinds?.[url] || ''}
              onChange={(e) => onKind(url, e.target.value)}
              aria-label={t('photoKind.label')}
              data-testid={`photo-kind-${i}`}
              className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] rounded-full border-0 bg-[var(--surface)] px-3 py-1 text-xs text-[var(--ink-strong)] outline-none"
            >
              <option value="">{t('photoKind.pick')}</option>
              {['front', 'outside', 'room', 'other'].map((k) => <option key={k} value={k}>{t(`photoKind.${k}`)}</option>)}
            </select>
          )}
          <IconButton small label={t('ui.pricedEditor.remove')} onClick={() => onRemove(i)} className="absolute right-2 top-2">
            <X />
          </IconButton>
        </div>
      ))}

      <label className={`grid aspect-[4/3] cursor-pointer place-items-center content-center gap-1 rounded-[18px] border-2 border-dashed text-sm ${uploading ? 'border-[var(--r)] text-[var(--r)]' : 'border-[var(--outline)] text-[var(--ink-muted)] hover:border-[var(--r)] hover:text-[var(--r)]'}`}>
        {uploading ? <Upload size={22} className="animate-pulse" /> : <Plus size={22} />}
        <span className="font-medium">{uploading ? t('common.uploading') : t('widgets.add_photos')}</span>
        <input type="file" accept="image/*" multiple onChange={onFilesSelected} disabled={uploading} className="sr-only" />
      </label>
    </div>
  );
}
