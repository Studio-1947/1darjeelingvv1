import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useHostSignupInfo } from '@/components/provider/onboard/QuickFill';
import api from '@/lib/api';
import { sizedImage } from '@/lib/listingContent';
import { useAuth } from '@/context/AuthContext';
import Seo from '@/components/Seo';
import BookingWidget from '@/components/BookingWidget';
import RouteEstimator from '@/components/RouteEstimator';
import { Icon, type IconName } from '@/components/ag/Icon';
import { cx } from '@/components/ag';
import { GuideCard, ShopCard, SpotCard, StayCard } from '@/components/home/cards';
import { SpotTileSkeleton, StayTileSkeleton, LoadingStatus, repeat } from '@/components/skeletons';

/*
 * Home, as the Aangan 2.0 prototype draws it (V.home + v7.js): the photo carousel, the red search
 * row, six category cards, List your Business, then one section per kind of listing, each under a
 * wavy rule, and the List your Business card and the six cards again at the end.
 * Styles: styles/screens/home.css (ag-home-*).
 */

// Offers an admin has switched on (GET /api/promotions), the same as the app's DealsStrip. With no
// live promotions the section is simply not shown.
type Promotion = { id: string; tag: string; title: string; subtitle: string; image: string; link: string };
// Promotions are shared with the app, whose links read "/category/<type>"; the website's pages are
// "/homestays", "/drivers" and so on.
const dealHref = (link: string) => {
  const m = /^\/category\/([a-z]+)\/?$/.exec(link || '');
  if (!m) return link || '/explore';
  return m[1] === 'biodiversity' ? '/biodiversity' : `/${m[1]}s`;
};

/* ---------- photo carousel ---------- */

