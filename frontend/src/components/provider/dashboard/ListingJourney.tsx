import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Circle, Plus, ArrowRight } from '@phosphor-icons/react';

/**
 * A short guide on the Listings tab: what a listing is, that a business can have several, and
 * where the host is in that journey. Shown until the host has a few listings.
 */
export default function ListingJourney({ count, onAdd }: { count: number; onAdd: () => void }) {
  const { t } = useTranslation();
  const steps = [
    { done: true, title: t('pd.journey.profile'), body: t('pd.journey.profile_body') },
    { done: count >= 1, title: t('pd.journey.first'), body: t('pd.journey.first_body') },
    { done: count >= 2, title: t('pd.journey.more'), body: t('pd.journey.more_body') },
  ];
  const next = steps.findIndex((s) => !s.done);
  return (
    <section className="mb-5 rounded-3xl border border-[var(--line)] bg-white p-5 md:p-6" data-testid="listing-journey">
      <div className="text-[11px] font-bold uppercase tracking-widest text-[#007C85]">{t('pd.journey.eyebrow')}</div>
      <h2 className="mt-1 font-display font-extrabold text-xl text-ink">{t('pd.journey.title')}</h2>
      <p className="mt-1 text-sm text-ink-soft">{t('pd.journey.lead')}</p>

      <ol className="mt-4 grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={i} data-testid={`journey-step-${i + 1}`}
            className={`rounded-2xl border p-4 ${i === next ? 'border-[#1F6656] bg-[rgba(31,102,86,0.06)]' : 'border-[var(--line)]'}`}>
            <div className="flex items-center gap-2">
              {s.done ? <CheckCircle size={20} weight="fill" className="text-[#1F6656]" /> : <Circle size={20} className="text-ink-soft" />}
              <span className="text-xs font-bold text-ink-soft">{t('pd.journey.step', { n: i + 1 })}</span>
            </div>
            <div className="mt-2 font-bold text-ink">{s.title}</div>
            <p className="mt-0.5 text-xs text-ink-soft leading-relaxed">{s.body}</p>
          </li>
        ))}
      </ol>

      <button type="button" onClick={onAdd} data-testid="journey-add-listing"
        className="mt-4 inline-flex items-center gap-2 h-[50px] px-6 rounded-full bg-[#1F6656] text-white font-bold text-[15px] btn-hover">
        <Plus size={16} weight="bold" /> {count === 0 ? t('pd.journey.add_first') : t('pd.journey.add_another')} <ArrowRight size={16} />
      </button>
    </section>
  );
}
