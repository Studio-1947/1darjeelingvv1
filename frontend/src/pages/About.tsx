import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mountain, Users, Languages, HandCoins, ArrowRight, Mail, Heart } from 'lucide-react';
import { TEAM } from '@/constants/team';

// One icon per pillar, in the order the strings are listed.
const PILLAR_ICONS = [Users, Mountain, Languages, HandCoins];

/** Headshot if there is one, otherwise the member's initial - never a broken image. */
function MemberAvatar({ name, photo }: { name: string; photo?: string }) {
  const [failed, setFailed] = React.useState(false);
  const base = 'w-20 h-20 md:w-24 md:h-24 rounded-full mx-auto overflow-hidden';
  if (!photo || failed) {
    return (
      <div className={`${base} bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-display font-extrabold text-2xl md:text-3xl`}>
        {(name || '?').trim().charAt(0).toUpperCase()}
      </div>
    );
  }
  return <img src={photo} alt="" onError={() => setFailed(true)} className={`${base} object-cover`} />;
}

/**
 * Public "about" page. All copy lives in the locale files so it translates with
 * the rest of the site; this file only decides how it is laid out.
 */
export default function About() {
  const { t } = useTranslation();
  const pillars = t('about.pillars', { returnObjects: true }) as { t: string; d: string }[];
  const steps = t('about.steps', { returnObjects: true }) as { t: string; d: string }[];

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-8 py-10 md:py-14" data-testid="about-page">
      {/* Intro */}
      <div className="text-center max-w-2xl mx-auto">
        <span className="chip">{t('about.eyebrow')}</span>
        <h1 className="mt-4 font-display font-extrabold text-3xl sm:text-4xl md:text-6xl text-ink leading-tight">
          {t('about.title')}
        </h1>
        <p className="mt-4 md:mt-5 text-base md:text-lg text-ink-soft leading-relaxed">{t('about.lead')}</p>
      </div>

      {/* Why we exist */}
      <div className="mt-10 md:mt-14 mist-panel p-6 md:p-10">
        <h2 className="font-display font-extrabold text-xl md:text-3xl text-ink">{t('about.mission_title')}</h2>
        <p className="mt-3 text-sm md:text-lg text-ink-soft leading-relaxed whitespace-pre-line">{t('about.mission_body')}</p>
      </div>

      {/* What we stand for */}
      <div className="mt-10 md:mt-14 grid md:grid-cols-2 gap-5 md:gap-6">
        {pillars.map((p, i) => {
          const Icon = PILLAR_ICONS[i % PILLAR_ICONS.length];
          return (
            <div key={p.t} className="card-shell p-5 md:p-7 flex gap-4 md:gap-5" data-testid={`about-pillar-${i}`}>
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

      {/* How it works */}
      <div className="mt-10 md:mt-14">
        <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink text-center">{t('about.how_title')}</h2>
        <div className="mt-6 md:mt-8 grid sm:grid-cols-3 gap-4 md:gap-5">
          {steps.map((s, i) => (
            <div key={s.t} className="card-shell p-5 md:p-6" data-testid={`about-step-${i}`}>
              <div className="w-8 h-8 rounded-full bg-mist text-ink font-display font-extrabold grid place-items-center text-sm">
                {i + 1}
              </div>
              <h3 className="mt-4 font-display font-bold text-lg text-ink">{s.t}</h3>
              <p className="text-sm text-ink-soft mt-1 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Who built this */}
      <div className="mt-10 md:mt-14" data-testid="about-team">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">{t('about.team_title')}</h2>
          <p className="mt-3 text-sm md:text-base text-ink-soft leading-relaxed">{t('about.team_lead')}</p>
        </div>

        <div className="mt-6 md:mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
          {TEAM.map((m) => {
            const card = (
              <>
                <MemberAvatar name={m.name} photo={m.photo} />
                <h3 className="mt-4 font-display font-bold text-base md:text-lg text-ink">{m.name}</h3>
                <p className="text-xs md:text-sm text-ink-soft mt-0.5">{t(`about.roles.${m.roleKey}`)}</p>
              </>
            );
            // Only the members who gave a profile link become clickable.
            return m.url ? (
              <a key={m.name} href={m.url} target="_blank" rel="noopener noreferrer"
                data-testid={`about-team-${m.name}`}
                className="card-shell p-5 md:p-6 text-center btn-hover">
                {card}
              </a>
            ) : (
              <div key={m.name} data-testid={`about-team-${m.name}`} className="card-shell p-5 md:p-6 text-center">
                {card}
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-sm text-ink-soft flex items-center justify-center gap-1.5">
          <Heart size={13} className="text-flag" /> {t('about.team_note')}
        </p>
      </div>

      {/* Providers + contact */}
      <div className="mt-10 md:mt-14 mist-panel p-6 md:p-10 text-center">
        <h2 className="font-display font-extrabold text-xl md:text-2xl text-ink">{t('about.providers_title')}</h2>
        <p className="mt-2 text-sm md:text-base text-ink-soft max-w-2xl mx-auto leading-relaxed">{t('about.providers_body')}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to="/provider/onboard" data-testid="about-provider-cta"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-flag text-white font-bold btn-hover">
            {t('nav.provider')} <ArrowRight size={16} />
          </Link>
          <a href="mailto:hello@1darjeeling.in"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white border border-[var(--line)] text-ink font-bold btn-hover">
            <Mail size={16} /> hello@1darjeeling.in
          </a>
        </div>
      </div>
    </div>
  );
}
