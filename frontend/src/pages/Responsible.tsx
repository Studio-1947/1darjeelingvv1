import React from 'react';
import { useTranslation } from 'react-i18next';
import { Leaf, Tree as TreePine, PawPrint, Camera, Recycle, SpeakerSlash as VolumeX } from '@phosphor-icons/react';
import SmartImg from '@/components/SmartImg';
import { sizedImage } from '@/lib/listingContent';
import { useSeo } from '@/components/Seo';
import { Box, ButtonLink, MenuIcon, PageHead, SecHead, Status } from '@/components/ag';

/**
 * Responsible Tourism: the community pledge as one editorial column. A photograph, three numbers,
 * the six commitments, three captioned photographs, then where the money goes.
 */

// The commitments are numbered 01-06, so their order is meaningful and the icon list is positional.
const ICONS = [Recycle, TreePine, PawPrint, Leaf, Camera, VolumeX];

const HERO_IMG = 'https://himtrek.co.in/wp-content/uploads/2025/10/Sandakphu-Trek-1.webp';
const GALLERY_IMGS = [
  'https://images.pexels.com/photos/103875/pexels-photo-103875.jpeg',
  'https://d3gw4aml0lneeh.cloudfront.net/assets/locations/13712/Qn4fDURNCHPP.jpg',
  'https://images.unsplash.com/photo-1542880941-1abfea46bba6',
];
const GALLERY_FALLBACK = 'https://images.unsplash.com/photo-1584395631446-e41b0fc3f68d';

export default function Responsible() {
  const { t } = useTranslation();
  useSeo({ title: t('responsible.title'), description: t('responsible.lead') });
  const asArray = <T,>(key: string): T[] => {
    const v = t(key, { returnObjects: true });
    return Array.isArray(v) ? (v as T[]) : [];
  };

  const stats = asArray<{ v: string; l: string }>('responsible.stats');
  const principles = asArray<{ t: string; d: string; meta?: string }>('responsible.principles');
  const gallery = asArray<{ label: string; caption: string }>('responsible.gallery');
  const allocation = asArray<{ l: string; v: string }>('responsible.allocation');

  return (
    <div className="ag-wrap" data-testid="responsible-page">
      <div className="ag-main">
        <PageHead eyebrow={t('responsible.eyebrow')} title={t('responsible.title')}>
          <p className="mt-2 mb-0 text-base leading-relaxed text-[var(--ink7)]">{t('responsible.lead')}</p>
        </PageHead>

        <figure className="m-0 flex flex-col gap-1.5">
          <SmartImg src={sizedImage(HERO_IMG, 1200)} fallback={GALLERY_FALLBACK} alt=""
            className="w-full aspect-[16/9] object-cover rounded-[22px] bg-[var(--creme2)]" />
          <figcaption className="ag-small">
            <span className="ag-eyebrow block">{t('responsible.hero_caption_label')}</span>
            {t('responsible.hero_caption')}
          </figcaption>
        </figure>

        <div className="grid grid-cols-3 gap-2.5">
          {stats.map((s, i) => (
            <Box key={s.l} className="!gap-1 !p-3" data-testid={`responsible-stat-${i}`}>
              <b className="text-[28px] leading-[32px] font-medium text-[var(--r)]">{s.v}</b>
              <span className="ag-small !text-[13px] !leading-[18px]">{s.l}</span>
            </Box>
          ))}
        </div>

        <section>
          <SecHead title={t('responsible.commitments_label')} />
          <p className="ag-small m-0 mb-3">{t('responsible.commitments_intro')}</p>
          <div className="flex flex-col gap-2.5">
            {principles.map((p, i) => {
              const Icon = ICONS[i % ICONS.length];
              return (
                <Box key={p.t} tone={i % 2 ? 'blush' : undefined} className="!flex-row !items-start" data-testid={`responsible-principle-${i}`}>
                  <MenuIcon><Icon /></MenuIcon>
                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3>{p.t}</h3>
                      <span className="ag-eyebrow tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                    </div>
                    <p className="ag-small m-0">{p.d}</p>
                    {/* Only English carries `meta` today; other languages simply omit it. */}
                    {p.meta && <Status tone="info" className="self-start mt-1">{p.meta}</Status>}
                  </div>
                </Box>
              );
            })}
          </div>
        </section>

        <ul className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory m-0 p-0 list-none pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {gallery.map((g, i) => (
            <li key={g.label} className="ag-card snap-start flex-none w-[78%] sm:w-[calc((100%-20px)/3)]" data-testid={`responsible-gallery-${i}`}>
              <SmartImg src={sizedImage(GALLERY_IMGS[i] || GALLERY_FALLBACK, 700)} fallback={GALLERY_FALLBACK} alt="" loading="lazy" className="img" />
              <div className="body">
                <b className="name">{g.label}</b>
                <span className="meta">{g.caption}</span>
              </div>
            </li>
          ))}
        </ul>

        <Box as="section" tone="blush">
          <span className="ag-eyebrow">{t('responsible.money_eyebrow')}</span>
          <h2 className="!text-xl !leading-7">{t('responsible.money_title')}</h2>
          <p className="ag-small m-0 !text-[var(--ink7)]">{t('responsible.money_body')}</p>
          {/* The split as a ruled list: the numbers are the point. */}
          <dl className="m-0 flex flex-col">
            {allocation.map((a, i) => (
              <div key={a.l} data-testid={`responsible-allocation-${i}`}
                className={`flex items-baseline justify-between gap-4 py-3 ${i > 0 ? 'border-t border-[var(--blush2)]' : ''}`}>
                <dt className="text-[var(--ink7)]">{a.l}</dt>
                <dd className="m-0 font-medium text-[var(--ink-strong)] whitespace-nowrap tabular-nums">{a.v}</dd>
              </div>
            ))}
          </dl>
          <ButtonLink to="/homestays" variant="primary" go block data-testid="responsible-money-cta">
            {t('responsible.money_cta')}
          </ButtonLink>
        </Box>
      </div>
    </div>
  );
}
