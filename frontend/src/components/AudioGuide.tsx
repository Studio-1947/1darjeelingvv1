import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SpeakerHigh as Volume2, SpeakerSlash as VolumeX, Play, Pause } from '@phosphor-icons/react';
import { Button, IconButton } from '@/components/ag';

interface AudioGuideProps {
  title: string;
  aboutText?: string;
}

export default function AudioGuide({ title, aboutText }: AudioGuideProps) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const text = aboutText || `Welcome to ${title}, an authentic destination in the Darjeeling hills.`;

  const stopAudio = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      utteranceRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  const getBestVoice = (): SpeechSynthesisVoice | null => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (voices.length === 0) return null;
    const enVoice = voices.find(v => v.lang.toLowerCase() === 'en-in') || voices.find(v => v.lang.toLowerCase().startsWith('en'));
    return enVoice || voices[0] || null;
  };

  const playNarration = (isMuted = muted) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;

    const bestVoice = getBestVoice();

    // synth.cancel() below fires the OUTGOING utterance's onend/onerror, but only after this
    // function has already moved utteranceRef on to the new one - often on the next microtask,
    // once setPlaying(true) has already run. Without this identity check that stale callback
    // clobbers `playing` back to false even though the new utterance is speaking fine, which is
    // exactly what made a second mute/unmute cycle look broken: toggleMute() only restarts speech
    // `if (playing)`, and by then `playing` was a lie.
    const speak = (u: SpeechSynthesisUtterance, volume: number) => {
      u.rate = 0.9;
      u.pitch = 1.0;
      u.volume = volume;
      u.lang = 'en-US';
      if (bestVoice) u.voice = bestVoice;

      u.onend = () => {
        if (utteranceRef.current !== u) return;
        setPlaying(false);
        utteranceRef.current = null;
      };
      u.onerror = (e: SpeechSynthesisErrorEvent) => {
        if (utteranceRef.current !== u) return;
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          console.warn('SpeechSynthesis error:', e.error);
          if (bestVoice && u.voice !== bestVoice) {
            try {
              const fallbackUtt = new SpeechSynthesisUtterance(text);
              utteranceRef.current = fallbackUtt;
              speak(fallbackUtt, volume);
              return;
            } catch (_) {}
          }
        }
        setPlaying(false);
        utteranceRef.current = null;
      };

      utteranceRef.current = u;
      synth.speak(u);
    };

    synth.cancel();
    speak(new SpeechSynthesisUtterance(text), isMuted ? 0 : 1);
    setPlaying(true);
  };

  const togglePlay = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;

    if (playing) {
      synth.cancel();
      setPlaying(false);
    } else {
      playNarration(muted);
    }
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (playing) {
      playNarration(nextMuted);
    }
  };

  // Prototype "Listen": one tonal pill that reads the description aloud; while it plays, a mute
  // button sits beside it.
  return (
    <div data-testid="audio-guide-player" className="inline-flex items-center gap-2">
      <Button variant="tonal" size="sm" onClick={togglePlay} data-testid="audio-play-toggle"
        aria-label={playing ? t('ui.audioGuide.pause') : t('ui.audioGuide.play')}
        icon={playing ? <Pause weight="fill" /> : <Play weight="fill" />}>
        {playing
          ? (muted ? t('ui.audioGuide.playing_muted') : t('ui.audioGuide.short_pause', 'Pause'))
          : t('ui.audioGuide.short_listen', 'Listen')}
      </Button>
      {playing && (
        <IconButton small label={muted ? t('ui.audioGuide.unmute') : t('ui.audioGuide.mute')} on={muted} onClick={toggleMute}>
          {muted ? <VolumeX /> : <Volume2 />}
        </IconButton>
      )}
    </div>
  );
}
