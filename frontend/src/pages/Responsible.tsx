import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Leaf, TreePine, PawPrint, Camera, Recycle, VolumeX } from 'lucide-react';
import SmartImg from '@/components/SmartImg';
import { sizedImage } from '@/lib/listingContent';

/**
 * Responsible Tourism - a modernist editorial grid.
 *
 * The page is drawn as one ruled sheet: a single hairline colour, cells that
 * share their borders rather than each carrying a card shadow, and micro-labels
 * in uppercase tracking against a very large display face. Nothing floats -
 * every block sits in the grid, which is what keeps six commitments, three
 * photographs and a revenue table reading as one document.
 */

// Cards are numbered 01-06 in the design, so their order is meaningful and the
// icon list is positional rather than keyed.
const ICONS = [Recycle, TreePine, PawPrint, Leaf, Camera, VolumeX];

const HERO_IMG = 'https://himtrek.co.in/wp-content/uploads/2025/10/Sandakphu-Trek-1.webp';
const GALLERY_IMGS = [
  'https://images.pexels.com/photos/103875/pexels-photo-103875.jpeg',
  'https://d3gw4aml0lneeh.cloudfront.net/assets/locations/13712/Qn4fDURNCHPP.jpg',
  'https://images.unsplash.com/photo-1542880941-1abfea46bba6',
];
const GALLERY_FALLBACK = 'https://images.unsplash.com/photo-1584395631446-e41b0fc3f68d';

// Repeated enough to be worth naming; `rule` is the shared hairline.
const rule = 'border-[var(--line)]';
const microLabel = 'text-[10px] md:text-[11px] font-bold uppercase tracking-[0.18em] text-ink-soft';

