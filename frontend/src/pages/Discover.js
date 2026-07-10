import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import FeedCard from '@/components/FeedCard';
import StoryCircle from '@/components/StoryCircle';
import BookingWidget from '@/components/BookingWidget';
import { Mountain, Home as HomeIcon, Car, Store, Coffee, PartyPopper, Leaf, ArrowRight, Sparkles, TrendingUp } from 'lucide-react';

const HERO_IMG = 'https://images.unsplash.com/photo-1584395631446-e41b0fc3f68d';
const RED_PANDA = 'https://images.unsplash.com/photo-1542880941-1abfea46bba6';
const TEA_GARDEN = 'https://images.pexels.com/photos/35151733/pexels-photo-35151733.jpeg';
const TEA_PLANTATION = 'https://images.pexels.com/photos/103875/pexels-photo-103875.jpeg';
const CAFE_IMG = 'https://images.pexels.com/photos/33932441/pexels-photo-33932441.png';

const STORIES = [
  { key: 'spot', to: '/spots', image: HERO_IMG, Icon: Mountain },
  { key: 'homestay', to: '/homestays', image: TEA_GARDEN, Icon: HomeIcon },
  { key: 'driver', to: '/drivers', image: TEA_PLANTATION, Icon: Car },
  { key: 'shop', to: '/shops', image: null, Icon: Store },
  { key: 'cafe', to: '/cafes', image: CAFE_IMG, Icon: Coffee },
  { key: 'event', to: '/events', image: null, Icon: PartyPopper },
  { key: 'biodiversity', to: '/biodiversity', image: RED_PANDA, Icon: Leaf },
];

const DEALS = [
  { key: 'monsoon', title: 'Monsoon escapes', sub: 'Homestays from ₹1,200', tag: '25% OFF', color: 'from-pine to-pine-dark', to: '/homestays' },
  { key: 'sunrise', title: 'Sunrise at Tiger Hill', sub: 'Full day cab + guide', tag: 'BEST SELLER', color: 'from-flag to-[#8a1e1e]', to: '/drivers' },
  { key: 'tea', title: 'Tea garden tours', sub: 'Live tasting sessions', tag: 'NEW', color: 'from-gold to-[#c69108]', to: '/spots' },
];

