import React, { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import FeedCard from '@/components/FeedCard';
import { LayoutGrid, Rows3, MapPin, ArrowRight } from 'lucide-react';

const TYPE_MAP = {
  spots: 'spot',
  homestays: 'homestay',
  drivers: 'driver',
  shops: 'shop',
  cafes: 'cafe',
  events: 'event',
  biodiversity: 'biodiversity',
};

export default function Category({ typeOverride }) {
  const { t } = useTranslation();
  const { type: paramType } = useParams();
  const [sp] = useSearchParams();
  const q = sp.get('q') || '';
  const type = typeOverride ? typeOverride : TYPE_MAP[paramType];
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('grid'); // 'grid' or 'feed'

  useEffect(() => {
    setLoading(true);
    api.get('/listings', { params: { type, q: q || undefined, limit: 60 } })
      .then((r) => setItems(r.data.items || []))
      .finally(() => setLoading(false));
  }, [type, q]);

  const title = type ? t(`categories.${type}`) : (q ? `“${q}”` : t('nav.discover'));

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-8">
      {/* Sticky sub-header */}
      <div className="flex items-end justify-between mb-4 md:mb-6">
        <div>
          {q && <div className="text-[11px] font-bold uppercase tracking-widest text-flag">Search</div>}
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">{title}</h1>
          <p className="mt-1 text-sm text-ink-soft">{items.length} results</p>
        </div>
        <div className="hidden sm:flex items-center gap-1 p-1 rounded-full bg-white border border-[var(--line)]">
          <button onClick={() => setView('grid')} data-testid="view-grid"
            className={`p-2 rounded-full ${view === 'grid' ? 'bg-mist text-pine' : 'text-ink-soft'}`}>
            <LayoutGrid size={16} />
          </button>
          <button onClick={() => setView('feed')} data-testid="view-feed"
            className={`p-2 rounded-full ${view === 'feed' ? 'bg-mist text-pine' : 'text-ink-soft'}`}>
            <Rows3 size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-ink-soft">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <div className="mist-panel p-8 md:p-10 text-center">
          <p className="text-ink-soft">No listings yet in this category.</p>
        </div>
      ) : view === 'grid' ? (
        // Instagram Explore-style grid: tight, image-first
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
          {items.map((it) => {
            const ctaKey = it.type === 'homestay' ? 'book_now'
              : it.type === 'driver' ? 'talk_to_driver'
              : it.type === 'shop' ? 'contact_shop'
              : it.type === 'cafe' ? 'visit_cafe'
              : it.type === 'event' ? 'join_event'
              : it.type === 'biodiversity' ? 'learn_more'
              : 'explore';
            return (
              <div key={it.id} data-testid={`grid-tile-${it.id}`} className="flex flex-col rounded-xl sm:rounded-2xl bg-white border border-[var(--line)] overflow-hidden btn-hover">
                <Link to={`/listing/${it.id}`} className="block relative aspect-square overflow-hidden bg-mist group">
                  {it.image && (
                    <img src={it.image} alt={it.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  <div className="absolute bottom-0 inset-x-0 p-2 sm:p-3 text-white">
                    <div className="font-display font-extrabold text-xs sm:text-sm md:text-base leading-tight line-clamp-2 drop-shadow">{it.title}</div>
                    <div className="text-[10px] text-white/90 flex items-center gap-1 mt-0.5"><MapPin size={10} /> <span className="line-clamp-1">{it.location}</span></div>
                  </div>
                  {it.price > 0 && (
                    <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-white/95 text-ink text-[11px] font-extrabold">
                      ₹{it.price}
                    </div>
                  )}
                </Link>
                <div className="p-2 sm:p-3">
                  <Link to={`/listing/${it.id}`} data-testid={`grid-cta-${it.id}`}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-full bg-flag text-white font-bold text-xs btn-hover">
                    {t(`cta.${ctaKey}`)} <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
          {items.map((it, i) => <FeedCard key={it.id} item={it} priority={i < 2} />)}
        </div>
      )}
    </div>
  );
}
