import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Share2, Plus, Trash2, Check, MapPin, Sparkles } from 'lucide-react';
import { shareLink } from '@/lib/share';

interface ItineraryDay {
  day: number;
  title: string;
  items: string[];
}

const DEFAULT_ITINERARY: ItineraryDay[] = [
  {
    day: 1,
    title: 'Heritage & Mall Road Explore',
    items: [
      'Chowrasta / Darjeeling Mall Road walk',
      'Observatory Hill & Mahakal Temple visit',
      'Glenary’s Bakery & Cafe afternoon tea',
    ],
  },
  {
    day: 2,
    title: 'Tiger Hill Sunrise & Monasteries',
    items: [
      'Tiger Hill sunrise over Mt. Kanchenjunga (04:30 AM)',
      'Ghum Monastery & Batasia Loop War Memorial',
      'Peace Pagoda & Japanese Temple',
    ],
  },
  {
    day: 3,
    title: 'Tea Estate & Mirik Lake Drive',
    items: [
      'Happy Valley Tea Estate factory tour & tea tasting',
      'Mirik Lake boating & Pashupati Indo-Nepal Border',
    ],
  },
];

interface TripPlannerModalProps {
  open: boolean;
  onClose: () => void;
  savedTitles?: string[];
}

export default function TripPlannerModal({ open, onClose, savedTitles = [] }: TripPlannerModalProps) {
  const { t } = useTranslation();
  const [itinerary, setItinerary] = useState<ItineraryDay[]>(DEFAULT_ITINERARY);
  const [newItemText, setNewItemText] = useState('');
  const [targetDay, setTargetDay] = useState(1);
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle');
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Close on Escape keypress
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Clean up share timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!open) return null;

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemText.trim()) return;
    setItinerary((prev) =>
      prev.map((d) =>
        d.day === targetDay ? { ...d, items: [...d.items, newItemText.trim()] } : d
      )
    );
    setNewItemText('');
  };

  const handleRemoveItem = (dayNum: number, idx: number) => {
    setItinerary((prev) =>
      prev.map((d) =>
        d.day === dayNum ? { ...d, items: d.items.filter((_, i) => i !== idx) } : d
      )
    );
  };

  const handleAddSavedPlace = (title: string, dayNum: number) => {
    setItinerary((prev) =>
      prev.map((d) =>
        d.day === dayNum && !d.items.includes(title)
          ? { ...d, items: [...d.items, title] }
          : d
      )
    );
  };

  const generateWhatsAppMessage = () => {
    let msg = `🏔️ *My 1Darjeeling Himalayan Trip Itinerary*\n\n`;
    itinerary.forEach((d) => {
      msg += `📍 *Day ${d.day}: ${d.title}*\n`;
      d.items.forEach((it, i) => {
        msg += `  ${i + 1}. ${it}\n`;
      });
      msg += `\n`;
    });
    msg += `Plan built on 1Darjeeling App (https://1darjeeling.app)`;
    return msg;
  };

  const handleShareItinerary = async () => {
    const text = generateWhatsAppMessage();
    const result = await shareLink({
      title: 'My 1Darjeeling Trip Plan',
      text: text,
      url: window.location.origin,
    });
    if (result === 'copied') {
      setShareState('copied');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setShareState('idle'), 2000);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trip-planner-title"
      data-testid="trip-planner-modal"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--line)] bg-[#14201A] text-white">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-gold" />
            <div>
              <h3 id="trip-planner-title" className="font-display font-extrabold text-lg">
                {t('planner.title', 'Himalayan Trip Itinerary Builder')}
              </h3>
              <p className="text-xs text-white/70">
                {t('planner.subtitle', 'Organize your days & share directly via WhatsApp')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Close modal')}
            data-testid="trip-planner-close"
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick add saved places if available */}
          {savedTitles.length > 0 && (
            <div className="p-3.5 bg-mist rounded-2xl border border-[var(--line)]">
              <span className="text-xs font-bold text-ink uppercase tracking-wider block mb-2">
                Add from your Saved Favorites:
              </span>
              <div className="flex flex-wrap gap-2">
                {savedTitles.map((title) => (
                  <div
                    key={title}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white border border-[var(--line)] text-xs font-bold text-ink shadow-sm"
                  >
                    <span>{title}</span>
                    <button
                      type="button"
                      onClick={() => handleAddSavedPlace(title, 1)}
                      className="ml-1 text-pine hover:text-pine-dark font-extrabold"
                      title="Add to Day 1"
                    >
                      +Day1
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Days Schedule */}
          <div className="space-y-4">
            {itinerary.map((d) => (
              <div
                key={d.day}
                className="bg-white rounded-2xl border border-[var(--line)] p-4 shadow-sm"
              >
                <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-pine text-white text-xs font-extrabold flex items-center justify-center">
                      D{d.day}
                    </span>
                    <span className="font-display font-extrabold text-base text-ink">
                      {d.title}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-ink-soft">
                    {d.items.length} Activities
                  </span>
                </div>

                <ul className="mt-3 space-y-2">
                  {d.items.map((it, idx) => (
                    <li
                      key={`${it}-${idx}`}
                      className="flex items-center justify-between gap-2 p-2 rounded-xl bg-mist text-xs text-ink font-semibold"
                    >
                      <span className="flex items-center gap-2 min-w-0 truncate">
                        <MapPin size={13} className="text-flag flex-shrink-0" />
                        <span className="truncate">{it}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(d.day, idx)}
                        className="text-ink-soft hover:text-flag p-1 flex-shrink-0"
                        title="Remove activity"
                        aria-label={`Remove ${it}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Add Activity Input */}
          <form onSubmit={handleAddItem} className="flex gap-2">
            <select
              value={targetDay}
              onChange={(e) => setTargetDay(Number(e.target.value))}
              aria-label="Select trip day"
              className="px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white text-xs font-bold text-ink outline-none"
            >
              <option value={1}>Day 1</option>
              <option value={2}>Day 2</option>
              <option value={3}>Day 3</option>
            </select>

            <input
              type="text"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              placeholder="Add custom place or activity..."
              aria-label="Add custom place or activity"
              className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--line)] bg-white text-xs text-ink outline-none"
            />

            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-pine text-white text-xs font-bold flex items-center gap-1 btn-hover flex-shrink-0"
            >
              <Plus size={14} /> Add
            </button>
          </form>
        </div>

        {/* Footer Action */}
        <div className="p-4 border-t border-[var(--line)] bg-mist flex items-center justify-between">
          <span className="text-xs text-ink-soft font-semibold">
            {shareState === 'copied' ? 'Itinerary copied to clipboard!' : 'Ready to share with family & local drivers'}
          </span>
          <button
            type="button"
            onClick={handleShareItinerary}
            data-testid="trip-planner-share"
            className="px-5 py-2.5 rounded-full bg-flag text-white font-extrabold text-xs flex items-center gap-2 btn-hover shadow-md"
          >
            {shareState === 'copied' ? <Check size={15} /> : <Share2 size={15} />}
            <span>{shareState === 'copied' ? 'Copied!' : 'Share Itinerary'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
