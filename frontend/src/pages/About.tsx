import React from 'react';
import { useTranslation } from 'react-i18next';
import { EnvelopeSimple as Mail, Phone, Check, Mountains, Stack, Translate, CurrencyInr } from '@phosphor-icons/react';
import { sizedImage } from '@/lib/listingContent';
import { useSeo } from '@/components/Seo';
import { Box, ButtonA, ButtonLink, MenuIcon, PageHead, SecHead, Status } from '@/components/ag';

// Tiger Hill ridgeline shot for the story band. Hosted on the same Cloudinary
// account as the homepage hero video, so it needs no new CSP allowance;
// sizedImage() injects a width/quality transform for it automatically.
const STORY_IMAGE = 'https://res.cloudinary.com/drgb8w8ak/image/upload/v1784109903/tigerhill_mcmhxp.webp';

// One icon per promise, in the order the strings are listed.
const PILLAR_ICONS = [Mountains, Stack, Translate, CurrencyInr];

// Roles are keys under ui.about.roles; the names stay as they are.
const TEAM_MEMBERS = [
  { name: 'Rahul', role: 'fullstack_developer', image: '/rahul.webp' },
  { name: 'Rabi', role: 'creative_director', image: '/rabi.webp' },
  { name: 'Santam', role: 'fullstack_developer', image: '/santam.webp' },
  { name: 'Soumic', role: 'tech_lead', image: '/soumic.webp' },
  { name: 'Subhendu', role: 'advisor', image: '/punpun.webp' },
  { name: 'Nikhil R', role: 'sound_engineer', image: '/nikhilrai.webp' },
  { name: 'Anjali', role: 'hr', image: '/anjali.webp' },
  { name: 'Nikhil S', role: 'graphic_designer', image: '/nikhilsubba.webp' },
];

/** "Where it works": now, next, always. */
const REACH = [
  { when: ['about.reach_now', 'Now'], t: ['about.reach_now_t', 'The Darjeeling hills and Sikkim'], d: ['about.reach_now_d', 'Where we live and where we started.'] },
  { when: ['about.reach_next', 'Next'], t: ['about.reach_next_t', 'Wherever you are'], d: ['about.reach_next_d', 'If you host, drive, cook or guide anywhere in India, list now. aangan works the same in every town and village.'] },
  { when: ['about.reach_always', 'Always'], t: ['about.reach_always_t', 'Built here, for everyone'], d: ['about.reach_always_d', 'Every improvement is tested first in the hills, then shared with every place that uses aangan.'] },
] as const;

/**
 * Public "about" page: one editorial column. Copy lives in the locale files so it translates with
 * the rest of the site; this file only decides how it is laid out.
 */
