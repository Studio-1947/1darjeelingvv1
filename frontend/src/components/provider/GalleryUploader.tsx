import React from 'react';
import { Upload, Plus, X } from 'lucide-react';

/**
 * Photo grid with a dashed "add" tile and remove buttons on each image.
 * Presentational - the caller owns the upload (see lib/uploadImage).
 * `compact` uses the tighter sizing of the dashboard edit modal.
 */
export default function GalleryUploader({ images, uploading, onFilesSelected, onRemove, compact = false }: {
  images: string[];
  uploading: boolean;
  onFilesSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
  compact?: boolean;
}) {
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
            <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
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
              <span className={`font-bold ${compact ? 'text-[10px]' : 'text-xs'}`}>Uploading...</span>
            </>
          ) : (
            <>
              <Plus size={compact ? 20 : 22} />
              <span className={`font-bold ${compact ? 'text-[10px]' : 'text-xs'}`}>Add Photos</span>
            </>
          )}
          <input type="file" accept="image/*" multiple onChange={onFilesSelected} disabled={uploading} className="hidden" />
        </label>
      </div>

      {!compact && images.length > 0 && (
        <p className="mt-4 text-xs text-ink-soft">
          {images.length} photo{images.length !== 1 ? 's' : ''} added. Hover any photo to remove it.
        </p>
      )}
    </>
  );
}
