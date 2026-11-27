import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useHostSignupInfo } from '@/components/provider/onboard/QuickFill';
import api from '@/lib/api';
import { lastRidePoint } from '@/lib/lastRidePoint';
import { sizedImage } from '@/lib/listingContent';
import { pickRail } from '@/lib/homeRail';
import Seo from '@/components/Seo';
import BookingWidget from '@/components/BookingWidget';
import RouteEstimator from '@/components/RouteEstimator';
import SuggestPlace from '@/components/spots/SuggestPlace';
import { Icon, type IconName } from '@/components/ag/Icon';
import { cx } from '@/components/ag';
import { useAuth } from '@/context/AuthContext';
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

/** How long a photo slide stays, and the video's limit when it cannot play. */
const PHOTO_MS = 6000;

/**
 * The banner carousel: the hill video, then four photo slides. Swipe or tap a dot; on its own it
 * moves on once the whole video has played, and after 6 s on each photo. The active dot is a small
 * progress bar that fills as the slide runs (the video's own playback, or the photo's 6 s).
 */
function Banners() {
  const { t } = useTranslation();
  const track = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const elapsed = useRef(0);
  const [at, setAt] = useState(0);
  const count = SLIDES.length + 1;
  const still = reducedMotion();

  useEffect(() => {
    const v = video.current;
    elapsed.current = 0;
    if (at === 0 && v && !still) {
      // Back on the video: play it from the start.
      v.currentTime = 0;
      v.play().catch(() => { /* autoplay blocked (e.g. battery saver): runs as a 6 s photo below */ });
    } else {
      v?.pause(); // not playing unseen
    }
    if (still) return undefined;

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      // Time on this slide, counted per frame so a hidden tab (no frames) does not count; a long gap counts as one frame.
      elapsed.current += Math.min(now - last, 100);
      last = now;
      let p = elapsed.current / PHOTO_MS;
      if (at === 0 && v) {
        const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
        const playing = !v.paused && !v.ended;
        if (v.ended) p = 1;
        else if (playing && dur) p = v.currentTime / dur;
        // Playing but stuck loading: move on once well past its length.
        else if (playing) p = elapsed.current >= (dur * 1000 || 20000) + 4000 ? 1 : 0;
      }
      if (fill.current) fill.current.style.transform = `scaleX(${Math.min(1, p)})`;
      if (p >= 1) {
        const el = track.current;
        if (el) el.scrollTo({ left: el.clientWidth * ((at + 1) % count), behavior: 'smooth' });
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [at, count, still]);

  const go = (k: number) => {
    elapsed.current = 0;
    const el = track.current;
    if (el) el.scrollTo({ left: el.clientWidth * k, behavior: still ? 'auto' : 'smooth' });
  };

  return (
    <section className="ag-home-banners" aria-roledescription="carousel" aria-label={t('home.banners', 'Highlights')} data-testid="home-banners">
      <div
        ref={track}
        className="track"
        onScroll={(e) => { const el = e.currentTarget; setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}
        // A touch on a photo starts its 6 s again, so it does not slide away under the finger.
        onPointerDown={() => { elapsed.current = 0; }}
      >
        <div className="slide vid" aria-hidden="true">
          <video ref={video} autoPlay={!still} muted playsInline preload="metadata" poster="/media/hero-poster.jpg">
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
          <button key={k} type="button" className={cx('dot', k === at && 'on', still && 'still')} aria-label={t('home.slide_n', 'Slide {{n}}', { n: k + 1 })}
            aria-current={k === at ? 'true' : undefined} onClick={() => go(k)}>
            {k === at && <span ref={fill} className="fill" aria-hidden="true" />}
          </button>
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

/** The photos among `urls` that actually load; a host photo gone from storage is left out, not drawn empty. */
function useLoadedImages(urls: string[]): string[] {
  const [ok, setOk] = useState<string[]>([]);
  const key = urls.join('|');
  useEffect(() => {
    let live = true;
    setOk([]);
    urls.forEach((u) => {
      const img = new Image();
      img.onload = () => { if (live) setOk((prev) => (prev.includes(u) ? prev : [...prev, u])); };
      img.src = u;
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls.filter((u) => ok.includes(u));
}

/**
 * The card's footer row, as the prototype draws it: a few host faces and "N are in" (GET
 * /app/host-signup: active hosts, and up to three public hosts who set a photo), with the free start
 * (server lib/hostGrace.ts) under it. Before any host is live only the free start shows.
 */
function HostFreeNote({ testId }: { testId?: string }) {
  const { t } = useTranslation();
  const { grace_bookings, live_hosts = 0, recent_hosts = [] } = useHostSignupInfo();
  const faces = useLoadedImages(recent_hosts.slice(0, 3).map((h) => sizedImage(h.avatar, 96)));
  return (
    <span className="joined">
      {live_hosts > 0 && (
        <span className="arein" data-testid={testId ? 'host-count' : undefined}>
          {faces.length > 0 && (
            <span className="faces" aria-hidden="true">
              {faces.map((u) => <span key={u} style={{ backgroundImage: `url(${u})` }} />)}
            </span>
          )}
          <span><b>{live_hosts}</b> {t('home.are_in', 'are in')}</span>
        </span>
      )}
      <span className="free" data-testid={testId}>{t('ob.free.chip', { count: grace_bookings })}</span>
    </span>
  );
}

function JoinCard({ img, end }: { img: string; end?: boolean }) {
  const { t } = useTranslation();
  // Home opens on the business side too (2026-11-27): a host there already runs a business.
  const { isHostMode } = useAuth();
  if (isHostMode) return null;
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

/* ---------- page ---------- */

const PER = { spot: 4, homestay: 5, guide: 9, driver: 4, cafe: 9, shop: 9, biodiversity: 4, event: 4 } as const;
type Kind = keyof typeof PER;
// Hosts' own listings: a business approved in the last two weeks is always given a place in its rail
// (lib/homeRail.ts), so these read a longer page to find it. Spots, nature and festivals stay curated.
const HOST_KINDS: readonly Kind[] = ['homestay', 'guide', 'driver', 'cafe', 'shop'];
const HOST_PAGE = 60;

export default function Discover() {
  const { t } = useTranslation();
  const [lists, setLists] = useState<Partial<Record<Kind, any[]>>>({});
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
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
    const isHost = (k: Kind) => HOST_KINDS.includes(k);
    // Drivers nearest where this traveller last looked for a ride, best first (lib/lastRidePoint.ts);
    // with no such point, the best drivers anywhere.
    const ride = lastRidePoint();
    const near = ride ? { near_lat: ride.lat, near_lng: ride.lng } : {};
    Promise.allSettled(kinds.map((type) => api.get('/listings', { params: { type, limit: isHost(type) ? HOST_PAGE : PER[type], ...(type === 'driver' ? near : {}) } })))
      .then((res) => {
        if (!live) return;
        const next: Partial<Record<Kind, any[]>> = {};
        const newIds = new Set<string>();
        res.forEach((r, i) => {
          const k = kinds[i];
          const items: any[] = r.status === 'fulfilled' ? (r.value.data?.items || []) : [];
          if (!isHost(k)) { next[k] = items.slice(0, PER[k]); return; }
          const picked = pickRail(items, PER[k]);
          next[k] = picked.items;
          picked.fresh.forEach((id) => newIds.add(String(id)));
        });
        setLists(next);
        setFresh(newIds);
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
            <SuggestPlace />
          </Section>
        )}

        {(loading || stays.length > 0) && (
          <Section id="home-stays-h" tone="band" eyebrow={t('home.stay_local')} title={t('home.tile.stays', 'Homestay')}
            action={<SeeAllLink to="/homestays">{seeAll}</SeeAllLink>}>
            <div className="ag-home-stays">
              {loading && repeat(2, (i) => <div key={i} className="col-span-full"><StayTileSkeleton /></div>)}
              {stays.map((h) => (
                <StayCard key={h.id} it={h} href={`/listing/${h.id}`} wide ctaLabel={t('cta.book_now')}
                  testId={`stay-tile-${h.id}`} ctaTestId={`stay-book-${h.id}`} saveTestId={`stay-save-${h.id}`} />
              ))}
            </div>
          </Section>
        )}

        {guides.length > 0 && (
          <Section id="home-guides-h" tone="soft" eyebrow={t('home.eyebrow_guides', 'Go with a local')} title={t('home.tile.guides', 'Tour Guides')}
            action={<SeeAllLink to="/guides">{seeAll}</SeeAllLink>}>
            <div className="ag-home-three">
              {guides.map((g) => <GuideCard key={g.id} it={g} fresh={fresh.has(String(g.id))} href={`/listing/${g.id}`} testId={`guide-tile-${g.id}`} />)}
            </div>
          </Section>
        )}

        <Section id="home-cars-h" eyebrow={t('home.eyebrow_cars', 'Ride local')} title={t('home.tile.cars', 'Car & Driver')}
          action={<SeeAllLink to="/drivers" icon="search">{t('home.find_ride', 'Find a ride')}</SeeAllLink>}>
          {drivers.length > 0 && (
            <div className="ag-home-stays">
              {drivers.map((d) => (
                <StayCard key={d.id} it={d} href={`/listing/${d.id}`} wide selfie ctaLabel={t('cta.book_now')} testId={`driver-tile-${d.id}`} />
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
              {cafes.map((c) => <ShopCard key={c.id} it={c} fresh={fresh.has(String(c.id))} href={`/listing/${c.id}`} testId={`cafe-tile-${c.id}`} />)}
            </div>
          </Section>
        )}

        {shops.length > 0 && (
          <Section id="home-shops-h" tone="band" eyebrow={t('home.eyebrow_shop', 'Shop local')} title={t('home.shops_title', 'Local Shops')}
            action={<SeeAllLink to="/shops">{seeAll}</SeeAllLink>}>
            <div className="ag-home-three">
              {shops.map((s) => <ShopCard key={s.id} it={s} fresh={fresh.has(String(s.id))} href={`/listing/${s.id}`} testId={`shop-tile-${s.id}`} />)}
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
