import React from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Plus, X } from '@phosphor-icons/react';

/**
 * Photo grid with a dashed "add" tile and remove buttons on each image.
 * Presentational - the caller owns the upload (see lib/uploadImage).
 * `compact` uses the tighter sizing of the dashboard edit modal.
 */
export default function GalleryUploader({ images, uploading, onFilesSelected, onRemove, compact = false, kinds, onKind }: {
  images: string[];
  uploading: boolean;
  onFilesSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
  compact?: boolean;
  /** Homestays: what each photo shows (front, outside, room, other), keyed by URL. */
  kinds?: Record<string, string>;
  onKind?: (url: string, kind: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className={compact ? 'grid grid-cols-3 sm:grid-cols-4 gap-3' : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4'}>
        {images.map((url, i) => (
          <div
            key={i}
            className={`aspect-[4/3] overflow-hidden border border-[var(--line)] relative group ${
              compact ? 'rounded-xl bg-mist' : 'rounded-2xl bg-white shadow-sm'
            }`}
          >
            <img src={url} alt={t('widgets.photo_alt', { index: i + 1 })} className="w-full h-full object-cover" />
            {onKind && (
              <select
                value={kinds?.[url] || ''}
                onChange={(e) => onKind(url, e.target.value)}
                aria-label={t('photoKind.label')}
                data-testid={`photo-kind-${i}`}
                className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-0.75rem)] rounded-full bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 outline-none"
              >
                <option value="">{t('photoKind.pick')}</option>
                {['front', 'outside', 'room', 'other'].map((k) => <option key={k} value={k}>{t(`photoKind.${k}`)}</option>)}
              </select>
            )}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className={`absolute rounded-full bg-black/70 hover:bg-black text-white ${
                compact
                  ? 'top-1.5 right-1.5 p-1 hover:scale-105 transition-all'
                  : 'top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity'
              }`}
            >
              <X size={compact ? 12 : 14} />
            </button>
          </div>
        ))}

        <label
          className={`aspect-[4/3] border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${
            compact ? 'rounded-xl gap-1' : 'rounded-2xl gap-2'
          } ${uploading ? 'border-pine/50 bg-pine/5 text-pine' : 'border-[var(--line)] hover:border-flag/50 text-ink-soft hover:text-flag'}`}
        >
          {uploading ? (
            <>
              <Upload size={compact ? 20 : 22} className="animate-pulse" />
              <span className={`font-bold ${compact ? 'text-[10px]' : 'text-xs'}`}>{t('common.uploading')}</span>
            </>
          ) : (
            <>
              <Plus size={compact ? 20 : 22} />
              <span className={`font-bold ${compact ? 'text-[10px]' : 'text-xs'}`}>{t('widgets.add_photos')}</span>
            </>
          )}
          <input type="file" accept="image/*" multiple onChange={onFilesSelected} disabled={uploading} className="hidden" />
        </label>
      </div>

      {!compact && images.length > 0 && (
        <p className="mt-4 text-xs text-ink-soft">
          {t('widgets.photos_added', { count: images.length })}
        </p>
      )}
    </>
  );
}
