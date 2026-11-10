import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  animate,
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion';
import {
  ArrowRight,
  ArrowDown,
  EnvelopeSimple as Mail,
  Check,
  Phone,
  Translate,
  HandHeart,
  Mountains,
  CurrencyInr,
  MagnifyingGlass,
  CalendarCheck,
  SuitcaseRolling,
} from '@phosphor-icons/react';
import { sizedImage } from '@/lib/listingContent';
import { useSeo } from '@/components/Seo';
import AanganTeam from '@/components/about/AanganTeam';
import i18n, { LANGUAGES, type LangCode } from '@/i18n';

// One photo per pillar, in the order the strings are listed.
const PILLAR_IMAGES = [
  'https://images.unsplash.com/photo-1615634042767-cf6ca0135666?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8MTZ8fGRhcmplZWxpbmclMjBsb2NhbHN8ZW58MHx8MHx8fDA%3D',
  'https://images.unsplash.com/photo-1549817997-f6958ecf47b9?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NXx8ZGFyamVlbGluZyUyMGhpbGxzfGVufDB8fDB8fHww',
  'https://images.unsplash.com/photo-1781717378976-5d308b865e7c?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NHx8bmVwYWxpJTIwbGFuZ3VhZ2V8ZW58MHx8MHx8fDA%3D',
  'https://images.unsplash.com/photo-1729077537326-91749c1c9197?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8N3x8aW5kaWFuJTIwY3VycmVuY3l8ZW58MHx8MHx8fDA%3D',
];

// One icon per pillar, in the order the strings are listed: local first,
// the whole hill in one place, in your language, honest pricing.
const PILLAR_ICONS = [HandHeart, Mountains, Translate, CurrencyInr];

// One icon per "How it works" step: find, book or visit, travel gently.
const STEP_ICONS = [MagnifyingGlass, CalendarCheck, SuitcaseRolling];

// Tiger Hill ridgeline shot for the hero. Hosted on the same Cloudinary
// account as the homepage hero video, so it needs no new CSP allowance;
// sizedImage() injects a width/quality transform for it automatically.
const STORY_IMAGE = 'https://res.cloudinary.com/drgb8w8ak/image/upload/v1784109903/tigerhill_mcmhxp.webp';

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

const EASE = [0.22, 1, 0.36, 1] as const;

/* ------------------------------------------------------------------ */
/* Small motion primitives                                             */
/* ------------------------------------------------------------------ */