export default function Discover() {
  const { t } = useTranslation();
  const [feed, setFeed] = useState([]);
  const [spots, setSpots] = useState([]);
  const [homestays, setHomestays] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const load = async () => {
          const [f, s, h] = await Promise.all([
            api.get('/listings', { params: { limit: 40 } }),
            api.get('/listings', { params: { type: 'spot', limit: 8 } }),
            api.get('/listings', { params: { type: 'homestay', limit: 8 } }),
          ]);
          setSpots(s.data.items || []);
          setHomestays(h.data.items || []);
          // interleave a feed with variety: homestay, spot, cafe, biodiversity...
          const all = f.data.items || [];
          const ordered = [
            ...all.filter((x) => x.type === 'homestay'),
            ...all.filter((x) => x.type === 'spot'),
            ...all.filter((x) => x.type === 'cafe'),
            ...all.filter((x) => x.type === 'biodiversity'),
            ...all.filter((x) => x.type === 'driver'),
            ...all.filter((x) => x.type === 'shop'),
            ...all.filter((x) => x.type === 'event'),
          ];
          setFeed(ordered);
          return ordered.length;
        };
        const n = await load();
        if (n === 0) { await api.post('/admin/seed'); await load(); }
      } catch (e) { console.error(e); }
    })();
  }, []);

  return (
    <div>
      {/* Stories row (Instagram style) */}
      <section className="border-b border-[var(--line)] bg-white sticky top-14 md:top-16 z-20">
        <div className="mx-auto max-w-6xl px-3 md:px-6 py-3 overflow-x-auto no-scrollbar">
          <div className="flex items-start gap-3 md:gap-4">
            {STORIES.map((s, i) => (
              <motion.div key={s.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <StoryCircle to={s.to} label={t(`categories.${s.key}`)} image={s.image} icon={s.Icon} active={i === 0} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* HERO / Booking widget */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img src={HERO_IMG} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-[var(--bg)]" />
        </div>
        <div className="relative z-10 mx-auto max-w-6xl px-4 md:px-6 pt-10 md:pt-16 pb-8 md:pb-12">
          <div className="text-white max-w-2xl">
            <span className="chip bg-white/20 !text-white backdrop-blur border border-white/30">{t('hero.eyebrow')}</span>
            <h1 className="mt-4 font-display font-extrabold text-[2.3rem] leading-[1.05] sm:text-5xl md:text-6xl tracking-tight drop-shadow-lg">
              {t('hero.title_1')}<br />{t('hero.title_2')}
            </h1>
            <p className="mt-3 md:mt-4 text-white/95 text-sm md:text-lg max-w-lg drop-shadow">{t('hero.subtitle')}</p>
          </div>
          <div className="mt-6 md:mt-8">
            <BookingWidget />
          </div>
        </div>
      </section>

      {/* Deals strip (MMT-style) */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 pt-6 md:pt-8">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={18} className="text-flag" />
          <h2 className="font-display font-extrabold text-lg md:text-xl text-ink">Trending in Darjeeling</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {DEALS.map((d) => (
            <Link key={d.key} to={d.to} data-testid={`deal-${d.key}`}
              className={`relative overflow-hidden rounded-2xl p-4 md:p-5 text-white bg-gradient-to-br ${d.color} btn-hover min-h-[110px] flex flex-col justify-between`}>
              <span className="inline-block w-fit px-2 py-0.5 rounded-full bg-white/25 backdrop-blur text-[10px] font-extrabold tracking-wider">{d.tag}</span>
              <div>
                <div className="font-display font-extrabold text-xl md:text-2xl leading-tight">{d.title}</div>
                <div className="text-sm text-white/90 mt-0.5">{d.sub}</div>
              </div>
              <ArrowRight size={18} className="absolute top-4 right-4 opacity-80" />
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Spots — horizontal scroll (MMT style) */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 pt-8 md:pt-10">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-flag">Must visit</div>
            <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink mt-0.5">{t('categories.spot')}</h2>
          </div>
          <Link to="/spots" className="text-sm font-bold text-pine whitespace-nowrap">See all →</Link>
        </div>
        <div className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-4 px-4 md:mx-0 md:px-0 pb-2">
          {spots.map((s) => (
            <Link key={s.id} to={`/listing/${s.id}`} data-testid={`spot-tile-${s.id}`}
              className="snap-start flex-shrink-0 w-[70%] sm:w-[45%] md:w-[30%] rounded-2xl overflow-hidden bg-white border border-[var(--line)] btn-hover">
              <div className="aspect-[4/5] relative bg-mist overflow-hidden">
                {s.image && <img src={s.image} alt={s.title} className="w-full h-full object-cover" loading="lazy" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute bottom-0 inset-x-0 p-3 md:p-4 text-white">
                  <div className="text-[10px] uppercase tracking-widest opacity-90">{s.location}</div>
                  <div className="font-display font-extrabold text-lg md:text-xl leading-tight drop-shadow line-clamp-2">{s.title}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Homestays quick pick */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 pt-8 md:pt-10">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-flag">Stay local</div>
            <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink mt-0.5">{t('categories.homestay')}</h2>
          </div>
          <Link to="/homestays" className="text-sm font-bold text-pine whitespace-nowrap">See all →</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {homestays.slice(0, 4).map((h) => (
            <Link key={h.id} to={`/listing/${h.id}`} data-testid={`stay-tile-${h.id}`} className="block rounded-2xl overflow-hidden bg-white border border-[var(--line)] btn-hover">
              <div className="aspect-square bg-mist overflow-hidden">
                {h.image && <img src={h.image} alt={h.title} className="w-full h-full object-cover" loading="lazy" />}
              </div>
              <div className="p-3">
                <div className="font-display font-bold text-sm md:text-base text-ink line-clamp-1">{h.title}</div>
                <div className="text-[11px] text-ink-soft line-clamp-1 mt-0.5">{h.location}</div>
                <div className="mt-1.5 flex items-baseline gap-1">
                  <span className="font-extrabold text-pine text-sm md:text-base">₹{h.price}</span>
                  <span className="text-[10px] text-ink-soft">/night</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Instagram-style feed */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 pt-10 md:pt-14">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={18} className="text-flag" />
          <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">Explore Darjeeling</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          {feed.map((it, idx) => (
            <FeedCard key={it.id} item={it} priority={idx < 2} />
          ))}
        </div>
      </section>

      {/* Provider CTA banner */}
      <section className="mx-auto max-w-6xl px-4 md:px-6 pt-10 md:pt-14">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-pine to-pine-dark text-white p-6 md:p-10">
          <div className="max-w-lg relative z-10">
            <span className="chip bg-white/15 !text-white backdrop-blur">₹99 · one-time</span>
            <h3 className="mt-3 font-display font-extrabold text-2xl sm:text-3xl md:text-4xl leading-tight">{t('provider.onboard_title')}</h3>
            <p className="mt-2 text-white/90 text-sm md:text-base">{t('provider.onboard_sub')}</p>
            <Link to="/provider/onboard" data-testid="banner-provider-cta" className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white text-pine font-extrabold btn-hover">
              {t('hero.cta_provider')} <ArrowRight size={16} />
            </Link>
          </div>
          <img src={RED_PANDA} alt="" className="absolute -right-8 -bottom-8 md:right-6 md:bottom-6 w-40 h-40 md:w-52 md:h-52 rounded-full object-cover border-4 border-white/20 opacity-90" />
        </div>
      </section>
    </div>
  );
}