type Slide = { to: string; img: string; title: [string, string]; sub: [string, string] };
const SLIDES: Slide[] = [
  { to: '/spots', img: '/media/spots/tiger.jpg', title: ['home.bn1', 'Offbeat places'], sub: ['home.bn1s', 'Sunrise points, monasteries, quiet trails'] },
  { to: '/homestays', img: '/media/biz/homestays/1.jpg', title: ['home.bn2', 'Stay with a local family'], sub: ['home.bn2s', 'Homestays across the hills'] },
  { to: '/drivers', img: '/media/cars/mahindra-bolero-1.jpg', title: ['home.bn3', 'Find a ride'], sub: ['home.bn3s', 'Airport, station and day trips'] },
  { to: '/provider/onboard', img: '/media/list-business.jpg', title: ['home.bn4', 'List your business'], sub: ['home.bn4s', 'Free to list, no commission'] },
];
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The banner carousel: the hill video, then four photo slides. Swipe, tap a dot, or wait 6 s. */
function Banners() {
  const { t } = useTranslation();
  const track = useRef<HTMLDivElement>(null);
  const held = useRef(0);
  const [at, setAt] = useState(0);
  const count = SLIDES.length + 1;
  const still = reducedMotion();

  useEffect(() => {
    if (still) return undefined;
    const timer = window.setInterval(() => {
      const el = track.current;
      if (!el || document.hidden || Date.now() - held.current < 8000) return;
      const k = Math.round(el.scrollLeft / el.clientWidth);
      el.scrollTo({ left: el.clientWidth * ((k + 1) % count), behavior: 'smooth' });
    }, 6000);
    return () => window.clearInterval(timer);
  }, [count, still]);

  const go = (k: number) => {
    held.current = Date.now();
    const el = track.current;
    if (el) el.scrollTo({ left: el.clientWidth * k, behavior: still ? 'auto' : 'smooth' });
  };

  return (
    <section className="ag-home-banners" aria-roledescription="carousel" aria-label={t('home.banners', 'Highlights')} data-testid="home-banners">
      <div
        ref={track}
        className="track"
        onScroll={(e) => { const el = e.currentTarget; setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}
        onPointerDown={() => { held.current = Date.now(); }}
      >
        <div className="slide vid" aria-hidden="true">
          <video autoPlay={!still} muted loop playsInline preload="metadata" poster="/media/hero-poster.jpg">
            <source src="/video-hero/S_47_July_26_web_cover_video_e1wiyd.webm" type="video/webm" />
          </video>
        </div>
        {SLIDES.map((s, i) => (
          <Link key={s.to} to={s.to} className="slide" style={{ backgroundImage: `url(${s.img})` }} data-testid={`home-banner-${i + 1}`}>
            <span className="bt"><b>{t(s.title[0], s.title[1])}</b><span>{t(s.sub[0], s.sub[1])}</span></span>
          </Link>
        ))}
      </div>
      <div className="dots">
        {Array.from({ length: count }, (_, k) => (
          <button key={k} type="button" className={cx('dot', k === at && 'on')} aria-label={t('home.slide_n', 'Slide {{n}}', { n: k + 1 })}
            aria-current={k === at ? 'true' : undefined} onClick={() => go(k)} />
        ))}
      </div>
    </section>
  );
}

/* ---------- category cards ---------- */

type HomeTile = { key: string; to: string; icon: IconName; title: [string, string] };
const TILES: HomeTile[] = [
  { key: 'stays', to: '/homestays', icon: 'home', title: ['home.tile.stays', 'Homestay'] },
  { key: 'cars', to: '/drivers', icon: 'car', title: ['home.tile.cars', 'Car & Driver'] },
  { key: 'spots', to: '/spots', icon: 'mountain', title: ['home.tile.spots', 'Offbeat Places'] },
  { key: 'food', to: '/cafes', icon: 'cup', title: ['home.cafes_title', 'Cafes & Restaurants'] },
  { key: 'guides', to: '/guides', icon: 'trek', title: ['home.tile.guides', 'Tour Guides'] },
  { key: 'shops', to: '/shops', icon: 'bag', title: ['home.shops_title', 'Local Shops'] },
];

/** Every label on exactly two lines, split the way v7.js splits them ("Car &" / "Driver", "Home" / "Stays"). */
function twoLines(label: string): [string, string] | [string] {
  const s = label.trim();
  const words = s.split(/\s+/);
  if (words.length > 1) {
    const k = ['&', 'और', 'र', 'ও'].includes(words[1]) ? 2 : 1;
    return [words.slice(0, k).join(' '), words.slice(k).join(' ')];
  }
  if (/^homestay$/i.test(s)) return ['Home', 'Stays'];
  if (/^[\x00-\x7F]+$/.test(s) && s.length > 9) { const h = Math.ceil(s.length / 2); return [s.slice(0, h), s.slice(h)]; }
  return [s];
}

function HomeTiles({ testIdPrefix }: { testIdPrefix?: string }) {
  const { t } = useTranslation();
  return (
    <nav className="ag-home-tiles" aria-label={t('nav.categories')}>
      {TILES.map(({ key, to, icon, title }) => {
        const [a, b] = twoLines(t(title[0], title[1]));
        return (
          <Link key={key} to={to} className="ag-home-tile" data-testid={testIdPrefix ? `${testIdPrefix}${key}` : undefined}>
            <Icon name={icon} />
            <b>{a}{b !== undefined && <><br />{b}</>}</b>
            <span className="go" aria-hidden="true"><Icon name="arrowne" /></span>
          </Link>
        );
      })}
    </nav>
  );
}

/* ---------- List your Business ---------- */

// Hosts start free (server lib/hostGrace.ts): said in the card's footer row, where the prototype
// counts businesses (no such count exists on the server, so it is not shown).
function HostFreeNote({ testId }: { testId?: string }) {
  const { t } = useTranslation();
  const { grace_bookings } = useHostSignupInfo();
  return <span className="joined" data-testid={testId}>{t('ob.free.chip', { count: grace_bookings })}</span>;
}

function JoinCard({ img, end }: { img: string; end?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={cx('ag-home-join', end && 'end')} data-testid={end ? 'home-join-card-end' : 'home-join-card'}>
      <span className="joinimg" role="img" aria-label={t('home.join_title', 'List your Business')} style={{ backgroundImage: `url(${img})` }} />
      <div className="joinbody">
        <h2>{t('home.join_title', 'List your Business')}</h2>
        <p>{t('home.join_sub', 'Homestays, drivers, cafes, shops and guides. Free to list, bookings come to you.')}</p>
        <div className="joinrow">
          <Link to="/provider/onboard" className="ag-home-redbtn" data-testid={end ? 'banner-provider-cta-end' : 'banner-provider-cta'}>
            {t('home.join_cta', 'List now')}<span className="go" aria-hidden="true"><Icon name="arrowne" /></span>
          </Link>
          <HostFreeNote testId={end ? undefined : 'host-fee-chip'} />
        </div>
      </div>
    </div>
  );
}

/* ---------- sections ---------- */

function SeeAllLink({ to, children, icon }: { to: string; children: React.ReactNode; icon?: IconName }) {
  return (
    <Link to={to} className="ag-home-seeall">
      {icon && <Icon name={icon} className="circ" />}
      {children}
      <Icon name="arrowne" className="circ" />
    </Link>
  );
}

/** One Home section: a wavy rule, red eyebrow, big title, See all. `band` and `soft` are the tinted ones. */
function Section({ id, eyebrow, title, action, tone, testId, children }: {
  id: string; eyebrow: string; title: string; action?: React.ReactNode; tone?: 'band' | 'soft'; testId?: string; children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={cx('ag-home-sec', tone)} data-testid={testId}>
      <div className="ag-home-sechead">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={id}>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** The explorer drawing on the Suggest a place box (the prototype's media/explorer.svg). */
function Explorer() {
  return (
    <svg className="explorer" viewBox="0 0 120 120" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 96 L26 70 L40 84 L58 60 L76 82 L92 66 L116 96" opacity=".45" />
      <path d="M4 104 H116" opacity=".45" />
      <path d="M38 40 Q60 30 82 40" />
      <path d="M46 40 Q48 24 60 22 Q72 24 74 40" />
      <path d="M46 40 Q44 56 50 62 Q60 70 70 62 Q76 56 74 40" />
      <rect x="40" y="44" width="16" height="14" rx="4" />
      <rect x="64" y="44" width="16" height="14" rx="4" />
      <path d="M56 50 H64" />
      <path d="M44 44 V40 M76 44 V40" />
      <path d="M38 52 Q32 54 30 62 M82 52 Q88 54 90 62" />
      <path d="M30 62 Q34 76 40 84 Q60 90 80 84 Q86 76 90 62" />
      <path d="M40 84 L38 110 M80 84 L82 110" />
      <path d="M52 68 Q60 74 68 68" />
      <path d="M86 46 L100 38 M86 54 L102 54" opacity=".6" />
    </svg>
  );
}

/**
 * Suggest a place: sent to the aangan team as feedback (POST /api/feedback/aangan, signed in),
 * the same inbox the admin console reads. A guest is asked to log in first.
 */
function SuggestBox() {
  const { t } = useTranslation();
  const { user } = useAuth() as { user: unknown };
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const nameOk = name.trim().length >= 2;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameOk || state === 'sending') return;
    setState('sending');
    try {
      const message = [`${t('home.suggest', 'Suggest a place')}: ${name.trim()}`, details.trim()].filter(Boolean).join('\n');
      await api.post('/feedback/aangan', { message: message.slice(0, 2000) });
      setState('sent');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="ag-home-sugg" data-testid="home-suggest">
      <div className="row">
        <Explorer />
        <div className="grow">
          <b>{state === 'sent' ? t('home.sugg_sent', 'Thank you. Sent to the aangan team.') : t('home.suggest', 'Suggest a place')}</b>
          <span className="small">
            {state === 'sent'
              ? t('home.sugg_wait', 'We check every suggestion and publish it on Offbeat Places.')
              : t('home.suggest_sub', 'Know a spot we are missing? Tell us. The aangan team checks it and publishes it for everyone.')}
          </span>
        </div>
      </div>
      {state !== 'sent' && !open && (
        user ? (
          <button type="button" className="ag-home-softbtn" onClick={() => setOpen(true)} data-testid="home-suggest-open">
            {t('home.suggest', 'Suggest a place')}<span className="go" aria-hidden="true"><Icon name="arrowne" /></span>
          </button>
        ) : (
          <Link to={`/login?next=${encodeURIComponent('/')}`} className="ag-home-softbtn" data-testid="home-suggest-login">
            {t('home.suggest', 'Suggest a place')}<span className="go" aria-hidden="true"><Icon name="arrowne" /></span>
          </Link>
        )
      )}
      {state !== 'sent' && open && (
        <form onSubmit={send} className="flex flex-col gap-3">
          <label className="ag-field">
            <span>{t('home.spot_name', 'Name of the place')}</span>
            <input className="ag-in" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} data-testid="home-suggest-name" autoFocus />
          </label>
          <label className="ag-field">
            <span>{t('home.spot_details', 'What is special about it? How to reach, best time, what to carry.')}</span>
            <textarea className="ag-in" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1800} rows={3} data-testid="home-suggest-details" />
          </label>
          {state === 'error' && <p className="ag-err m-0" role="alert">{t('home.sugg_error', 'That did not go through. Please try again.')}</p>}
          <button type="submit" className="ag-home-redbtn self-start" disabled={!nameOk || state === 'sending'} data-testid="home-suggest-send">
            {t('home.sugg_send', 'Send')}<span className="go" aria-hidden="true"><Icon name="arrowne" /></span>
          </button>
        </form>
      )}
    </div>
  );
}

/* ---------- page ---------- */

const PER = { spot: 4, homestay: 5, guide: 9, driver: 4, cafe: 9, shop: 9, biodiversity: 4, event: 4 } as const;
type Kind = keyof typeof PER;

export default function Discover() {
  const { t } = useTranslation();
  const [lists, setLists] = useState<Partial<Record<Kind, any[]>>>({});
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<Promotion[]>([]);

  useEffect(() => {
    let live = true;
    api.get('/promotions')
      .then((r) => { if (live) setDeals(Array.isArray(r.data?.items) ? r.data.items : []); })
      .catch(() => { /* no section without the server's list */ });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    const kinds = Object.keys(PER) as Kind[];
    Promise.allSettled(kinds.map((type) => api.get('/listings', { params: { type, limit: PER[type] } })))
      .then((res) => {
        if (!live) return;
        const next: Partial<Record<Kind, any[]>> = {};
        res.forEach((r, i) => { next[kinds[i]] = r.status === 'fulfilled' ? (r.value.data?.items || []).slice(0, PER[kinds[i]]) : []; });
        setLists(next);
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const of = (k: Kind) => lists[k] || [];
  const spots = of('spot');
  const stays = of('homestay');
  const guides = of('guide');
  const drivers = of('driver');
  const cafes = of('cafe');
  const shops = of('shop');
  const nature = of('biodiversity');
  const events = of('event');
  const seeAll = t('home.see_all', 'See all');

  return (
    <div className="ag-wrap">
      <div className="ag-home">
        <Seo description={t('seo.home_description')} />
        <h1 className="sr-only">{t('hero.title_1')} {t('hero.title_2')}</h1>

        <Banners />
        <BookingWidget />
        <HomeTiles testIdPrefix="home-tile-" />
        <JoinCard img="/media/list-business.jpg" />

        {deals.length > 0 && (
          <Section id="home-deals-h" eyebrow={t('home.eyebrow_deals', 'Offers')} title={t('home.trending')}>
            <div className="ag-home-spots" data-testid="deals-strip">
              {deals.map((d) => (
                <Link key={d.id} to={dealHref(d.link)} data-testid={`deal-${d.id}`} className="ag-home-spot">
                  {d.image && <img src={sizedImage(d.image, 600)} alt="" loading="lazy" className="ag-home-photo" />}
                  <span className="info">
                    {d.tag && <span className="loc">{d.tag}</span>}
                    <b>{d.title}</b>
                    {d.subtitle && <span className="best">{d.subtitle}</span>}
                  </span>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {loading && <LoadingStatus label={t('common.loading')} />}

        {(loading || spots.length > 0) && (
          <Section id="home-spots-h" eyebrow={t('home.must_visit')} title={t('home.tile.spots', 'Offbeat Places')}
            action={<SeeAllLink to="/spots">{seeAll}</SeeAllLink>}>
            <div className="ag-home-spots">
              {loading && repeat(4, (i) => <SpotTileSkeleton key={i} />)}
              {spots.map((s) => <SpotCard key={s.id} it={s} href={`/listing/${s.id}`} testId={`spot-tile-${s.id}`} />)}
            </div>
            <SuggestBox />
          </Section>
        )}

        {(loading || stays.length > 0) && (
          <Section id="home-stays-h" tone="band" eyebrow={t('home.stay_local')} title={t('home.tile.stays', 'Homestay')}
            action={<SeeAllLink to="/homestays">{seeAll}</SeeAllLink>}>
            <div className="ag-home-stays">
              {loading && repeat(2, (i) => <StayTileSkeleton key={i} />)}
              {stays.map((h, i) => (
                <StayCard key={h.id} it={h} href={`/listing/${h.id}`} wide={i === 0} ctaLabel={t('cta.book_now')}
                  testId={`stay-tile-${h.id}`} ctaTestId={`stay-book-${h.id}`} saveTestId={`stay-save-${h.id}`} />
              ))}
            </div>
          </Section>
        )}

        {guides.length > 0 && (
          <Section id="home-guides-h" tone="soft" eyebrow={t('home.eyebrow_guides', 'Go with a local')} title={t('home.tile.guides', 'Tour Guides')}
            action={<SeeAllLink to="/guides">{seeAll}</SeeAllLink>}>
            <div className="ag-home-three">
              {guides.map((g) => <GuideCard key={g.id} it={g} href={`/listing/${g.id}`} testId={`guide-tile-${g.id}`} />)}
            </div>
          </Section>
        )}

        <Section id="home-cars-h" eyebrow={t('home.eyebrow_cars', 'Ride local')} title={t('home.tile.cars', 'Car & Driver')}
          action={<SeeAllLink to="/drivers" icon="search">{t('home.find_ride', 'Find a ride')}</SeeAllLink>}>
          {drivers.length > 0 && (
            <div className="ag-home-stays">
              {drivers.map((d, i) => (
                <StayCard key={d.id} it={d} href={`/listing/${d.id}`} wide={i === 0} selfie ctaLabel={t('cta.book_now')} testId={`driver-tile-${d.id}`} />
              ))}
            </div>
          )}
          {/* The fare guide: the prototype opens a ride search from "Find a ride"; ours lives here. */}
          <div className="mt-3"><RouteEstimator /></div>
        </Section>

        {cafes.length > 0 && (
          <Section id="home-cafes-h" tone="band" eyebrow={t('home.eyebrow_eat', 'Eat local')} title={t('home.cafes_title', 'Cafes & Restaurants')}
            action={<SeeAllLink to="/cafes">{seeAll}</SeeAllLink>}>
            <div className="ag-home-three">
              {cafes.map((c) => <ShopCard key={c.id} it={c} href={`/listing/${c.id}`} testId={`cafe-tile-${c.id}`} />)}
            </div>
          </Section>
        )}

        {shops.length > 0 && (
          <Section id="home-shops-h" tone="band" eyebrow={t('home.eyebrow_shop', 'Shop local')} title={t('home.shops_title', 'Local Shops')}
            action={<SeeAllLink to="/shops">{seeAll}</SeeAllLink>}>
            <div className="ag-home-three">
              {shops.map((s) => <ShopCard key={s.id} it={s} href={`/listing/${s.id}`} testId={`shop-tile-${s.id}`} />)}
            </div>
          </Section>
        )}

        {nature.length > 0 && (
          <Section id="home-nature-h" eyebrow={t('home.eyebrow_nature', 'Wild side')} title={t('home.nature_title', 'Nature')}
            action={<SeeAllLink to="/biodiversity">{seeAll}</SeeAllLink>}>
            <div className="ag-home-spots">
              {nature.map((n) => <SpotCard key={n.id} it={n} href={`/listing/${n.id}`} testId={`nature-tile-${n.id}`} />)}
            </div>
          </Section>
        )}

        {events.length > 0 && (
          <Section id="home-events-h" eyebrow={t('home.eyebrow_events', 'Celebrate')} title={t('home.tile.events', 'Festivals')}
            action={<SeeAllLink to="/events">{seeAll}</SeeAllLink>} testId="home-events">
            <div className="ag-home-spots">
              {events.map((n) => <SpotCard key={n.id} it={n} href={`/listing/${n.id}`} testId={`event-tile-${n.id}`} />)}
            </div>
          </Section>
        )}

        {/* The List your Business card and the six categories again at the end, as v7.js repeats them. */}
        <section className="ag-home-end" aria-label={t('nav.categories')}>
          <JoinCard img="/media/list-business-2.jpg" end />
          <HomeTiles />
        </section>
      </div>
    </div>
  );
}
