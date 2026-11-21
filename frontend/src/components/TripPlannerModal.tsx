import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ShareNetwork as Share2, Plus, Trash as Trash2, Check, MapPin } from '@phosphor-icons/react';
import { Box, Button, Chip, Chips, IconButton, SelectField, TextField } from '@/components/ag';
import { shareLink } from '@/lib/share';

/** A suggested activity is a translation key; one the traveller adds or picks is their own text. */
type ItineraryItem = string | { key: string };

interface ItineraryDay {
  day: number;
  /** Translation key of the day's heading. */
  titleKey: string;
  items: ItineraryItem[];
}

const DEFAULT_ITINERARY: ItineraryDay[] = [
  {
    day: 1,
    titleKey: 'ui.tripPlannerModal.day1.title',
    items: [
      { key: 'ui.tripPlannerModal.day1.mall_road' },
      { key: 'ui.tripPlannerModal.day1.observatory_hill' },
      { key: 'ui.tripPlannerModal.day1.glenarys' },
    ],
  },
  {
    day: 2,
    titleKey: 'ui.tripPlannerModal.day2.title',
    items: [
      { key: 'ui.tripPlannerModal.day2.tiger_hill' },
      { key: 'ui.tripPlannerModal.day2.ghum_batasia' },
      { key: 'ui.tripPlannerModal.day2.peace_pagoda' },
    ],
  },
  {
    day: 3,
    titleKey: 'ui.tripPlannerModal.day3.title',
    items: [
      { key: 'ui.tripPlannerModal.day3.happy_valley' },
      { key: 'ui.tripPlannerModal.day3.mirik_lake' },
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
  const itemText = (it: ItineraryItem) => (typeof it === 'string' ? it : t(it.key));

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
      msg += `📍 *${t('ui.tripPlannerModal.day_n', { day: d.day })}: ${t(d.titleKey)}*\n`;
      d.items.forEach((it, i) => {
        msg += `  ${i + 1}. ${itemText(it)}\n`;
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
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[720px] sm:max-w-2xl max-h-[92dvh] rounded-t-[22px] sm:rounded-[22px] bg-[var(--surface)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--warmline)]">
          <div className="min-w-0">
            <span className="ag-eyebrow">{t('ui.saved.plan', 'Plan a trip')}</span>
            <h2 id="trip-planner-title" className="font-medium text-2xl leading-8 text-[var(--ink7)]">
              {t('planner.title', 'Himalayan Trip Itinerary Builder')}
            </h2>
            <p className="ag-small">{t('planner.subtitle', 'Organize your days & share directly via WhatsApp')}</p>
          </div>
          <IconButton label={t('common.close', 'Close modal')} onClick={onClose} data-testid="trip-planner-close"><X /></IconButton>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {/* Quick add saved places */}
          {savedTitles.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="ag-eyebrow">{t('ui.tripPlannerModal.add_from_saved')}</span>
              <Chips>
                {savedTitles.map((title) => (
                  <Chip key={title} onClick={() => handleAddSavedPlace(title, 1)} title={t('ui.tripPlannerModal.add_to_day1')}>
                    {title} <span className="ag-small !text-xs">{t('ui.tripPlannerModal.plus_day1')}</span>
                  </Chip>
                ))}
              </Chips>
            </div>
          )}

          {/* Days */}
          {itinerary.map((d) => (
            <Box key={d.day} className="!gap-2">
              <div className="flex items-center gap-3">
                <span className="ag-micon !w-9 !h-9 text-xs font-medium">{t('ui.tripPlannerModal.day_short', { day: d.day })}</span>
                <h3 className="flex-1 min-w-0">{t(d.titleKey)}</h3>
                <span className="ag-small whitespace-nowrap">{t('ui.tripPlannerModal.activities', { n: d.items.length })}</span>
              </div>
              <ul className="ag-menu">
                {d.items.map((item, idx) => {
                  const it = itemText(item);
                  return (
                    <li key={`${it}-${idx}`} className="!min-h-[48px] !text-[15px]">
                      <MapPin size={18} className="flex-none text-[var(--r)]" aria-hidden="true" />
                      <span className="flex-1 min-w-0 truncate">{it}</span>
                      <IconButton small label={t('ui.tripPlannerModal.remove_item', { item: it })} onClick={() => handleRemoveItem(d.day, idx)}>
                        <Trash2 />
                      </IconButton>
                    </li>
                  );
                })}
              </ul>
            </Box>
          ))}

          {/* Add an activity */}
          <form onSubmit={handleAddItem} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <SelectField label={t('ui.tripPlannerModal.select_day')} value={targetDay} onChange={(e) => setTargetDay(Number(e.target.value))} className="sm:w-36">
              <option value={1}>{t('ui.tripPlannerModal.day_n', { day: 1 })}</option>
              <option value={2}>{t('ui.tripPlannerModal.day_n', { day: 2 })}</option>
              <option value={3}>{t('ui.tripPlannerModal.day_n', { day: 3 })}</option>
            </SelectField>
            <TextField label={t('ui.tripPlannerModal.add_label')} value={newItemText} onChange={(e) => setNewItemText(e.target.value)}
              placeholder={t('ui.tripPlannerModal.add_placeholder')} className="flex-1 min-w-0" />
            <Button type="submit" icon={<Plus />}>{t('ui.tripPlannerModal.add')}</Button>
          </form>
        </div>

        {/* Share */}
        <div className="p-4 border-t border-[var(--warmline)] flex flex-col gap-2">
          <p className="ag-small" aria-live="polite">
            {shareState === 'copied' ? t('ui.tripPlannerModal.copied_note') : t('ui.tripPlannerModal.ready_note')}
          </p>
          <Button variant="primary" block center onClick={handleShareItinerary} data-testid="trip-planner-share"
            icon={shareState === 'copied' ? <Check /> : <Share2 />}>
            {shareState === 'copied' ? t('ui.tripPlannerModal.copied') : t('ui.tripPlannerModal.share')}
          </Button>
        </div>
      </div>
    </div>
  );
}