/** Fades and lifts its children into place the first time they scroll into view. */
function Reveal({
  children,
  delay = 0,
  className,
  ...rest
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  'data-testid'?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -80px 0px' }}
      transition={{ duration: 0.7, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * Counts up to the number inside a stat value ("0%", "4", "1") when it scrolls
 * into view. Anything without a digit is rendered as-is.
 */
function CountUp({ value }: { value: string }) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const match = value.match(/^(\D*)(\d+)(.*)$/);
  const target = match ? parseInt(match[2], 10) : 0;
  const [n, setN] = React.useState(reduce ? target : 0);

  React.useEffect(() => {
    if (!inView || !match || reduce) return;
    const controls = animate(0, target, { duration: 1.4, ease: EASE, onUpdate: v => setN(Math.round(v)) });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, target, reduce]);

  if (!match) return <span ref={ref}>{value}</span>;
  return <span ref={ref}>{match[1]}{n}{match[3]}</span>;
}

/** One word of the scroll-revealed quote: fades from faint to full as its slice of the scroll passes. */
function RevealWord({ word, progress, range }: { word: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.18, 1]);
  return <motion.span style={{ opacity }}>{word} </motion.span>;
}

/**
 * Splits the page title after its first comma so each clause gets its own
 * line ("Built in Darjeeling," / "for Darjeeling."). Every locale's title has
 * the same two-clause shape; one without a comma stays on a single line.
 */
function splitTitle(title: string): string[] {
  const at = title.search(/[,،]/);
  if (at < 0) return [title];
  return [title.slice(0, at + 1), title.slice(at + 1).trim()].filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

/**
 * Public "about" page. All copy lives in the locale files so it translates with
 * the rest of the site; this file only decides how it is laid out and moves.
 */
export default function About() {
  const { t, i18n: { language } } = useTranslation();
  const reduce = useReducedMotion();
  useSeo({ title: t('about.title'), description: t('about.mission_body') });
  const stats = t('about.stats', { returnObjects: true }) as { v: string; l: string }[];
  const pillars = t('about.pillars', { returnObjects: true }) as { t: string; d: string }[];
  const chips = t('about.why_chips', { returnObjects: true }) as string[];
  const steps = t('about.steps', { returnObjects: true }) as { t: string; d: string }[];

  // The mission copy is authored as two paragraphs: the first sets up the
  // problem, the second is the promise, rendered as a scroll-revealed quote.
  const [missionIntro, ...missionRest] = t('about.mission_body').split('\n\n');
  const missionQuote = missionRest.join('\n\n');

  /* ---------- Hero: the title, previewed in each of the site's languages ---------- */
  const current = (LANGUAGES.some(l => l.code === language) ? language : 'en') as LangCode;
  const [previewLang, setPreviewLang] = React.useState<LangCode>(current);
  const [langTouched, setLangTouched] = React.useState(false);
  React.useEffect(() => setPreviewLang(current), [current]);
  React.useEffect(() => {
    if (reduce || langTouched) return;
    const id = window.setTimeout(() => {
      const i = LANGUAGES.findIndex(l => l.code === previewLang);
      setPreviewLang(LANGUAGES[(i + 1) % LANGUAGES.length].code);
    }, 3200);
    return () => window.clearTimeout(id);
  }, [previewLang, langTouched, reduce]);
  const titleIn = React.useMemo(
    () => Object.fromEntries(LANGUAGES.map(l => [l.code, i18n.getFixedT(l.code)('about.title')])) as Record<LangCode, string>,
    // Re-read when the site language changes, in case resources were reloaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language],
  );

  /* ---------- Hero: photo and floating stats follow the pointer at different depths ---------- */
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 80, damping: 18 });
  const sy = useSpring(py, { stiffness: 80, damping: 18 });
  const imgX = useTransform(sx, v => v * -14);
  const imgY = useTransform(sy, v => v * -14);
  const chipNearX = useTransform(sx, v => v * 22);
  const chipNearY = useTransform(sy, v => v * 22);
  const chipFarX = useTransform(sx, v => v * 10);
  const chipFarY = useTransform(sy, v => v * 10);
  const onHeroMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const onHeroLeave = () => { px.set(0); py.set(0); };

  /* ---------- Mission: the quote lights up word by word as it scrolls through ---------- */
  const quoteRef = React.useRef<HTMLQuoteElement>(null);
  const { scrollYProgress: quoteProgress } = useScroll({ target: quoteRef, offset: ['start 85%', 'end 45%'] });
  const quoteWords = missionQuote.split(/\s+/).filter(Boolean);

  /* ---------- Pillars: one active at a time, auto-advancing until the visitor takes over ---------- */
  const [activePillar, setActivePillar] = React.useState(0);
  const [pillarsPaused, setPillarsPaused] = React.useState(false);
  const pillarsRef = React.useRef<HTMLDivElement>(null);
  const pillarsInView = useInView(pillarsRef, { margin: '-20% 0px -20% 0px' });
  React.useEffect(() => {
    if (reduce || pillarsPaused || !pillarsInView || pillars.length < 2) return;
    const id = window.setTimeout(() => setActivePillar(p => (p + 1) % pillars.length), 6000);
    return () => window.clearTimeout(id);
  }, [activePillar, pillarsPaused, pillarsInView, reduce, pillars.length]);
  const pickPillar = (i: number) => { setActivePillar(i); setPillarsPaused(true); };
  const onPillarKey = (e: React.KeyboardEvent, i: number) => {
    const last = pillars.length - 1;
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = i === last ? 0 : i + 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
    if (next < 0) return;
    e.preventDefault();
    pickPillar(next);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };

  /* ---------- Steps: the rail fills as the section scrolls past ---------- */
  const stepsRef = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress: stepsProgress } = useScroll({ target: stepsRef, offset: ['start 80%', 'end 55%'] });
  const railFill = useSpring(stepsProgress, { stiffness: 120, damping: 24 });
  const [activeStep, setActiveStep] = React.useState(0);

  const statTone =(i: number) => (i === 0 ? 'text-flag' : 'text-pine');

  return (
    <div data-testid="about-page">
      {/* ================================================================ */}
      {/* Hero                                                              */}
      {/* ================================================================ */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-16 -left-20 w-80 h-80 rounded-full bg-flag/10 blur-3xl" />
          <div className="absolute top-40 right-[-6rem] w-[28rem] h-[28rem] rounded-full bg-pine/10 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-4 md:px-8 pt-10 md:pt-16 lg:pt-20 grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-10 lg:gap-14 items-center">
          {/* --- Copy --- */}
          <div className="text-center lg:text-left">
            {/* Real heading for assistive tech; the visual one below cycles languages. */}
            <h1 className="sr-only">{t('about.title')}</h1>
            {/* All four titles share one grid cell so the block keeps the height
                of the longest, and swapping language never shifts the page. */}
            <div aria-hidden className="grid">
              {LANGUAGES.map(l => {
                const on = l.code === previewLang;
                return (
                  <motion.p
                    key={l.code}
                    lang={l.code}
                    initial={false}
                    animate={{ opacity: on ? 1 : 0, y: on || reduce ? 0 : 10, filter: on || reduce ? 'blur(0px)' : 'blur(6px)' }}
                    transition={{ duration: 0.55, ease: EASE }}
                    className="[grid-area:1/1] font-display font-extrabold text-[clamp(1.75rem,8.4vw,3rem)] sm:text-5xl lg:text-[3.25rem] xl:text-[3.75rem] text-ink leading-[1.05] tracking-tight"
                  >
                    {/* One clause per line: "Built in Darjeeling," / "for Darjeeling." */}
                    {splitTitle(titleIn[l.code]).map((line, i) => (
                      <span key={i} className="block whitespace-nowrap">{line}</span>
                    ))}
                  </motion.p>
                );
              })}
            </div>

            {/* Language preview pills: the "4 languages" promise, made touchable. */}
            <div className="mt-5 flex flex-wrap items-center justify-center lg:justify-start gap-2">
              <Translate size={16} className="text-ink-soft" aria-hidden />
              {LANGUAGES.map(l => {
                const on = l.code === previewLang;
                return (
                  <button
                    key={l.code}
                    type="button"
                    lang={l.code}
                    aria-pressed={on}
                    aria-label={`${l.english}: ${titleIn[l.code]}`}
                    onClick={() => { setPreviewLang(l.code); setLangTouched(true); }}
                    className={`relative px-3 py-1 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine ${on ? 'text-white' : 'text-ink-soft hover:text-ink bg-white border border-[var(--line)]'}`}
                  >
                    {on && (
                      <motion.span
                        layoutId="about-lang-pill"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        className="absolute inset-0 rounded-full bg-pine"
                      />
                    )}
                    <span className="relative">{l.label}</span>
                  </button>
                );
              })}
            </div>

            <motion.p
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
              className="mt-6 text-base md:text-lg text-ink-soft leading-relaxed max-w-xl mx-auto lg:mx-0"
            >
              {t('about.lead')}
            </motion.p>

            <motion.div
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE, delay: 0.25 }}
              className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-3"
            >
              <Link
                to="/provider/onboard"
                className="group inline-flex items-center gap-2 px-6 py-3 rounded-full bg-pine text-white font-bold btn-hover"
              >
                {t('nav.provider')} <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href="#about-story"
                className="group inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white border border-[var(--line)] text-ink font-bold btn-hover"
              >
                {t('about.mission_title')} <ArrowDown size={16} className="transition-transform group-hover:translate-y-0.5" />
              </a>
            </motion.div>
          </div>

          {/* --- Photo with floating stats --- */}
          <motion.div
            onPointerMove={onHeroMove}
            onPointerLeave={onHeroLeave}
            initial={reduce ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
            className="relative mx-auto w-full max-w-md lg:max-w-none"
          >
            <div className="relative aspect-[4/5] sm:aspect-[5/4] lg:aspect-[4/5] rounded-[28px] overflow-hidden border border-[var(--line)] shadow-xl">
              <motion.img
                src={sizedImage(STORY_IMAGE, 1200)}
                alt={t('about.image_caption')}
                style={reduce ? undefined : { x: imgX, y: imgY, scale: 1.08 }}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
              <span className="absolute left-4 bottom-4 px-3 py-1.5 rounded-lg bg-black/45 backdrop-blur-sm text-white text-xs md:text-sm font-medium">
                {t('about.image_caption')}
              </span>
            </div>

            {/* Floating stat cards. Desktop only; mobile gets the strip below. */}
            {stats.map((s, i) => {
              const pos = [
                'lg:-left-10 lg:top-10',
                'lg:-right-8 lg:top-[40%]',
                'lg:-left-8 lg:bottom-16',
              ][i % 3];
              const near = i % 2 === 0;
              return (
                <motion.div
                  key={i}
                  data-testid={`about-stat-${i}`}
                  initial={reduce ? false : { opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, ease: EASE, delay: 0.45 + i * 0.12 }}
                  style={reduce ? undefined : { x: near ? chipNearX : chipFarX, y: near ? chipNearY : chipFarY }}
                  className={`hidden lg:flex absolute ${pos} items-center gap-3 rounded-2xl bg-white/95 backdrop-blur border border-[var(--line)] shadow-lg px-4 py-3 max-w-[15rem]`}
                >
                  <span className={`font-display font-extrabold text-3xl leading-none tabular-nums ${statTone(i)}`}>
                    <CountUp value={s.v} />
                  </span>
                  <span className="text-xs text-ink-soft leading-snug">{s.l}</span>
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        {/* Stats strip for phones and tablets */}
        <div className="lg:hidden mx-auto max-w-6xl px-4 md:px-8 mt-8">
          <div className="grid grid-cols-3 divide-x divide-[var(--line)] rounded-2xl bg-white border border-[var(--line)] shadow-sm">
            {stats.map((s, i) => (
              <div key={i} className="px-2 py-4 sm:py-5 text-center">
                <div className={`font-display font-extrabold text-2xl sm:text-4xl leading-none tabular-nums ${statTone(i)}`}>
                  <CountUp value={s.v} />
                </div>
                <p className="mt-1.5 text-[11px] sm:text-xs text-ink-soft leading-snug">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Why we built this                                                 */}
      {/* ================================================================ */}
      <section id="about-story" className="scroll-mt-28 mx-auto max-w-6xl px-4 md:px-8 mt-20 md:mt-32">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-8 lg:gap-16 items-start">
          <div className="lg:sticky lg:top-[calc(var(--header-h)+2rem)]">
            <Reveal>
              <div className="text-[11px] font-bold uppercase tracking-widest text-flag">{t('about.mission_title')}</div>
              <h2 className="mt-3 font-display font-extrabold text-3xl md:text-5xl text-ink leading-[1.08]">
                {t('about.why_headline')}
              </h2>
              <span aria-hidden className="mt-6 hidden lg:block h-1 w-16 rounded-full bg-gradient-to-r from-flag via-gold to-pine" />
            </Reveal>
          </div>

          <div>
            <Reveal>
              <p className="text-base md:text-lg text-ink-soft leading-relaxed">{missionIntro}</p>
            </Reveal>

            {missionQuote && (
              <blockquote
                ref={quoteRef}
                className="mt-8 md:mt-10 relative pl-6 md:pl-8 border-l-4 border-pine"
              >
                <p className="font-display font-extrabold text-2xl md:text-4xl text-pine-dark leading-[1.2] tracking-tight">
                  {reduce
                    ? missionQuote
                    : quoteWords.map((w, i) => (
                      <RevealWord
                        key={i}
                        word={w}
                        progress={quoteProgress}
                        range={[i / quoteWords.length, Math.min(1, (i + 1.5) / quoteWords.length)]}
                      />
                    ))}
                </p>
              </blockquote>
            )}

            <div className="mt-8 flex flex-wrap gap-2.5">
              {chips.map((c, i) => (
                <motion.span
                  key={i}
                  initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, ease: EASE, delay: i * 0.08 }}
                  whileHover={reduce ? undefined : { y: -3 }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white border border-[var(--line)] text-sm font-semibold text-ink cursor-default hover:border-pine/40 hover:shadow-md transition-[border-color,box-shadow]"
                >
                  <span className="grid place-items-center w-4 h-4 rounded-full bg-pine/10">
                    <Check size={11} weight="bold" className="text-pine" />
                  </span>
                  {c}
                </motion.span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* What makes it different: pick a pillar, the photo follows         */}
      {/* ================================================================ */}
      <section className="mx-auto max-w-6xl px-4 md:px-8 mt-20 md:mt-32">
        <Reveal className="text-center text-[11px] font-bold uppercase tracking-widest text-flag">
          {t('about.pillars_eyebrow')}
        </Reveal>

        <div ref={pillarsRef} className="mt-6 grid lg:grid-cols-[1fr_1.15fr] gap-4 lg:gap-6 items-stretch">
          <div role="tablist" aria-orientation="vertical" className="flex flex-col gap-3 order-2 lg:order-1">
            {pillars.map((p, i) => {
              const active = i === activePillar;
              return (
                <button
                  key={p.t}
                  type="button"
                  role="tab"
                  id={`about-pillar-tab-${i}`}
                  aria-selected={active}
                  aria-controls="about-pillar-panel"
                  tabIndex={active ? 0 : -1}
                  data-testid={`about-pillar-${i}`}
                  onClick={() => pickPillar(i)}
                  onMouseEnter={() => pickPillar(i)}
                  onKeyDown={e => onPillarKey(e, i)}
                  className={`relative text-left overflow-hidden rounded-2xl border p-5 md:p-6 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine ${active
                    ? 'bg-white border-pine/30 shadow-lg'
                    : 'bg-white/60 border-[var(--line)] hover:bg-white hover:border-pine/20'
                    }`}
                >
                  <div className="flex items-center gap-4">
                    <span
                      aria-hidden
                      className={`shrink-0 w-10 h-10 rounded-full grid place-items-center transition-colors duration-300 ${active ? 'bg-pine text-white' : 'bg-mist text-pine'}`}
                    >
                      {(() => {
                        const Icon = PILLAR_ICONS[i % PILLAR_ICONS.length];
                        return <Icon size={20} weight={active ? 'fill' : 'duotone'} />;
                      })()}
                    </span>
                    <h3 className={`font-display font-bold text-lg md:text-xl transition-colors ${active ? 'text-ink' : 'text-ink-soft'}`}>
                      {p.t}
                    </h3>
                  </div>
                  <AnimatePresence initial={false}>
                    {active && (
                      <motion.p
                        key="d"
                        initial={reduce ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: EASE }}
                        className="overflow-hidden pl-14 text-sm md:text-base text-ink-soft leading-relaxed"
                      >
                        <span className="block pt-3">{p.d}</span>
                      </motion.p>
                    )}
                  </AnimatePresence>
                  {/* Auto-advance timer. Stops once the visitor chooses. */}
                  {active && !pillarsPaused && !reduce && pillarsInView && (
                    <motion.span
                      key={`timer-${i}`}
                      aria-hidden
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 6, ease: 'linear' }}
                      className="absolute left-0 bottom-0 h-0.5 w-full origin-left bg-pine"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div
            id="about-pillar-panel"
            role="tabpanel"
            aria-labelledby={`about-pillar-tab-${activePillar}`}
            className="relative order-1 lg:order-2 h-64 sm:h-80 lg:h-auto lg:min-h-[28rem] rounded-[20px] overflow-hidden border border-[var(--line)] shadow-sm bg-mist"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.img
                key={activePillar}
                src={PILLAR_IMAGES[activePillar % PILLAR_IMAGES.length]}
                alt={pillars[activePillar]?.t ?? ''}
                initial={reduce ? false : { opacity: 0, scale: 1.08 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: EASE }}
                className="absolute inset-0 w-full h-full object-cover"
              />
            </AnimatePresence>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute left-5 bottom-5 flex gap-1.5" aria-hidden>
              {pillars.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === activePillar ? 'w-8 bg-white' : 'w-1.5 bg-white/50'}`} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* How it works                                                      */}
      {/* ================================================================ */}
      <section className="mx-auto max-w-5xl px-4 md:px-8 mt-20 md:mt-32">
        <Reveal>
          <h2 className="font-display font-extrabold text-3xl md:text-5xl text-ink text-center">{t('about.how_title')}</h2>
        </Reveal>
        <div ref={stepsRef} className="relative mt-10 md:mt-14 grid sm:grid-cols-3 gap-8 sm:gap-4">
          {/* Desktop rail: a faint dashed track with a solid line that fills on scroll,
              from the centre of the first dot to the centre of the last. */}
          <span aria-hidden className="hidden sm:block absolute top-7 left-[16.6%] right-[16.6%] border-t-2 border-dashed border-[var(--line)]" />
          <motion.span
            aria-hidden
            style={{ scaleX: reduce ? 1 : railFill }}
            className="hidden sm:block absolute top-[27px] left-[16.6%] right-[16.6%] h-[3px] origin-left rounded-full bg-gradient-to-r from-pine to-flag"
          />
          {/* Phone rail: same idea, running down the left behind the dots. */}
          <span aria-hidden className="sm:hidden absolute left-7 top-7 bottom-7 border-l-2 border-dashed border-[var(--line)]" />
          <motion.span
            aria-hidden
            style={{ scaleY: reduce ? 1 : railFill }}
            className="sm:hidden absolute left-[27px] top-7 bottom-7 w-[3px] origin-top rounded-full bg-gradient-to-b from-pine to-flag"
          />
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            const active = i === activeStep;
            return (
              <Reveal key={s.t} delay={i * 0.12} data-testid={`about-step-${i}`}>
                <button
                  type="button"
                  onClick={() => setActiveStep(i)}
                  onMouseEnter={() => setActiveStep(i)}
                  onFocus={() => setActiveStep(i)}
                  aria-pressed={active}
                  className="relative flex sm:block items-start gap-4 w-full text-left sm:text-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine focus-visible:ring-offset-4"
                >
                  <motion.div
                    animate={reduce ? undefined : { scale: active ? 1.12 : 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                    className={`relative z-10 shrink-0 sm:mx-auto w-14 h-14 rounded-full grid place-items-center text-white font-display font-extrabold text-lg ring-4 transition-shadow duration-300 ${isLast ? 'bg-flag' : 'bg-pine'} ${active ? (isLast ? 'ring-flag/20 shadow-lg' : 'ring-pine/20 shadow-lg') : 'ring-[var(--bg)]'}`}
                    aria-hidden
                  >
                    {(() => {
                      const Icon = STEP_ICONS[i % STEP_ICONS.length];
                      return <Icon size={26} weight={active ? 'fill' : 'bold'} />;
                    })()}
                  </motion.div>
                  <div className="pt-2 sm:pt-0">
                    <h3 className={`sm:mt-4 font-display font-bold text-lg md:text-xl transition-colors ${active ? 'text-ink' : 'text-ink-soft'}`}>{s.t}</h3>
                    <p className={`mt-1.5 text-sm leading-relaxed sm:max-w-xs sm:mx-auto transition-opacity ${active ? 'text-ink-soft' : 'text-ink-soft opacity-75'}`}>{s.d}</p>
                  </div>
                </button>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ================================================================ */}
      {/* Who built this — mirrors the team section on 1947.io/products/aangan */}
      {/* ================================================================ */}
      <div className="mt-20 md:mt-32">
        <AanganTeam
          title="The people behind Aangan"
          intro="A small team from Mirik, in the Darjeeling hills, building something for the place we call home."
        />
      </div>

      {/* ================================================================ */}
      {/* Providers + contact                                               */}
      {/* ================================================================ */}
      <section className="mx-auto max-w-6xl px-4 md:px-8 mt-20 md:mt-32 mb-8 md:mb-16">
        <Reveal>
          <div className="relative overflow-hidden rounded-[28px] bg-pine-dark text-white px-6 py-10 md:p-14">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              {/* The hero's Kangchenjunga photo, framed on the peaks (not the crowd
                  below them) and covering the whole card, so there is no hard edge. */}
              <img
                src={sizedImage(STORY_IMAGE, 1600)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover object-[50%_38%] opacity-70 mix-blend-luminosity [mask-image:linear-gradient(to_bottom,black_35%,transparent_75%)] lg:[mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]"
                loading="lazy"
              />
              {/* Pine wash: solid behind the copy on the left, letting the
                  mountains show through toward the right. */}
              <div className="absolute inset-0 bg-gradient-to-b lg:bg-gradient-to-r from-pine-dark/95 via-pine-dark/75 to-pine-dark/25" />
              <div className="absolute inset-0 bg-gradient-to-t from-pine-dark/60 via-transparent to-transparent" />
              <div className="absolute -top-24 -right-16 w-80 h-80 rounded-full bg-pine-light/30 blur-3xl" />
              <div className="absolute -bottom-28 -left-16 w-80 h-80 rounded-full bg-flag/20 blur-3xl" />
            </div>

            <div className="relative grid lg:grid-cols-[1.2fr_1fr] gap-8 lg:gap-12 items-center">
              <div className="text-center lg:text-left">
                <h2 className="font-display font-extrabold text-3xl md:text-5xl leading-tight">{t('about.providers_title')}</h2>
                <p className="mt-4 text-sm md:text-base text-white/80 max-w-xl mx-auto lg:mx-0 leading-relaxed">{t('about.providers_body')}</p>
              </div>
              <div className="flex flex-col gap-3 w-full max-w-sm mx-auto lg:ml-auto lg:mr-0">
                <Link
                  to="/provider/onboard"
                  data-testid="about-provider-cta"
                  className="group inline-flex items-center justify-between gap-2 px-6 py-4 rounded-full bg-white text-pine-dark font-bold btn-hover"
                >
                  {t('nav.provider')}
                  <span className="grid place-items-center w-8 h-8 rounded-full bg-pine text-white transition-transform group-hover:translate-x-1">
                    <ArrowRight size={16} />
                  </span>
                </Link>
                <a
                  href="mailto:aanganerp@gmail.com"
                  className="inline-flex items-center gap-3 px-6 py-3.5 rounded-full border border-white/25 bg-white/5 font-semibold hover:bg-white/10 transition-colors"
                >
                  <Mail size={18} /> aanganerp@gmail.com
                </a>
                <a
                  href="tel:+919093277919"
                  data-testid="about-phone"
                  className="inline-flex items-center gap-3 px-6 py-3.5 rounded-full border border-white/25 bg-white/5 font-semibold hover:bg-white/10 transition-colors"
                >
                  <Phone size={18} /> +91 90932 77919
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
