import React from 'react';
import { useTranslation } from 'react-i18next';

export default function Privacy() {
  const { t } = useTranslation();
  const sections = t('privacy.sections', { returnObjects: true });
  return (
    <div className="mx-auto max-w-3xl px-5 md:px-8 py-14" data-testid="privacy-page">
      <h1 className="font-display font-extrabold text-4xl md:text-5xl text-ink">{t('privacy.title')}</h1>
      <p className="text-sm text-ink-soft mt-2">{t('privacy.updated')}</p>
      <div className="mt-10 space-y-8">
        {sections.map((s, i) => (
          <div key={i}>
            <h2 className="font-display font-bold text-2xl text-ink">{s.h}</h2>
            <p className="mt-2 text-ink-soft leading-relaxed">{s.p}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