export default function Responsible() {
  const { t } = useTranslation();
  const asArray = <T,>(key: string): T[] => {
    const v = t(key, { returnObjects: true });
    return Array.isArray(v) ? (v as T[]) : [];
  };

  const stats = asArray<{ v: string; l: string }>('responsible.stats');
  const principles = asArray<{ t: string; d: string; meta?: string }>('responsible.principles');
  const gallery = asArray<{ label: string; caption: string }>('responsible.gallery');
  const allocation = asArray<{ l: string; v: string }>('responsible.allocation');

  return (
    <div className="bg-[var(--bg)]" data-testid="responsible-page">
      <div className={`mx-auto max-w-6xl border-x ${rule}`}>

        {/* ---- Hero: copy left, photograph right ------------------------- */}
        <section className={`grid lg:grid-cols-2 border-b ${rule}`}>
          <div className={`p-6 md:p-10 lg:p-12 flex flex-col lg:border-r ${rule}`}>
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="w-6 h-px bg-pine" />
              <span className={microLabel}>{t('responsible.eyebrow')}</span>
            </div>

            <h1 className="mt-5 font-display font-extrabold text-ink leading-[0.95] tracking-tight
                           text-[2.75rem] sm:text-6xl lg:text-7xl">
              {t('responsible.title_1')}<br />{t('responsible.title_2')}
            </h1>

            <p className="mt-6 max-w-md text-sm md:text-base text-ink-soft leading-relaxed">
              {t('responsible.lead')}
            </p>

            {/* Stats sit on the hairline that closes the hero, so the numbers
                read as a footer to the statement above rather than three cards. */}
            <div className={`mt-auto pt-12 md:pt-16 grid grid-cols-3 border-t ${rule} -mx-6 md:-mx-10 lg:-mx-12 -mb-6 md:-mb-10 lg:-mb-12`}>
              {stats.map((s, i) => (
                <div
                  key={s.l}
                  data-testid={`responsible-stat-${i}`}
                  className={`px-4 md:px-6 py-5 md:py-7 ${i > 0 ? `border-l ${rule}` : ''}`}
                >
                  <div className="font-display font-extrabold text-2xl md:text-4xl text-ink leading-none">{s.v}</div>
                  <div className={`${microLabel} mt-2 leading-snug`}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Photograph with its caption. From lg the plate is notched into the
              image's lower-left as in the design; below that the image is only
              a few hundred pixels tall, so an overlay would cover a third of it
              - the caption drops beneath instead. */}
          <figure className="relative flex flex-col lg:block lg:min-h-0">
            <div className="h-56 sm:h-80 lg:h-full lg:absolute lg:inset-0 bg-mist">
              <SmartImg
                src={sizedImage(HERO_IMG, 1200)}
                fallback={GALLERY_FALLBACK}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <figcaption
              className={`bg-[var(--bg)] border-t ${rule} px-4 py-3
                          lg:absolute lg:bottom-0 lg:left-0 lg:right-1/3 lg:border-r`}
            >
              <div className={microLabel}>{t('responsible.hero_caption_label')}</div>
              <div className="mt-1 text-xs md:text-sm text-ink leading-snug">{t('responsible.hero_caption')}</div>
            </figcaption>
          </figure>
        </section>

        {/* ---- Six commitments ------------------------------------------- */}
        <section>
          <div className={`grid lg:grid-cols-2 gap-4 px-6 md:px-10 lg:px-12 py-8 md:py-10 border-b ${rule}`}>
            <h2 className={microLabel}>{t('responsible.commitments_label')}</h2>
            <p className="text-sm md:text-base text-ink-soft leading-relaxed lg:max-w-md lg:justify-self-end">
              {t('responsible.commitments_intro')}
            </p>
          </div>

          {/* Shared borders: each cell draws only its right and bottom edge, so
              no seam is ever two pixels thick. */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3">
            {principles.map((p, i) => {
              const Icon = ICONS[i % ICONS.length];
              return (
                <article
                  key={p.t}
                  data-testid={`responsible-principle-${i}`}
                  className={`group p-6 md:p-8 flex flex-col border-b ${rule}
                              sm:[&:nth-child(odd)]:border-r lg:[&:nth-child(odd)]:border-r-0
                              lg:[&:not(:nth-child(3n))]:border-r
                              hover:bg-white transition-colors`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="w-10 h-10 bg-pine text-white grid place-items-center flex-shrink-0">
                      <Icon size={18} />
                    </span>
                    <span className="font-display font-bold text-sm text-ink-soft/50 tabular-nums">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>

                  <h3 className="mt-6 font-display font-bold text-lg md:text-xl text-ink leading-snug">{p.t}</h3>
                  <p className="mt-2 text-sm text-ink-soft leading-relaxed">{p.d}</p>

                  {/* Only English carries `meta` today; other languages keep
                      their existing two-field principles and simply omit it. */}
                  {p.meta && (
                    <div className={`${microLabel} mt-auto pt-6 text-pine`}>{p.meta}</div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {/* ---- Three photographs, captioned beneath ---------------------- */}
        <section className={`grid sm:grid-cols-3 border-b ${rule}`}>
          {gallery.map((g, i) => (
            <figure
              key={g.label}
              data-testid={`responsible-gallery-${i}`}
              className={`${i > 0 ? `sm:border-l ${rule}` : ''} border-b sm:border-b-0 ${rule}`}
            >
              <div className="aspect-[4/3] bg-mist overflow-hidden">
                <SmartImg
                  src={sizedImage(GALLERY_IMGS[i] || GALLERY_FALLBACK, 700)}
                  fallback={GALLERY_FALLBACK}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </div>
              <figcaption className={`px-4 md:px-5 py-4 border-t ${rule}`}>
                <div className={microLabel}>{g.label}</div>
                <div className="mt-1 text-xs md:text-sm text-ink leading-snug">{g.caption}</div>
              </figcaption>
            </figure>
          ))}
        </section>

        {/* ---- Where the money goes -------------------------------------- */}
        <section className="grid lg:grid-cols-2 bg-pine text-white">
          <div className="p-6 md:p-10 lg:p-12 flex flex-col justify-center">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="w-6 h-px bg-white/50" />
              <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">
                {t('responsible.money_eyebrow')}
              </span>
            </div>
            <h2 className="mt-5 font-display font-extrabold text-3xl md:text-4xl lg:text-[2.75rem] leading-[1.05] tracking-tight">
              {t('responsible.money_title')}
            </h2>
            <p className="mt-5 max-w-md text-sm md:text-base text-white/80 leading-relaxed">
              {t('responsible.money_body')}
            </p>
            <Link
              to="/homestays"
              data-testid="responsible-money-cta"
              className="mt-8 inline-flex w-fit items-center gap-2 px-5 py-3 bg-white text-pine text-sm font-bold btn-hover"
            >
              {t('responsible.money_cta')} <ArrowRight size={15} />
            </Link>
          </div>

          {/* The split, as a ruled table rather than a chart - the numbers are
              the point and four bars would say less than four rows. */}
          <dl className="border-t lg:border-t-0 lg:border-l border-white/20">
            {allocation.map((a, i) => (
              <div
                key={a.l}
                data-testid={`responsible-allocation-${i}`}
                className={`flex items-baseline justify-between gap-4 px-6 md:px-10 lg:px-12 py-5 md:py-7
                            ${i > 0 ? 'border-t border-white/20' : ''}`}
              >
                <dt className="text-sm md:text-base text-white/80">{a.l}</dt>
                <dd className="font-display font-extrabold text-lg md:text-2xl whitespace-nowrap">{a.v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
