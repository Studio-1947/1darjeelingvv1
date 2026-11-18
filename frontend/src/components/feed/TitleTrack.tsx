import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Icon } from '@/components/ag/Icon';
import { IconButton } from '@/components/ag';

const SRC = '/media/aangan-title.mp3';

const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');

/**
 * The aangan title track at the top of the Feed: play / pause, how far along it is, and a share
 * button that sends a link to the Feed (never the audio file itself). Stops when the Feed closes.
 */
export default function TitleTrack() {
  const { t } = useTranslation();
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [len, setLen] = useState(NaN);

  useEffect(() => () => { ref.current?.pause(); }, []);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => toast.error(t('feed.tt_failed', 'Could not play the track.')));
    else a.pause();
  };

  const share = async () => {
    const url = `${window.location.origin}/feed#title-track`;
    const text = t('feed.tt_msg', 'Listen to the aangan title track. Made in Darjeeling.');
    try {
      if (navigator.share) {
        await navigator.share({ title: 'aangan', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast.success(t('feed.link_copied'));
    } catch {
      /* the share sheet was closed */
    }
  };

  const pct = Number.isFinite(len) && len > 0 ? Math.min(100, (at / len) * 100) : 0;
  return (
    <div id="title-track" className="ag-box ag-feed-tt" data-testid="feed-title-track" onContextMenu={(e) => e.preventDefault()}>
      <audio ref={ref} src={SRC} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setAt(0); }}
        onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setLen(e.currentTarget.duration)} onDurationChange={(e) => setLen(e.currentTarget.duration)} />
      <button type="button" className="ag-feed-ttplay" onClick={toggle} data-testid="feed-title-track-play"
        aria-label={playing ? t('feed.tt_pause', 'Pause') : t('feed.tt_play', 'Play')} aria-pressed={playing}>
        {playing ? <span className="ag-feed-ttbars" aria-hidden="true"><i /><i /><i /></span> : <Icon name="play" />}
      </button>
      <div className="ag-feed-ttbody">
        <b>{t('feed.tt_title', 'aangan title track')}</b>
        <span className="ag-small">
          {t('feed.tt_sub', 'Made in Darjeeling')} · <span className="tabular-nums">{fmt(at)} / {Number.isFinite(len) ? fmt(len) : '0:50'}</span>
        </span>
        <span className="ag-feed-ttbar" role="progressbar" aria-label={t('feed.tt_title', 'aangan title track')}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <i style={{ width: `${pct}%` }} />
        </span>
      </div>
      <IconButton label={t('feed.tt_share', 'Share the title track')} onClick={share} className="ag-feed-ttshare" data-testid="feed-title-track-share">
        <Icon name="share" />
      </IconButton>
    </div>
  );
}
