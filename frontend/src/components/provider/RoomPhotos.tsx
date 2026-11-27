import React from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, CircleNotch as Loader2, X } from '@phosphor-icons/react';
import { MAX_ROOM_PHOTOS } from '@/lib/roomFit';

/**
 * A homestay room's photos (up to MAX_ROOM_PHOTOS, the first is the cover), as a row of tiles with an
 * add tile at the end. Used by the sign-up wizard's room card and the listing editor's rooms, so both
 * look and behave the same. Photos upload one at a time; each lands through `onAdd` on the room as it
 * is then, so a host typing meanwhile loses nothing.
 */
export default function RoomPhotos({ photos, upload, onAdd, onRemove, onBusy, testid }: {
  photos: string[];
  /** Uploads one file and gives its URL (throws a message to show when it fails). */
  upload: (f: File) => Promise<string>;
  onAdd: (url: string) => void;
  onRemove: (index: number) => void;
  /** Told when uploads start and end, so the page can hold back removing rooms (photos land by position). */
  onBusy?: (busy: boolean) => void;
  testid: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const room = MAX_ROOM_PHOTOS - photos.length;
  const add = async (files: File[]) => {
    if (busy || !files.length) return;
    setBusy(true);
    onBusy?.(true);
    setErr('');
    try {
      // One bad file does not stop the rest; the first problem is said, and so is anything over the limit.
      let problem = files.length > room ? t('room.photos_over', { max: MAX_ROOM_PHOTOS, defaultValue: 'A room can have up to {{max}} photos. The rest were left out.' }) : '';
      for (const f of files.slice(0, room)) {
        try { onAdd(await upload(f)); } catch (e) { problem = problem || (typeof e === 'string' ? e : t('kyc.uploadFailed')); }
      }
      setErr(problem);
    } finally { setBusy(false); onBusy?.(false); }
  };
  const label = t('room.photos_label', 'Photos of this room');
  return (
    <div className="ag-field" role="group" aria-label={label} data-testid={testid}>
      <span>{label} <span className="font-normal text-[var(--ink-muted)]">{photos.length}/{MAX_ROOM_PHOTOS}</span></span>
      <div className="flex flex-wrap gap-2">
        {photos.map((src, i) => (
          <span key={`${i}-${src}`} className="relative h-16 w-16 flex-none overflow-hidden rounded-2xl bg-[var(--r-tint)]">
            <img src={src} alt="" className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[10px] font-medium leading-3 text-white">{t('room.cover', 'Cover')}</span>
            )}
            <button type="button" onClick={() => onRemove(i)} aria-label={t('room.remove_photo', { n: i + 1, defaultValue: 'Remove photo {{n}}' })}
              className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white" data-testid={`${testid}-remove-${i}`}>
              <X size={12} weight="bold" aria-hidden="true" />
            </button>
          </span>
        ))}
        {room > 0 && (
          <label className={`relative grid h-16 w-16 flex-none place-items-center rounded-2xl border border-dashed border-[var(--outline)] text-[var(--r)] ${busy ? 'pointer-events-none' : 'cursor-pointer'} focus-within:ring-2 focus-within:ring-[var(--r)]`}
            aria-busy={busy}>
            {busy ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <Camera size={20} aria-hidden="true" />}
            <span className="sr-only" role="status" aria-live="polite">{busy ? t('common.uploading') : ''}</span>
            <input type="file" accept="image/*" multiple className="sr-only" disabled={busy} data-testid={`${testid}-input`} aria-label={t('ui.pricedEditor.add_photo')}
              onChange={(e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; void add(fs); }} />
          </label>
        )}
      </div>
      {err ? <p className="ag-err" role="alert">{err}</p> : <span className="hint">{t('room.photos_hint', 'The first photo is the cover. Show the bed, the view and the bathroom.')}</span>}
    </div>
  );
}
