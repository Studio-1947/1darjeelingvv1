import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Play, Pause, Globe, Headphones } from 'lucide-react';

interface AudioGuideProps {
  title: string;
  transcripts: {
    en: string;
    bn: string;
    hi: string;
    ne: string;
  };
}

export default function AudioGuide({ title, transcripts }: AudioGuideProps) {
  const [lang, setLang] = useState<'en' | 'bn' | 'hi' | 'ne'>('en');
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);

  const langNames = {
    en: 'English',
    bn: 'বাংলা',
    hi: 'हिंदी',
    ne: 'नेपाली',
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setPlaying(false);
    }
  }, [lang]);

  const togglePlay = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;

    if (playing) {
      synth.pause();
      setPlaying(false);
    } else {
      if (synth.paused) {
        synth.resume();
        setPlaying(true);
      } else {
        synth.cancel();
        const text = transcripts[lang] || transcripts.en;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1.0;
        utterance.lang = lang === 'bn' ? 'bn-IN' : lang === 'hi' ? 'hi-IN' : lang === 'ne' ? 'ne-NP' : 'en-US';
        utterance.onend = () => setPlaying(false);
        utterance.onerror = () => setPlaying(false);
        synth.speak(utterance);
        setPlaying(true);
      }
    }
  };

  return (
    <div
      data-testid="audio-guide-player"
      className="rounded-2xl border border-[var(--line)] bg-gradient-to-r from-mist via-white to-mist p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--line)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-pine text-white flex items-center justify-center">
            <Headphones size={16} />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-pine">
              Heritage Audio Guide
            </div>
            <div className="font-display font-extrabold text-sm text-ink">{title}</div>
          </div>
        </div>

        {/* Language Selector */}
        <div className="flex items-center gap-1 bg-white border border-[var(--line)] rounded-full p-1 shadow-xs">
          <Globe size={13} className="text-ink-soft ml-1.5" />
          {(['en', 'bn', 'hi', 'ne'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition-all ${
                lang === l ? 'bg-pine text-white' : 'text-ink-soft hover:text-ink'
              }`}
            >
              {langNames[l]}
            </button>
          ))}
        </div>
      </div>

      {/* Player Bar */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          data-testid="audio-play-toggle"
          aria-label={playing ? 'Pause Narration' : 'Play Narration'}
          className="w-10 h-10 rounded-full bg-flag text-white flex items-center justify-center shadow-md btn-hover flex-shrink-0"
        >
          {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-[11px] font-semibold text-ink-soft mb-1">
            <span>{playing ? 'Playing Heritage Story...' : 'Tap Play to Listen'}</span>
            <span>{langNames[lang]}</span>
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
          onClick={() => setMuted(!muted)}
          className="text-ink-soft hover:text-ink p-1 flex-shrink-0"
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      </div>

      {/* Transcript text fallback */}
      <p className="mt-3 text-xs text-ink-soft leading-relaxed italic bg-white/70 p-2.5 rounded-xl border border-[var(--line)] line-clamp-3">
        "{transcripts[lang] || transcripts.en}"
      </p>
    </div>
  );
}
