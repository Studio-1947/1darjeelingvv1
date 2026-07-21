import React from 'react';
import { useTranslation } from 'react-i18next';
import { Leaf, TreePine, PawPrint, Camera, Recycle, VolumeX } from 'lucide-react';

const ICONS = [Recycle, TreePine, PawPrint, Leaf, Camera, VolumeX];

export default function Responsible() {
  const { t } = useTranslation();
  const items = t('responsible.principles', { returnObjects: true }) as any;
  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-10 md:py-14" data-testid="responsible-page">
      <div className="text-center max-w-2xl mx-auto">
        <span className="chip">Community pledge</span>
        <h1 className="mt-4 font-display font-extrabold text-3xl sm:text-4xl md:text-6xl text-ink leading-tight">
          {t('responsible.title')}
        </h1>
        <p className="mt-4 md:mt-5 text-base md:text-lg text-ink-soft leading-relaxed">{t('responsible.lead')}</p>
      </div>

      <div className="mt-10 md:mt-14 grid md:grid-cols-2 gap-5 md:gap-6">
        {items.map((p, i) => {
          const Icon = ICONS[i % ICONS.length];
          return (
            <div key={p.t} className="card-shell p-5 md:p-7 flex gap-4 md:gap-5" data-testid={`responsible-principle-${i}`}>
              <div className="w-11 h-11 md:w-12 md:h-12 rounded-2xl bg-pine text-white grid place-items-center flex-shrink-0">
                <Icon size={20} />
              </div>
              <div>
                <h3 className="font-display font-bold text-lg md:text-xl text-ink">{p.t}</h3>
                <p className="text-sm md:text-base text-ink-soft mt-1 leading-relaxed">{p.d}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 md:mt-14 mist-panel p-6 md:p-10 text-center">
        <h3 className="font-display font-extrabold text-xl md:text-2xl text-ink">Every booking supports local families.</h3>
        <p className="mt-2 text-sm md:text-base text-ink-soft">1 Darjeeling directs tourism revenue to Darjeeling-owned businesses — homestays, drivers, tea houses and artisans.</p>
      </div>
    </div>
  );
}
