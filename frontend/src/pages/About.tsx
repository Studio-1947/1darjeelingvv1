import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useSeo } from '@/components/Seo';
import { Box, ButtonA, ButtonLink, IconButton, SecHead, Status } from '@/components/ag';
import { Icon, type IconName } from '@/components/ag/Icon';
import '@/styles/screens/about.css';

/** One icon per promise, in the order about.pillars lists them (prototype about.js `diff`). */
const PILLAR_ICONS: IconName[] = ['mountain', 'globe', 'home', 'check'];

/** "Where it works": now, next, always. */
const REACH = [
  { when: ['about.reach_now', 'Now'], t: ['about.reach_now_t', 'The Darjeeling hills and Sikkim'], d: ['about.reach_now_d', 'Where we live and where we started.'] },
  { when: ['about.reach_next', 'Next'], t: ['about.reach_next_t', 'Wherever you are'], d: ['about.reach_next_d', 'If you host, drive, cook or guide anywhere in India, list now. aangan works the same in every town and village.'] },
  { when: ['about.reach_always', 'Always'], t: ['about.reach_always_t', 'Built here, for everyone'], d: ['about.reach_always_d', 'Every improvement is tested first in the hills, then shared with every place that uses aangan.'] },
] as const;

type Group = 'dreamer' | 'cocreator' | 'advisor' | 'developer' | 'creatives';
/**
 * The team, in the prototype's order (about.js `team`). Names stay as written; each one's title,
 * speciality and part in aangan are under about.people.<key> and about.group.<group>.
 * Photos: public/media/team/<key>.jpg.
 */
const TEAM: { key: string; name: string; group: Group }[] = [
  { key: 'rabi', name: 'Rabi', group: 'dreamer' },
  { key: 'dipam', name: 'Dipam', group: 'cocreator' },
  { key: 'anjali', name: 'Anjali', group: 'cocreator' },
  { key: 'subhendu', name: 'Subhendu', group: 'cocreator' },
  { key: 'pinaki', name: 'Pinaki', group: 'advisor' },
  { key: 'subhayu', name: 'Subhayu', group: 'advisor' },
  { key: 'santam', name: 'Santam', group: 'developer' },
  { key: 'soumic', name: 'Soumic', group: 'developer' },
  { key: 'nikhilsubba', name: 'Nikhil S', group: 'creatives' },
  { key: 'rahul', name: 'Rahul', group: 'developer' },
  { key: 'dipanjan', name: 'Dipanjan', group: 'creatives' },
];
const photo = (key: string) => `/media/team/${key}.jpg`;

/**
 * "600+" style: the real number of listings on the map, rounded down so it never overstates.
 * Small numbers are shown as they are.
 */
const roughCount = (n: number) => {
  const step = n < 20 ? 1 : n < 100 ? 10 : n < 1000 ? 50 : 100;
  const down = Math.floor(n / step) * step;
  return down < n ? `${down}+` : String(n);
};

