import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import ListingCard from '@/components/ListingCard';

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

  useEffect(() => {
    setLoading(true);
    api.get('/listings', { params: { type, q: q || undefined, limit: 60 } })
      .then((r) => setItems(r.data.items || []))
      .finally(() => setLoading(false));
  }, [type, q]);

  const title = type ? t(`categories.${type}`) : (q ? `“${q}”` : t('nav.discover'));

  return (
    <div className="mx-auto max-w-7xl px-5 md:px-8 py-10">
      <div className="mb-8">
        <h1 className="font-display font-extrabold text-4xl md:text-5xl text-ink">{title}</h1>
        {q && <p className="mt-2 text-ink-soft">{items.length} results</p>}
      </div>
      {loading ? (
        <p className="text-ink-soft">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <div className="mist-panel p-10 text-center">
          <p className="text-ink-soft">No listings yet in this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((it) => <ListingCard key={it.id} item={it} />)}
        </div>
      )}
    </div>
  );
}
