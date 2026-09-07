import React, { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Play, Pause, Globe, Headphones } from 'lucide-react';

interface AudioGuideProps {
  title: string;
  aboutText?: string;
  transcripts?: {
    en?: string;
    bn?: string;
    hi?: string;
    ne?: string;
  };
}

export default function AudioGuide({ title, aboutText, transcripts }: AudioGuideProps) {
  const [lang, setLang] = useState<'en' | 'bn' | 'hi' | 'ne'>('en');
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const langNames: Record<'en' | 'bn' | 'hi' | 'ne', string> = {
    en: 'English',
    bn: 'বাংলা',
    hi: 'हिंदी',
    ne: 'नेपाली',
  };

  const texts: Record<'en' | 'bn' | 'hi' | 'ne', string> = {
    en: transcripts?.en || aboutText || 'Welcome to this authentic destination in the Darjeeling hills.',
    bn: transcripts?.bn || `${title} - দার্জিলিং পাহাড়ের একটি অনন্য ঐতিহ্যবাহী স্থান।`,
    hi: transcripts?.hi || `${title} - दार्जिलिंग पहाड़ियों का एक प्रसिद्ध और सुंदर स्थल।`,
    ne: transcripts?.ne || `${title} - दार्जिलिङ पहाडको ऐतिहासिक तथा सुन्दर स्थान।`,
  };

  const stopAudio = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setPlaying(false);
      utteranceRef.current = null;
    }
  };

  useEffect(() => {
    stopAudio();
  }, [lang]);

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  const getBestVoice = (targetLang: 'en' | 'bn' | 'hi' | 'ne'): SpeechSynthesisVoice | null => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (voices.length === 0) return null;

    if (targetLang === 'ne') {
      // Nepali voices are often rare on Windows/Mac; try ne-NP, ne, then Hindi (hi-IN) which uses Devanagari phonetics accurately
      const nepaliVoice = voices.find(v => v.lang.toLowerCase().startsWith('ne'));
      if (nepaliVoice) return nepaliVoice;
      const hindiVoice = voices.find(v => v.lang.toLowerCase().startsWith('hi'));
      if (hindiVoice) return hindiVoice;
      const indicVoice = voices.find(v => v.lang.includes('IN'));
      if (indicVoice) return indicVoice;
    } else if (targetLang === 'hi') {
      const hindiVoice = voices.find(v => v.lang.toLowerCase().startsWith('hi'));
      if (hindiVoice) return hindiVoice;
      const indicVoice = voices.find(v => v.lang.includes('IN'));
      if (indicVoice) return indicVoice;
    } else if (targetLang === 'bn') {
      const bengaliVoice = voices.find(v => v.lang.toLowerCase().startsWith('bn'));
      if (bengaliVoice) return bengaliVoice;
      const indicVoice = voices.find(v => v.lang.includes('IN'));
      if (indicVoice) return indicVoice;
    } else {
      const enVoice = voices.find(v => v.lang.toLowerCase() === 'en-in') || voices.find(v => v.lang.toLowerCase().startsWith('en'));
      if (enVoice) return enVoice;
    }

    return voices[0] || null;
  };

  const playNarration = (isMuted = muted) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel();

    const textToRead = texts[lang] || texts.en;
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utteranceRef.current = utterance;
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = isMuted ? 0 : 1;

    const langCode = lang === 'bn' ? 'bn-IN' : lang === 'hi' ? 'hi-IN' : lang === 'ne' ? 'ne-NP' : 'en-US';
    utterance.lang = langCode;

    const bestVoice = getBestVoice(lang);
    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    utterance.onend = () => {
      setPlaying(false);
      utteranceRef.current = null;
    };
    utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('SpeechSynthesis error:', e.error);
        if (bestVoice && utterance.voice !== bestVoice) {
          try {
            const fallbackUtt = new SpeechSynthesisUtterance(textToRead);
            fallbackUtt.volume = isMuted ? 0 : 1;
            synth.speak(fallbackUtt);
            return;
          } catch (_) {}
        }
      }
      setPlaying(false);
      utteranceRef.current = null;
    };

    synth.speak(utterance);
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
      <div className="flex items-center justify-between gap-2 flex-wrap pb-2.5 border-b border-[var(--line)]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-pine text-white flex items-center justify-center flex-shrink-0">
            <Headphones size={14} />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-pine">
            Audio Story & Narration
          </span>
        </div>

        {/* Language Selector */}
        <div className="flex items-center gap-1 bg-white border border-[var(--line)] rounded-full p-0.5 shadow-2xs">
          <Globe size={12} className="text-ink-soft ml-1.5 hidden sm:inline" />
          {(['en', 'bn', 'hi', 'ne'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition-all ${
                lang === l ? 'bg-pine text-white shadow-2xs' : 'text-ink-soft hover:text-ink'
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
          className="w-9 h-9 rounded-full bg-flag text-white flex items-center justify-center shadow-sm btn-hover flex-shrink-0"
        >
          {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-[11px] font-semibold text-ink-soft mb-1">
            <span>{playing ? (muted ? 'Playing (Muted)...' : 'Playing Narration...') : 'Listen to Audio Guide'}</span>
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