export default function About() {
  const { t } = useTranslation();
  useSeo({ title: t('about.title'), description: t('about.mission_body') });
  const list = <T,>(key: string): T[] => {
    const v = t(key, { returnObjects: true });
    return Array.isArray(v) ? (v as T[]) : [];
  };
  const stats = list<{ v: string; l: string }>('about.stats');
  const pillars = list<{ t: string; d: string }>('about.pillars');
  const chips = list<string>('about.why_chips');
  const steps = list<{ t: string; d: string }>('about.steps');
  const mission = t('about.mission_body').split('\n\n');

  return (
    <div className="ag-wrap" data-testid="about-page">
      <div className="ag-main">
        <PageHead eyebrow={t('about.ab_eye', 'About aangan')} title={t('about.hero_title', 'Made in Darjeeling. Use it anywhere.')}>
          <p className="ag-lead mt-2 mb-0 !text-[var(--r)]">{t('about.slogan', 'Travel locally.')}</p>
          <p className="mt-2 mb-0 text-base leading-relaxed text-[var(--ink7)]">
            {t('about.hero_body', 'aangan connects travellers with the people who live where they travel: the homestay family, the driver who knows every curve, the guide with the old stories, the cafe and the corner shop. It was made in the Darjeeling hills, and it works the same way in any town or village that wants it.')}
          </p>
        </PageHead>

        <div className="grid grid-cols-3 gap-2.5">
          {stats.map((s, i) => (
            <Box key={i} className="!gap-1 !p-3" data-testid={`about-stat-${i}`}>
              <b className="text-[28px] leading-[32px] font-medium text-[var(--r)]">{s.v}</b>
              <span className="ag-small !text-[13px] !leading-[18px]">{s.l}</span>
            </Box>
          ))}
        </div>

        <figure className="m-0 flex flex-col gap-1.5">
          <img src={sizedImage(STORY_IMAGE, 1200)} alt={t('about.image_caption')} loading="lazy"
            className="w-full aspect-[16/9] object-cover rounded-[22px] bg-[var(--creme2)]" />
          <figcaption className="ag-small inline-flex items-center gap-1.5"><Mountains size={16} className="text-[var(--r)]" /> {t('about.image_caption')}</figcaption>
        </figure>

        <Box as="section">
          <span className="ag-eyebrow">{t('about.mission_title')}</span>
          <h2 className="!text-xl !leading-7">{t('about.why_headline')}</h2>
          {mission.map((p, i) => (
            <p key={i} className="m-0 text-base leading-relaxed text-[var(--ink7)]">{p}</p>
          ))}
          <div className="ag-row">
            {chips.map((c, i) => (
              <Status key={i} tone="ok"><Check size={14} weight="bold" /> {c}</Status>
            ))}
          </div>
        </Box>

        <section>
          <SecHead eyebrow={t('about.reach_eye', 'Where it works')} title={t('about.reach_title', 'Made here, used anywhere')} />
          <Box>
            <ol className="flex flex-col gap-4 m-0 p-0 list-none">
              {REACH.map((r, i) => (
                <li key={r.when[0]} className="flex gap-3">
                  <Status tone={i === 0 ? 'info' : 'pending'} className="flex-none self-start min-w-[64px] justify-center">{t(r.when[0], r.when[1])}</Status>
                  <span className="min-w-0">
                    <b className="block font-medium text-[var(--ink-strong)]">{t(r.t[0], r.t[1])}</b>
                    <span className="ag-small">{t(r.d[0], r.d[1])}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Box>
        </section>

        <section>
          <SecHead eyebrow={t('about.pillars_eyebrow')} title={t('about.pillars_title', 'Four promises')} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {pillars.map((p, i) => {
              const Icon = PILLAR_ICONS[i % PILLAR_ICONS.length];
              return (
                <Box key={p.t} tone={i % 2 ? 'blush' : undefined} data-testid={`about-pillar-${i}`}>
                  <div className="flex items-center justify-between">
                    <MenuIcon><Icon /></MenuIcon>
                    <span className="ag-eyebrow tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <h3>{p.t}</h3>
                  <p className="ag-small m-0">{p.d}</p>
                </Box>
              );
            })}
          </div>
        </section>

        <section>
          <SecHead eyebrow={t('about.how_eye', 'How it works')} title={t('about.how_title_v2', 'Three simple steps')} />
          <Box>
            <ol className="flex flex-col gap-4 m-0 p-0 list-none">
              {steps.map((s, i) => (
                <li key={s.t} className="flex gap-3" data-testid={`about-step-${i}`}>
                  <span className="w-9 h-9 flex-none rounded-full bg-[var(--r)] text-white grid place-items-center font-medium" aria-hidden="true">{i + 1}</span>
                  <span className="min-w-0">
                    <b className="block font-medium text-[var(--ink-strong)]">{s.t}</b>
                    <span className="ag-small">{s.d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Box>
        </section>

        <section data-testid="about-team">
          <SecHead eyebrow={t('about.team_title')} title={t('about.team_heading', 'The people behind aangan')} />
          <p className="ag-small m-0 mb-3">{t('about.team_lead')}</p>
          {/* A swipeable strip of faces; the column's gutter is kept so the first card lines up. */}
          <ul className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory m-0 p-0 list-none pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            data-testid="about-team-strip" aria-label={t('about.team_heading', 'The people behind aangan')}>
            {TEAM_MEMBERS.map((m) => (
              <li key={m.name} className="ag-card snap-start flex-none w-[148px]">
                <img src={m.image} alt={m.name} loading="lazy" className="img !aspect-[3/4]" />
                <div className="body !py-2.5">
                  <b className="name">{m.name}</b>
                  <span className="meta">{t(`ui.about.roles.${m.role}`)}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="ag-small mt-3 mb-0">{t('about.team_note')}</p>
          <ButtonA href="https://www.1947.io" target="_blank" rel="noopener noreferrer" go size="sm" className="mt-3">
            {t('about.know_studio', 'Know Studio 1947')}
          </ButtonA>
        </section>

        <Box as="section" tone="blush">
          <h2 className="!text-xl !leading-7">{t('about.providers_title')}</h2>
          <p className="ag-small m-0 !text-[var(--ink7)]">{t('about.providers_body')}</p>
          <ButtonLink to="/provider/onboard" variant="primary" go block data-testid="about-provider-cta">
            {t('about.list_cta', 'Add my homestay, car or shop')}
          </ButtonLink>
          <div className="flex flex-wrap gap-2">
            <ButtonA href="mailto:aanganerp@gmail.com" size="sm" icon={<Mail />}>aanganerp@gmail.com</ButtonA>
            <ButtonA href="tel:+919093277919" size="sm" icon={<Phone />} data-testid="about-phone">+91 90932 77919</ButtonA>
          </div>
        </Box>
      </div>
    </div>
  );
}
