import React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ag/Icon';

/**
 * A short guide on My listings (prototype provider.js Listings screen): what a listing is, that a
 * business can have several, and where the host is in that journey, as a three-step track.
 */
export default function ListingJourney({ count }: { count: number; onAdd?: () => void }) {
  const { t } = useTranslation();
  const steps = [
    { done: true, title: t('pd.journey.profile'), body: t('pd.journey.profile_body') },
    { done: count >= 1, title: t('pd.journey.first'), body: t('pd.journey.first_body') },
    { done: count >= 2, title: t('pd.journey.more'), body: t('pd.journey.more_body') },
  ];
  return (
    <section className="flex flex-col gap-2" data-testid="listing-journey">
      <span className="ag-eyebrow">{t('pd.journey.eyebrow')}</span>
      <h2 className="m-0 text-lg font-medium text-[var(--ink-strong)]">{t('pd.journey.title')}</h2>
      <p className="ag-small m-0">{t('pd.journey.lead')}</p>
      <ol className="ag-host-track mt-1">
        {steps.map((s, i) => (
          <li key={i} className={s.done ? 'done' : undefined} data-testid={`journey-step-${i + 1}`}>
            <span className="d" aria-hidden="true">{s.done ? <Icon name="check" /> : i + 1}</span>
            <span className="min-w-0">
              <b>{s.title}</b>
              <span className="ag-small">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
