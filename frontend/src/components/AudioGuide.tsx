import React, { useState, useEffect, useRef } from 'react';
import { SpeakerHigh as Volume2, SpeakerSlash as VolumeX, Play, Pause, Headphones } from '@phosphor-icons/react';

interface AudioGuideProps {
  title: string;
  aboutText?: string;
}

export default function AudioGuide({ title, aboutText }: AudioGuideProps) {
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

  return (
    <div
      data-testid="audio-guide-player"
      className="mt-6 rounded-2xl border border-[var(--line)] bg-gradient-to-r from-mist via-white to-mist p-3.5 sm:p-4 shadow-xs"
    >
      <div className="flex items-center gap-2 pb-2.5 border-b border-[var(--line)]">
        <div className="w-7 h-7 rounded-full bg-pine text-white flex items-center justify-center flex-shrink-0">
          <Headphones size={14} />
        </div>
        <span className="text-xs font-bold uppercase tracking-wider text-pine">
          Audio Story & Narration
        </span>
      </div>

      {/* Player Bar */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          data-testid="audio-play-toggle"
          aria-label={playing ? 'Pause Narration' : 'Play Narration'}
          className="w-9 h-9 rounded-full bg-flag text-white flex items-center justify-center shadow-sm btn-hover flex-shrink-0"
        >
          {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-ink-soft mb-1">
            {playing ? (muted ? 'Playing (Muted)...' : 'Playing Narration...') : 'Listen to Audio Guide'}
          </div>
          <div className="h-1.5 w-full bg-line rounded-full overflow-hidden">
            <div
              className={`h-full bg-pine transition-all duration-300 ${
                playing ? 'w-3/4 animate-pulse' : 'w-0'
              }`}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
          className="text-ink-soft hover:text-ink p-1.5 rounded-lg hover:bg-mist transition-colors flex-shrink-0"
        >
          {muted ? <VolumeX size={17} className="text-flag" /> : <Volume2 size={17} />}
        </button>
      </div>
    </div>
  );
}
