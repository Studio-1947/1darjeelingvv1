import React from 'react';
import { Upload } from 'lucide-react';

/**
 * Round avatar (photo, or a branded initial while there is none) with an
 * upload button. Presentational - the caller owns the upload. Pass a flex
 * `className` to arrange the button beside (row) or under (column) the photo.
 */
export default function AvatarUploader({
  src,
  initial,
  uploading,
  onFileSelected,
  label = 'Upload Photo',
  size = 'lg',
  className = 'flex items-center gap-4',
}: {
  src?: string;
  initial: string;
  uploading: boolean;
  onFileSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label?: string;
  size?: 'lg' | 'sm';
  className?: string;
}) {
  const sizeCls = size === 'lg' ? 'w-24 h-24 md:w-32 md:h-32 text-4xl md:text-5xl' : 'w-20 h-20 text-2xl';
  return (
    <div className={className}>
      <div className={`${sizeCls} rounded-full bg-gradient-to-br from-pine to-pine-dark text-white overflow-hidden shadow-md flex items-center justify-center font-display font-extrabold flex-shrink-0 relative`}>
        {src ? (
          <img src={src} alt="" className="w-full h-full object-cover" />
        ) : (
          (initial || 'H').charAt(0).toUpperCase()
        )}
        {uploading && <div className="absolute inset-0 bg-black/40 grid place-items-center text-[10px] text-white">...</div>}
      </div>
      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[var(--line)] text-ink font-bold text-xs btn-hover cursor-pointer shadow-sm">
        <Upload size={12} /> {uploading ? 'Uploading...' : label}
        <input type="file" accept="image/*" onChange={onFileSelected} className="hidden" />
      </label>
    </div>
  );
}
