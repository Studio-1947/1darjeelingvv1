import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Cropper from 'react-easy-crop';
import { Minus, Plus } from '@phosphor-icons/react';
import { Button, IconButton } from '@/components/ag';
import Sheet, { SheetHead } from '@/components/listing-detail/Sheet';
import { cropToFile, type PixelCrop } from '@/lib/cropImage';

/**
 * Lets the person frame a just-picked photo in a circle before it is uploaded: drag to move,
 * pinch / wheel / slider to zoom. Hands back a square JPEG of the framed part.
 * Rendered into <body> by Sheet, so it stacks over the edit-listing sheet too.
 */
export default function PhotoCropSheet({ src, fileName, onDone, onCancel }: {
  /** Object URL of the picked file. The caller owns (and revokes) it. */
  src: string;
  fileName: string;
  onDone: (file: File) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<PixelCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const onCropComplete = useCallback((_: unknown, px: PixelCrop) => setArea(px), []);
  const clampZoom = (z: number) => Math.min(3, Math.max(1, Math.round(z * 10) / 10));

  const confirm = async () => {
    if (!area) return;
    setBusy(true);
    setFailed(false);
    try { onDone(await cropToFile(src, area, fileName)); }
    catch { setFailed(true); setBusy(false); }
  };

  return (
    <Sheet onClose={busy ? undefined : onCancel} labelledBy="photo-crop-title" testid="photo-crop-sheet" closeTestid="photo-crop-close">
      <div className="flex flex-col gap-4">
        <SheetHead id="photo-crop-title" title={t('photoCrop.title')}>
          <p className="ag-small">{t('photoCrop.hint')}</p>
        </SheetHead>

        <div className="relative h-72 w-full overflow-hidden rounded-[18px] bg-black sm:h-80">
          <Cropper image={src} crop={crop} zoom={zoom} minZoom={1} maxZoom={3} aspect={1}
            cropShape="round" showGrid={false} objectFit="contain"
            onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete} />
        </div>

        <div className="flex items-center gap-3">
          <IconButton small label={t('photoCrop.zoom_out')}
            onClick={() => setZoom((z) => clampZoom(z - 0.2))} disabled={zoom <= 1}><Minus /></IconButton>
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))}
            aria-label={t('photoCrop.zoom')} className="min-w-0 flex-1 accent-[var(--r)]" data-testid="photo-crop-zoom" />
          <IconButton small label={t('photoCrop.zoom_in')}
            onClick={() => setZoom((z) => clampZoom(z + 0.2))} disabled={zoom >= 3}><Plus /></IconButton>
        </div>

        {failed && <p className="ag-err" role="alert">{t('photoCrop.failed')}</p>}

        <div className="ag-row justify-end">
          <Button onClick={onCancel} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={confirm} disabled={busy || !area} data-testid="photo-crop-save">
            {t('photoCrop.use')}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