/** A team member's profile over the page: photo, title, speciality, part in aangan. */
function TeamPop({ i, onClose }: { i: number; onClose: () => void }) {
  const { t } = useTranslation();
  const m = TEAM[i];
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [onClose]);
  const spec = t(`about.people.${m.key}.spec`, '');
  return createPortal(
    <div className="ag-about-pop" onClick={onClose} role="presentation" data-testid="about-team-pop">
      <div className="ag-about-popbox" role="dialog" aria-modal="true" aria-labelledby="about-pop-name" onClick={(e) => e.stopPropagation()}>
        <IconButton ref={closeRef} label={t('common.close', 'Close')} onClick={onClose} className="ag-about-popx" data-testid="about-team-pop-close"><Icon name="close" /></IconButton>
        <span className="ag-about-ph" style={{ backgroundImage: `url(${photo(m.key)})` }} role="img" aria-label={m.name} />
        <h2 id="about-pop-name">{m.name}</h2>
        <p className="ag-about-role">{t(`about.people.${m.key}.role`)}</p>
        {spec && <p className="ag-small">{spec}</p>}
        <p className="aangan"><Icon name="mountain" /> {t('about.team_aangan', { group: t(`about.group.${m.group}`) })}</p>
        <p className="ag-small">{t('about.team_studio', 'Studio 1947 · Mirik, Darjeeling')}</p>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Public "about" page, matching the prototype's About aangan (Aangan-2.0 about.js) section for
 * section. Copy lives in the locale files (about.*) so it translates with the rest of the site.
 */
export default function About() {
  const { t } = useTranslation();
  useSeo({ title: t('about.title'), description: t('about.hero_body') });
  const list = <T,>(key: string): T[] => {
    const v = t(key, { returnObjects: true });
    return Array.isArray(v) ? (v as T[]) : [];
  };
  const stats = list<{ v: string; l: string }>('about.stats');
  const pillars = list<{ t: string; d: string }>('about.pillars');
  const chips = list<string>('about.why_chips');
  const steps = list<{ t: string; d: string }>('about.steps');
  const mission = t('about.mission_body').split('\n\n');

  // "places mapped so far": every listing travellers can find is on the map (GET /listings/count).
  const [places, setPlaces] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    api.get('/listings/count').then(({ data }) => { if (live && Number.isFinite(data?.count)) setPlaces(data.count); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const [pop, setPop] = useState<number | null>(null);
  const closePop = React.useCallback(() => setPop(null), []);

  return (
    <div className="ag-wrap" data-testid="about-page">
      <div className="ag-main">
        <section className="ag-about-hero">
          <p className="ag-eyebrow m-0">{t('about.ab_eye', 'About aangan')}</p>
          <h1>{t('about.hero_title', 'Made in Darjeeling. Use it anywhere.')}</h1>
          <p className="slogan">{t('about.slogan', 'Travel locally.')}</p>
          <p>{t('about.hero_body')}</p>
          <div className="ag-about-stats">
            {stats.map((s, i) => (
              <div key={i} data-testid={`about-stat-${i}`}><b>{s.v}</b><span>{s.l}</span></div>
            ))}
            {places != null && places > 0 && (
              <div data-testid="about-stat-places"><b>{roughCount(places)}</b><span>{t('about.stat_places', 'places mapped so far')}</span></div>
            )}
          </div>
          <span className="ag-about-peak"><Icon name="mountain" /> {t('about.made_in', 'Made in Mirik, Darjeeling hills')}</span>
        </section>

        <Box as="section">
          <span className="ag-eyebrow">{t('about.mission_title')}</span>
          <h2 className="!text-xl !leading-7">{t('about.why_headline')}</h2>
          {mission.map((p, i) => (
            <p key={i} className="m-0 text-base leading-relaxed text-[var(--ink7)]">{p}</p>
          ))}
          <div className="ag-row">
            {chips.map((c, i) => (
              <Status key={i} tone="ok"><Icon name="check" /> {c}</Status>
            ))}
          </div>
        </Box>

        <section>
          <SecHead eyebrow={t('about.reach_eye', 'Where it works')} title={t('about.reach_title', 'Made here, used anywhere')} />
          <ol className="ag-about-tl" data-testid="about-reach">
            {REACH.map((r, i) => (
              <li key={r.when[0]}>
                <span className="dot" aria-hidden="true">{i === 0 && <Icon name="check" />}</span>
                <span className="min-w-0">
                  <span className="when">{t(r.when[0], r.when[1])}</span>
                  <b>{t(r.t[0], r.t[1])}</b>
                  <span className="ag-small">{t(r.d[0], r.d[1])}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <SecHead eyebrow={t('about.pillars_eyebrow')} title={t('about.pillars_title', 'Four promises')} />
          <div className="ag-about-diff">
            {pillars.map((p, i) => (
              <Box key={p.t} data-testid={`about-pillar-${i}`}>
                <span className="num tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                <span className="icon" aria-hidden="true"><Icon name={PILLAR_ICONS[i % PILLAR_ICONS.length]} /></span>
                <h3>{p.t}</h3>
                <p className="ag-small">{p.d}</p>
              </Box>
            ))}
          </div>
        </section>

        <section>
          <SecHead eyebrow={t('about.how_eye', 'How it works')} title={t('about.how_title_v2', 'Three simple steps')} />
          <ol className="ag-about-tl steps">
            {steps.map((s, i) => (
              <li key={s.t} data-testid={`about-step-${i}`}>
                <span className="dot" aria-hidden="true">{i + 1}</span>
                <span className="min-w-0">
                  <b>{s.t}</b>
                  <span className="ag-small">{s.d}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section data-testid="about-team">
          <SecHead eyebrow={t('about.team_title')} title={t('about.team_heading', 'The people behind aangan')} />
          <p className="ag-small m-0">{t('about.team_lead')}</p>
          <div className="ag-about-team">
            {TEAM.map((m, i) => (
              <button key={m.key} type="button" className="ag-about-mem" onClick={() => setPop(i)} data-testid={`about-team-${m.key}`}>
                <span className="ag-about-ph" style={{ backgroundImage: `url(${photo(m.key)})` }} aria-hidden="true" />
                <span className="ag-about-role">{t(`about.group.${m.group}`)}</span>
                <b>{m.name}</b>
                <span className="ag-small">{t(`about.people.${m.key}.role`)}</span>
              </button>
            ))}
          </div>
          <p className="ag-about-tag"><b>{t('about.tag_b', 'Aangan mein aaiye.')}</b> {t('about.tag', 'Come into the courtyard.')}</p>
          <ButtonA href="https://www.1947.io" target="_blank" rel="noopener noreferrer" go size="sm">
            {t('about.know_studio', 'Know Studio 1947')}
          </ButtonA>
        </section>

        <Box as="section" tone="blush">
          <h2 className="!text-xl !leading-7">{t('about.providers_title')}</h2>
          <p className="ag-small m-0 !text-[var(--ink7)]">{t('about.providers_body')}</p>
          <ButtonLink to="/provider/onboard" variant="primary" go className="self-start" data-testid="about-provider-cta">
            {t('about.list_cta', 'Add my homestay, car or shop')}
          </ButtonLink>
        </Box>
      </div>
      {pop != null && <TeamPop i={pop} onClose={closePop} />}
    </div>
  );
}
