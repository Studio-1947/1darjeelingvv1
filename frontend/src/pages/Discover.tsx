import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useHostSignupInfo } from '@/components/provider/onboard/QuickFill';
import api from '@/lib/api';
import { sizedImage } from '@/lib/listingContent';
import Seo from '@/components/Seo';
import BookingWidget from '@/components/BookingWidget';
import HostFeedStrip from '@/components/feed/HostFeedStrip';
import RouteEstimator from '@/components/RouteEstimator';
import { Box, ButtonLink, SecHead, SeeAll, Status } from '@/components/ag';
import { CategoryTiles, SpotCard, StayCard } from '@/components/home/cards';
import { SpotTileSkeleton, StayTileSkeleton, LoadingStatus, repeat } from '@/components/skeletons';

const RED_PANDA = 'https://images.unsplash.com/photo-1542880941-1abfea46bba6';

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

/** Cards per Home section: two rows of the two-column grid. */
const PER_SECTION = 4;

// Hosts start free (server lib/hostGrace.ts), so the card leads with that, not the price.
function HostFreeChip() {
  const { t } = useTranslation();
  const { grace_bookings } = useHostSignupInfo();
  return <Status tone="info" className="self-start" data-testid="host-fee-chip">{t('ob.free.chip', { count: grace_bookings })}</Status>;
}

/** One Home section: eyebrow + title, See all, then a two-column grid. */
function Section({ id, eyebrow, title, to, seeAll, children }: {
  id: string; eyebrow: string; title: string; to: string; seeAll?: React.ReactNode; children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby={id}>
      <SecHead id={id} eyebrow={eyebrow} title={title} action={<SeeAll to={to}>{seeAll ?? t('home.see_all')}</SeeAll>} />
      <div className="grid grid-cols-2 gap-2.5">{children}</div>
    </section>
  );
}

