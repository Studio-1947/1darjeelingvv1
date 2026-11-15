import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus } from '@phosphor-icons/react';
import { Box, Button, StepBar } from '@/components/ag';

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
  const done = steps.filter((s) => s.done).length;
  return (
    <Box as="section" data-testid="listing-journey">
      <div>
        <span className="ag-eyebrow">{t('pd.journey.eyebrow')}</span>
        <h2>{t('pd.journey.title')}</h2>
        <p className="ag-small">{t('pd.journey.lead')}</p>
      </div>
      <StepBar total={steps.length} at={done - 1} label={t('pd.journey.title')} />
      <ol className="grid gap-3">
        {steps.map((s, i) => (
          <li key={i} data-testid={`journey-step-${i + 1}`} className="flex items-start gap-3">
            <span className={`mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full text-xs ${s.done ? 'bg-[var(--r)] text-[var(--on-r)]' : 'border border-[var(--outline)] text-[var(--ink-muted)]'}`} aria-hidden="true">
              {s.done ? <Check size={13} weight="bold" /> : i + 1}
            </span>
            <span className="min-w-0">
              <b className="block text-[var(--ink-strong)]">{s.title}</b>
              <span className="ag-small">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <Button onClick={onAdd} icon={<Plus />} go className="self-start" data-testid="journey-add-listing">
        {count === 0 ? t('pd.journey.add_first') : t('pd.journey.add_another')}
      </Button>
    </Box>
  );
}
