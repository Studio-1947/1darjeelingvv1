import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';

export default function ListingCard({ item, badge }) {
  const { t } = useTranslation();
  const unit = item.type === 'homestay' ? t('common.per_night') : item.type === 'driver' ? t('common.per_day') : '';
  return (
    <Link to={`/listing/${item.id}`} data-testid={`listing-card-${item.id}`} className="card-shell block">
      <div className="relative aspect-[4/3] overflow-hidden bg-mist">
        {item.image ? (
          <img src={item.image} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-mist" />
        )}
        {badge && <span className="absolute top-3 left-3 chip bg-white text-pine shadow-sm">{badge}</span>}
        {item.price > 0 && (
          <span className="absolute bottom-3 right-3 px-3 py-1 rounded-full bg-white/95 text-ink text-sm font-bold shadow-sm">
            ₹{item.price}{unit}
          </span>
        )}
      </div>
      <div className="p-5">
        <h3 className="font-display font-bold text-lg text-ink line-clamp-1">{item.title}</h3>
        <p className="text-xs text-ink-soft mt-1 flex items-center gap-1"><MapPin size={12} /> {item.location}</p>
        <p className="text-sm text-ink-soft mt-3 line-clamp-2">{item.description}</p>
      </div>
    </Link>
  );
}