export default function Discover() {
  const { t } = useTranslation();
  const [feed, setFeed] = useState<any[]>([]);
  const [spots, setSpots] = useState<any[]>([]);
  const [homestays, setHomestays] = useState<any[]>([]);
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
    (async () => {
      try {
        const [f, s, h] = await Promise.all([
          api.get('/listings', { params: { limit: 40 } }),
          api.get('/listings', { params: { type: 'spot', limit: 8 } }),
          api.get('/listings', { params: { type: 'homestay', limit: 8 } }),
        ]);
        setSpots(s.data.items || []);
        setHomestays(h.data.items || []);
        setFeed(f.data.items || []);
        // An empty feed is not something a visitor can fix: seeding lives behind
        // POST /api/admin/seed (auth + admin) and is triggered from the admin panel.
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const ofType = (type: string) => feed.filter((x) => x.type === type).slice(0, PER_SECTION);
  const guides = ofType('guide');
  const drivers = ofType('driver');
  const cafes = ofType('cafe');
  const shops = ofType('shop');
  const nature = ofType('biodiversity');
  const card = (it: any) => <StayCard key={it.id} it={it} href={`/listing/${it.id}`} />;

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        <Seo description={t('seo.home_description')} />

        <div className="ag-hero pt-2">
          <h1>
            {t('hero.title_1')}<br />{t('hero.title_2')}<span className="ag-caret" aria-hidden="true" />
          </h1>
          <p>{t('hero.subtitle')}</p>
        </div>

        <BookingWidget />

        <CategoryTiles testIdPrefix="home-tile-" label={t('nav.categories')} />

        {/* List your business: the provider card, right under the categories as in the prototype. */}
        <Box className="!p-0 overflow-hidden" data-testid="home-join-card">
          <img src={sizedImage(RED_PANDA, 800)} alt="" loading="lazy" className="aspect-[16/7] w-full object-cover" />
          <div className="flex flex-col gap-2 px-4 pb-4">
            <HostFreeChip />
            <h2>{t('home.join_title', 'List your Business')}</h2>
            <p className="ag-small m-0">{t('home.join_sub', 'Homestays, drivers, cafes, shops and guides. Free to list, bookings come to you.')}</p>
            <ButtonLink to="/provider/onboard" go className="self-start" data-testid="banner-provider-cta">
              {t('home.join_cta', 'List now')}
            </ButtonLink>
          </div>
        </Box>

        {deals.length > 0 && (
          <section aria-labelledby="home-deals-h">
            <SecHead id="home-deals-h" title={t('home.trending')} />
            <div className="grid grid-cols-2 gap-2.5" data-testid="deals-strip">
              {deals.map((d) => (
                <Link key={d.id} to={dealHref(d.link)} data-testid={`deal-${d.id}`}
                  className="relative flex aspect-[4/3] flex-col justify-between overflow-hidden rounded-[var(--r-card)] border border-[var(--warmline)] bg-[var(--r)] p-3 text-white no-underline">
                  {d.image && <img src={sizedImage(d.image, 600)} alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
                  {/* Keeps the title and tag legible over whatever the photo does. */}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-black/10" aria-hidden="true" />
                  {d.tag ? <span className="ag-status info relative self-start">{d.tag}</span> : <span />}
                  <span className="relative">
                    <b className="block text-base font-medium leading-snug">{d.title}</b>
                    {d.subtitle && <span className="block text-xs text-white/90">{d.subtitle}</span>}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {loading && <LoadingStatus label={t('common.loading')} />}

        {(loading || spots.length > 0) && (
          <Section id="home-spots-h" eyebrow={t('home.must_visit')} title={t('home.tile.spots', 'Offbeat Places')} to="/spots">
            {loading && repeat(PER_SECTION, (i) => <SpotTileSkeleton key={i} />)}
            {spots.slice(0, PER_SECTION).map((s) => (
              <SpotCard key={s.id} it={s} href={`/listing/${s.id}`} testId={`spot-tile-${s.id}`} />
            ))}
          </Section>
        )}

        {(loading || homestays.length > 0) && (
          <Section id="home-stays-h" eyebrow={t('home.stay_local')} title={t('home.tile.stays', 'Homestay')} to="/homestays">
            {loading && repeat(PER_SECTION, (i) => <StayTileSkeleton key={i} />)}
            {homestays.slice(0, PER_SECTION).map((h) => (
              <StayCard key={h.id} it={h} href={`/listing/${h.id}`} ctaLabel={t('cta.book_now')}
                testId={`stay-tile-${h.id}`} ctaTestId={`stay-book-${h.id}`} saveTestId={`stay-save-${h.id}`} />
            ))}
          </Section>
        )}

        {guides.length > 0 && (
          <Section id="home-guides-h" eyebrow={t('home.eyebrow_guides', 'Go with a local')} title={t('home.tile.guides', 'Tour Guides')} to="/guides">
            {guides.map(card)}
          </Section>
        )}

        <section aria-labelledby="home-cars-h" className="flex flex-col gap-2.5">
          <SecHead id="home-cars-h" eyebrow={t('home.eyebrow_cars', 'Ride local')} title={t('home.tile.cars', 'Car & Driver')}
            action={<SeeAll to="/drivers"><MagnifyingGlass size={14} weight="bold" className="mr-1 inline-block align-[-2px]" aria-hidden="true" />{t('home.find_ride', 'Find a ride')}</SeeAll>} />
          {drivers.length > 0 && <div className="grid grid-cols-2 gap-2.5">{drivers.map(card)}</div>}
          <RouteEstimator />
        </section>

        {cafes.length > 0 && (
          <Section id="home-cafes-h" eyebrow={t('home.eyebrow_eat', 'Eat local')} title={t('home.cafes_title', 'Cafes & Restaurants')} to="/cafes">
            {cafes.map(card)}
          </Section>
        )}

        {shops.length > 0 && (
          <Section id="home-shops-h" eyebrow={t('home.eyebrow_shop', 'Shop local')} title={t('home.shops_title', 'Local Shops')} to="/shops">
            {shops.map(card)}
          </Section>
        )}

        {nature.length > 0 && (
          <Section id="home-nature-h" eyebrow={t('home.eyebrow_nature', 'Wild side')} title={t('home.nature_title', 'Nature')} to="/biodiversity">
            {nature.map((n) => <SpotCard key={n.id} it={n} href={`/listing/${n.id}`} />)}
          </Section>
        )}

        <HostFeedStrip />

        {/* The six categories again at the end of Home, as the prototype repeats them. */}
        <section aria-labelledby="home-end-h">
          <SecHead id="home-end-h" title={t('nav.categories')} />
          <CategoryTiles label={t('nav.categories')} />
        </section>
      </div>
    </div>
  );
}
