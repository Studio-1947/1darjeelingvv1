import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Mail, Heart, Check } from 'lucide-react';
import CircularGallery from '@/components/CircularGallery';
import { sizedImage } from '@/lib/listingContent';

// One photo per pillar, in the order the strings are listed.
const PILLAR_IMAGES = [
  'https://images.unsplash.com/photo-1615634042767-cf6ca0135666?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTZ8fGRhcmplZWxpbmclMjBsb2NhbHN8ZW58MHx8MHx8fDA%3D',
  'https://images.unsplash.com/photo-1549817997-f6958ecf47b9?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NXx8ZGFyamVlbGluZyUyMGhpbGxzfGVufDB8fDB8fHww',
  'https://images.unsplash.com/photo-1781717378976-5d308b865e7c?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8bmVwYWxpJTIwbGFuZ3VhZ2V8ZW58MHx8MHx8fDA%3D',
  'https://images.unsplash.com/photo-1729077537326-91749c1c9197?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8N3x8aW5kaWFuJTIwY3VycmVuY3l8ZW58MHx8MHx8fDA%3D',
];

// Tiger Hill ridgeline shot for the story band. Hosted on the same Cloudinary
// account as the homepage hero video, so it needs no new CSP allowance;
// sizedImage() injects a width/quality transform for it automatically.
const STORY_IMAGE = 'https://res.cloudinary.com/drgb8w8ak/image/upload/v1784109903/tigerhill_mcmhxp.webp';

const TEAM_MEMBERS = [
  { name: 'Rahul', role: 'Fullstack Developer', image: '/rahul.webp' },
  { name: 'Rabi', role: 'Creative Director', image: '/rabi.webp' },
  { name: 'Santam', role: 'Fullstack Developer', image: '/santam.webp' },
  { name: 'Soumic', role: 'Tech Lead', image: '/soumic.webp' },
  { name: 'Subhendu', role: 'Advisor', image: '/punpun.webp' },
  { name: 'Nikhil R', role: 'Sound Engineer', image: '/nikhilrai.webp' },
  { name: 'Anjali', role: 'HR', image: '/anjali.webp' },
  { name: 'Nikhil S', role: 'Graphic Designer', image: '/nikhilsubba.webp' },
];

const GALLERY_ITEMS = TEAM_MEMBERS.map(m => ({
  image: m.image,
  text: `${m.name}<br>${m.role}`
}));

/**
 * Public "about" page. All copy lives in the locale files so it translates with
 * the rest of the site; this file only decides how it is laid out.
 */
