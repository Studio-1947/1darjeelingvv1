import React from 'react';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import { SCREEN_H } from './layout';

/**
 * Full-screen onboarding hero mirroring the public listing page: cover photo
 * upload, inline business-name input, and a location/price meta line.
 */
export default function OnboardHero({ typeLabel, name, onName, placeholder, image, uploading, onUpload, meta }: {
  typeLabel: string;
  name: string;
  onName: (value: string) => void;
  placeholder: string;
  image?: string;
  uploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  meta: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className={`relative ${SCREEN_H} w-full overflow-hidden bg-mist border-b border-[var(--line)]`}>
      {image ? (
        <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-slate-200 grid place-items-center text-slate-400">
          {t('ob.no_cover_photo')}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/45" />

      <div className="absolute top-6 right-6 z-10">
        <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/95 backdrop-blur text-ink font-bold text-xs btn-hover cursor-pointer shadow-lg">
          <Upload size={14} /> {uploading ? t('common.uploading') : t('ob.upload_cover')}
          <input type="file" accept="image/*" onChange={onUpload} className="hidden" />
        </label>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10">
        <div className="mx-auto max-w-6xl px-4 md:px-8 pb-16 md:pb-20">
          <span className="chip bg-white/95 text-ink font-extrabold uppercase text-[10px]">{typeLabel}</span>
          <div className="mt-4 max-w-4xl">
            <input
              type="text"
              value={name}
              onChange={(e) => onName(e.target.value)}
              placeholder={placeholder}
              className="bg-transparent border-b border-white/20 text-white font-display font-extrabold text-4xl sm:text-5xl md:text-7xl outline-none focus:border-white leading-none w-full"
            />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-white/90 text-sm md:text-base font-semibold">
            {meta}
          </div>
        </div>
      </div>
    </section>
  );
}
