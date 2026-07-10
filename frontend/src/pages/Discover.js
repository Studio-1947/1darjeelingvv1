import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import ListingCard from '@/components/ListingCard';
import { Search, Mountain, Home as HomeIcon, Car, Store, Coffee, PartyPopper, Leaf, ArrowRight } from 'lucide-react';

const HERO_IMG = 'https://images.unsplash.com/photo-1584395631446-e41b0fc3f68d';
const RED_PANDA = 'https://images.unsplash.com/photo-1542880941-1abfea46bba6';

const CATS = [
  { key: 'spot', to: '/spots', Icon: Mountain },
  { key: 'homestay', to: '/homestays', Icon: HomeIcon },
  { key: 'driver', to: '/drivers', Icon: Car },
  { key: 'shop', to: '/shops', Icon: Store },
  { key: 'cafe', to: '/cafes', Icon: Coffee },
  { key: 'event', to: '/events', Icon: PartyPopper },
  { key: 'biodiversity', to: '/biodiversity', Icon: Leaf },
];

export default function Discover() {
  const { t } = useTranslation();
  const [featured, setFeatured] = useState([]);
  const [homestays, setHomestays] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [a, b] = await Promise.all([
          api.get('/listings', { params: { type: 'spot', limit: 6 } }),
          api.get('/listings', { params: { type: 'homestay', limit: 4 } }),
        ]);
        setFeatured(a.data.items || []);
        setHomestays(b.data.items || []);
        if ((a.data.items || []).length === 0) {
          await api.post('/admin/seed');
          const [a2, b2] = await Promise.all([
            api.get('/listings', { params: { type: 'spot', limit: 6 } }),
            api.get('/listings', { params: { type: 'homestay', limit: 4 } }),
          ]);
          setFeatured(a2.data.items || []);
          setHomestays(b2.data.items || []);
        }
      } catch (e) { console.error(e); }
    })();
  }, []);

  const submitSearch = (e) => {
    e.preventDefault();
    if (q.trim()) window.location.href = `/search?q=${encodeURIComponent(q.trim())}`;
  };

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-5 md:px-8 pt-12 md:pt-20 pb-16 grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7">
            <span className="chip" data-testid="hero-eyebrow">{t('hero.eyebrow')}</span>
            <h1 className="mt-5 font-display font-extrabold text-5xl md:text-6xl lg:text-7xl text-ink leading-[1.02] tracking-tight">
              <span className="block">{t('hero.title_1')}</span>
              <span className="block"><span className="headline-mark">{t('hero.title_2')}</span></span>
            </h1>
            <p className="mt-6 text-lg text-ink-soft max-w-xl leading-relaxed">{t('hero.subtitle')}</p>

            <form onSubmit={submitSearch} className="mt-8 flex items-center gap-2 bg-white p-2 rounded-full border border-[var(--line)] shadow-sm max-w-xl">
              <Search size={20} className="ml-3 text-ink-soft" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('search.placeholder')}
                data-testid="hero-search-input"
                className="flex-1 py-2.5 px-2 bg-transparent outline-none text-ink placeholder:text-ink-soft"
              />
              <button data-testid="hero-search-btn" className="px-5 py-2.5 rounded-full bg-pine text-white font-bold btn-hover">{t('hero.cta_explore')}</button>
            </form>

            <div className="mt-6 flex items-center gap-3">
              <Link to="/provider/onboard" data-testid="hero-provider-cta" className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-flag text-white font-bold btn-hover">
                {t('hero.cta_provider')} <ArrowRight size={16} />
              </Link>
              <Link to="/responsible" data-testid="hero-responsible-cta" className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white border border-[var(--line)] text-ink font-bold btn-hover">
                {t('nav.responsible')}
              </Link>
            </div>
          </div>
          <div className="lg:col-span-5 relative">
            <div className="relative aspect-[4/5] w-full rounded-[36px] overflow-hidden bg-mist">
              <img src={HERO_IMG} alt="Kanchenjunga" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 text-white">
                <div className="text-xs uppercase tracking-widest opacity-90">Kanchenjunga</div>
                <div className="font-display font-extrabold text-3xl mt-1 drop-shadow">8,586 m</div>
              </div>
            </div>
            <div className="absolute -bottom-6 -left-6 w-40 h-40 rounded-3xl overflow-hidden border-4 border-white shadow-xl hidden md:block">
              <img src={RED_PANDA} alt="Red panda" className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* Category grid */}
      <section className="mx-auto max-w-7xl px-5 md:px-8 py-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {CATS.map(({ key, to, Icon }, i) => (
            <motion.div key={key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Link to={to} data-testid={`cat-${key}`} className="card-shell p-5 flex flex-col items-start gap-3 h-full">
                <div className="w-10 h-10 rounded-full bg-mist text-pine grid place-items-center">
                  <Icon size={18} />
                </div>
                <div className="font-display font-bold text-ink">{t(`categories.${key}`)}</div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Featured Spots */}
      <section className="mx-auto max-w-7xl px-5 md:px-8 py-10">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-display font-extrabold text-3xl md:text-4xl text-ink">{t('categories.spot')}</h2>
          <Link to="/spots" className="text-sm font-bold text-pine">{t('common.explore_all')} →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {featured.map((it) => <ListingCard key={it.id} item={it} />)}
        </div>
      </section>

      {/* Homestays */}
      <section className="mx-auto max-w-7xl px-5 md:px-8 py-10">
        <div className="flex items-end justify-between mb-6">
          <h2 className="font-display font-extrabold text-3xl md:text-4xl text-ink">{t('categories.homestay')}</h2>
          <Link to="/homestays" className="text-sm font-bold text-pine">{t('common.explore_all')} →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {homestays.map((it) => <ListingCard key={it.id} item={it} />)}
        </div>
      </section>

      {/* Provider banner */}
      <section className="mx-auto max-w-7xl px-5 md:px-8 py-10">
        <div className="mist-panel p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <span className="chip">₹99 one-time</span>
            <h3 className="mt-3 font-display font-extrabold text-3xl md:text-4xl text-ink">{t('provider.onboard_title')}</h3>
            <p className="mt-3 text-ink-soft max-w-md">{t('provider.onboard_sub')}</p>
            <Link to="/provider/onboard" data-testid="banner-provider-cta" className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-pine text-white font-bold btn-hover">
              {t('hero.cta_provider')} <ArrowRight size={16} />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[HomeIcon, Car, Store, Coffee, Mountain, PartyPopper].map((Ic, i) => (
              <div key={i} className="aspect-square rounded-2xl bg-white border border-[var(--line)] grid place-items-center text-pine">
                <Ic size={22} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