export default function About() {
  const { t } = useTranslation();
  const stats = t('about.stats', { returnObjects: true }) as { v: string; l: string }[];
  const pillars = t('about.pillars', { returnObjects: true }) as { t: string; d: string }[];
  const chips = t('about.why_chips', { returnObjects: true }) as string[];
  const steps = t('about.steps', { returnObjects: true }) as { t: string; d: string }[];

  // The mission copy is authored as two paragraphs: the first sets up the
  // problem, the second is the promise. The redesign renders the second as a
  // highlighted quote, so split rather than duplicate the string.
  const [missionIntro, ...missionRest] = t('about.mission_body').split('\n\n');
  const missionQuote = missionRest.join('\n\n');

  return (
    <div data-testid="about-page">
      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden">
        {/* Soft colour blooms behind the intro, echoing the mock. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-10 left-[8%] w-72 h-72 rounded-full bg-flag/10 blur-3xl" />
          <div className="absolute top-24 right-[6%] w-80 h-80 rounded-full bg-pine/10 blur-3xl" />
        </div>

        <div className="mx-auto max-w-5xl px-4 md:px-8 pt-12 md:pt-20 pb-4 text-center">
          
          
          <h1 className="mt-6 font-display font-extrabold text-4xl sm:text-5xl md:text-6xl text-ink leading-[1.05] tracking-tight">
            {t('about.title')}
          </h1>
          <p className="mt-5 text-base md:text-lg text-ink-soft leading-relaxed max-w-2xl mx-auto">
            {t('about.lead')}
          </p>
        </div>

        {/* Stat cards */}
        <div className="mx-auto max-w-5xl px-4 md:px-8 mt-8 md:mt-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5">
            {stats.map((s, i) => (
              <div key={i} className="card-shell p-6 md:p-8 text-center" data-testid={`about-stat-${i}`}>
                <div className={`font-display font-extrabold text-4xl md:text-5xl leading-none ${i === 0 ? 'text-flag' : 'text-pine'}`}>
                  {s.v}
                </div>
                <p className="mt-2 text-sm text-ink-soft leading-snug">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Why we built this ===== */}
      <section className="mx-auto max-w-6xl px-4 md:px-8 mt-16 md:mt-24">
        {/* Story image band */}
        <div className="relative rounded-3xl overflow-hidden border border-[var(--line)] shadow-sm h-56 sm:h-72 md:h-80">
          <img
            src={sizedImage(STORY_IMAGE, 1600)}
            alt={t('about.image_caption')}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
          <span className="absolute left-4 bottom-4 px-3 py-1.5 rounded-lg bg-black/45 backdrop-blur-sm text-white text-xs md:text-sm font-medium">
            {t('about.image_caption')}
          </span>
        </div>

        <div className="mt-10 md:mt-14 grid lg:grid-cols-2 gap-8 lg:gap-16 items-start">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-flag">{t('about.mission_title')}</div>
            <h2 className="mt-3 font-display font-extrabold text-3xl md:text-4xl text-ink leading-tight">
              {t('about.why_headline')}
            </h2>
          </div>
          <div>
            <p className="text-base md:text-lg text-ink-soft leading-relaxed">{missionIntro}</p>
            {missionQuote && (
              <blockquote className="mt-6 rounded-2xl border-l-4 border-pine bg-pine/5 p-5 md:p-6">
                <p className="font-display font-bold text-lg md:text-xl text-pine leading-snug">{missionQuote}</p>
              </blockquote>
            )}
            <div className="mt-5 flex flex-wrap gap-2.5">
              {chips.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white border border-[var(--line)] text-sm font-semibold text-ink">
                  <Check size={14} className="text-pine" /> {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== What makes it different ===== */}
      <section className="mx-auto max-w-6xl px-4 md:px-8 mt-16 md:mt-24">
        <div className="text-center text-[11px] font-bold uppercase tracking-widest text-flag">
          {t('about.pillars_eyebrow')}
        </div>
        <div className="mt-6 grid md:grid-cols-2 gap-4 md:gap-6">
          {pillars.map((p, i) => {
            const image = PILLAR_IMAGES[i % PILLAR_IMAGES.length];
            return (
              <div
                key={p.t}
                data-testid={`about-pillar-${i}`}
                className="group relative h-72 md:h-80 rounded-[20px] overflow-hidden border border-[var(--line)] shadow-sm hover:shadow-xl transition-shadow"
              >
                <img
                  src={image}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                {/* Faint number watermark, kept from the mock. */}
                <span className="absolute top-3 right-5 font-display font-extrabold text-5xl md:text-6xl text-white/25 select-none drop-shadow">
                  {String(i + 1).padStart(2, '0')}
                </span>
                {/* Dark gradient behind the text so white copy stays legible. */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent pt-24 pb-6 px-6 md:px-7">
                  <h3 className="font-display font-bold text-xl md:text-2xl text-white drop-shadow-sm">{p.t}</h3>
                  <p className="mt-2 text-sm md:text-base text-white/85 leading-relaxed drop-shadow-sm">{p.d}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== How it works ===== */}
      <section className="mx-auto max-w-5xl px-4 md:px-8 mt-16 md:mt-24">
        <h2 className="font-display font-extrabold text-3xl md:text-4xl text-ink text-center">{t('about.how_title')}</h2>
        <div className="relative mt-10 grid sm:grid-cols-3 gap-8 sm:gap-4">
          {/* One dashed rail behind all three dots - spans the centre of the
              first column to the centre of the last (1/6 -> 5/6 of the row),
              aligned to the dot centre. Desktop only; the mobile layout stacks. */}
          <span
            aria-hidden
            className="hidden sm:block absolute top-7 left-[16.6%] right-[16.6%] border-t-2 border-dashed border-[var(--line)]"
          />
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            return (
              <div key={s.t} className="relative text-center" data-testid={`about-step-${i}`}>
                <div
                  className={`relative z-10 mx-auto w-14 h-14 rounded-full grid place-items-center text-white font-display font-extrabold text-lg ${
                    isLast ? 'bg-flag' : 'bg-pine'
                  }`}
                >
                  {i + 1}
                </div>
                <h3 className="mt-4 font-display font-bold text-lg text-ink">{s.t}</h3>
                <p className="mt-1.5 text-sm text-ink-soft leading-relaxed max-w-xs mx-auto">{s.d}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== Who built this ===== */}
      <section className="mt-16 md:mt-24" data-testid="about-team">
        <div className="mx-auto max-w-2xl px-4 md:px-8 text-center">
          <h2 className="font-display font-extrabold text-3xl md:text-4xl text-ink">{t('about.team_title')}</h2>
          <p className="mt-3 text-sm md:text-base text-ink-soft leading-relaxed">{t('about.team_lead')}</p>
        </div>

        {/* Mobile: 2x4 grid of cards */}
        <div className="mx-auto max-w-5xl px-4 grid grid-cols-2 gap-3 sm:gap-4 mt-8 md:hidden" data-testid="mobile-team-grid">
          {TEAM_MEMBERS.map((member) => (
            <div
              key={member.name}
              className="relative aspect-[3/4] rounded-2xl overflow-hidden shadow-md border border-[var(--line)] group transition-transform duration-200 active:scale-[0.98]"
            >
              <img
                src={member.image}
                alt={member.name}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-12 pb-3.5 px-3.5 flex flex-col justify-end text-left">
                <h3 className="font-display font-bold text-base text-white leading-tight drop-shadow-sm">{member.name}</h3>
                <p className="text-xs text-white/85 font-medium mt-0.5 leading-snug">{member.role}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: interactive WebGL circular gallery */}
        <div className="hidden md:block relative left-1/2 -translate-x-1/2 w-screen h-[500px] sm:h-[600px] md:h-[680px] overflow-hidden bg-gradient-to-b from-mist/60 via-mist/30 to-white mt-8 border-y border-[var(--line)] shadow-inner">
          <CircularGallery
            items={GALLERY_ITEMS}
            bend={3}
            textColor="#1b2e24"
            borderRadius={0.05}
            scrollEase={0.03}
          />
        </div>

        <p className="mt-6 text-center text-sm text-ink-soft flex items-center justify-center gap-1.5">
          <Heart size={13} className="text-flag" /> {t('about.team_note')}
        </p>
      </section>

      {/* ===== Providers + contact ===== */}
      <section className="mx-auto max-w-5xl px-4 md:px-8 mt-16 md:mt-24 mb-8 md:mb-16">
        <div className="mist-panel p-8 md:p-12 text-center">
          <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">{t('about.providers_title')}</h2>
          <p className="mt-3 text-sm md:text-base text-ink-soft max-w-2xl mx-auto leading-relaxed">{t('about.providers_body')}</p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link to="/provider/onboard" data-testid="about-provider-cta"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-flag text-white font-bold btn-hover">
              {t('nav.provider')} <ArrowRight size={16} />
            </Link>
            <a href="mailto:hello@1darjeeling.in"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white border border-[var(--line)] text-ink font-bold btn-hover">
              <Mail size={16} /> hello@1darjeeling.in
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
