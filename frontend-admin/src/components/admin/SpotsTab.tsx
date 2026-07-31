import { useMemo, useState } from 'react';
import {
  Plus, Pencil, Trash2, Star, Eye, EyeOff, Search, Mountain, Loader2, ImageIcon, MapPin,
} from 'lucide-react';

export interface AdminSpot {
  id: string;
  title: string;
  type: string;
  description: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  price: number;
  image: string;
  tags: string[];
  created_at: string;
  review_count: number;
  published: boolean;
  featured: boolean;
  sort_order: number;
  extras: Record<string, any>;
}

type Filter = 'all' | 'published' | 'draft' | 'featured';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Drafts' },
  { key: 'featured', label: 'Featured' },
];

/** How complete a spot's editorial content is — nudges the admin to fill the gaps. */
function completeness(spot: AdminSpot): { filled: number; total: number; missing: string[] } {
  const extras = spot.extras || {};
  const checks: [string, boolean][] = [
    ['cover photo', !!spot.image],
    ['gallery', Array.isArray(extras.images) && extras.images.length > 0],
    ['highlights', Array.isArray(extras.highlights) && extras.highlights.length > 0],
    ['timings', !!extras.timings],
    ['entry fee', !!extras.entry_fee],
    ['best time', !!extras.best_time],
    ['how to reach', !!extras.how_to_reach],
    ['map pin', spot.latitude != null && spot.longitude != null],
  ];
  const missing = checks.filter(([, ok]) => !ok).map(([label]) => label);
  return { filled: checks.length - missing.length, total: checks.length, missing };
}

/**
 * Tourist spots tab — the admin-only authoring surface for the /spots section.
 *
 * Spots are curated content rather than a business someone lists, so this is the
 * only place they can be created, edited, published or removed; the backend
 * refuses spot writes from every non-admin caller regardless of what is sent.
 */
export default function SpotsTab({ spots, busyIds, onCreate, onEdit, onDelete, onTogglePublished, onToggleFeatured }: {
  spots: AdminSpot[];
  /** Ids of the spots whose row action is in flight, so only those rows show a spinner. */
  busyIds: string[];
  onCreate: () => void;
  onEdit: (spot: AdminSpot) => void;
  onDelete: (spot: AdminSpot) => void;
  onTogglePublished: (spot: AdminSpot) => void;
  onToggleFeatured: (spot: AdminSpot) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return spots.filter((spot) => {
      if (filter === 'published' && !spot.published) return false;
      if (filter === 'draft' && spot.published) return false;
      if (filter === 'featured' && !spot.featured) return false;
      if (!q) return true;
      return spot.title.toLowerCase().includes(q) || spot.location.toLowerCase().includes(q);
    });
  }, [spots, filter, query]);

  const publishedCount = spots.filter((s) => s.published).length;
  const draftCount = spots.length - publishedCount;

  return (
    <div className="space-y-5" data-testid="spots-tab">
      {/* Toolbar: what exists, how to find it, and the one way to add more. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              data-testid={`spots-filter-${key}`}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                filter === key ? 'bg-pine text-white border-pine' : 'text-ink-soft border-[var(--line)] hover:bg-mist'
              }`}
            >
              {label}
              {key === 'draft' && draftCount > 0 && <span className="ml-1.5 text-[10px] opacity-80">({draftCount})</span>}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search spots"
              data-testid="spots-search"
              className="pl-8 pr-3 py-2 w-48 rounded-full border border-[var(--line)] bg-white text-xs text-ink outline-none focus:ring-2 focus:ring-flag/20 transition-all"
            />
          </div>
          <button
            onClick={onCreate}
            data-testid="spots-add"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-flag text-white rounded-full btn-hover transition-all"
          >
            <Plus size={13} /> Add spot
          </button>
        </div>
      </div>

      <div className="text-xs text-ink-soft">
        {spots.length} spot{spots.length === 1 ? '' : 's'} · {publishedCount} live · {draftCount} draft
        {draftCount === 1 ? '' : 's'}. Only admins can create or edit these — providers never can.
      </div>

      <div className="mist-panel overflow-hidden border border-[var(--line)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-mist text-ink-soft text-xs uppercase font-bold tracking-wider border-b border-[var(--line)]">
                <th className="p-4">Spot</th>
                <th className="p-4">Area</th>
                <th className="p-4">Content</th>
                <th className="p-4">Status</th>
                <th className="p-4">Order</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)] text-sm text-ink">
              {visible.map((spot) => {
                const { filled, total, missing } = completeness(spot);
                const rowBusy = busyIds.includes(spot.id);
                const galleryCount = Array.isArray(spot.extras?.images) ? spot.extras.images.length : 0;
                return (
                  <tr key={spot.id} className={`hover:bg-mist/40 transition-colors ${spot.published ? '' : 'bg-gold/5'}`} data-testid={`spot-row-${spot.id}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-mist flex items-center justify-center shrink-0">
                          {spot.image
                            ? <img src={spot.image} alt="" className="w-full h-full object-cover" />
                            : <ImageIcon size={16} className="text-ink-soft" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold flex items-center gap-1.5">
                            {spot.featured && <Star size={12} className="text-gold fill-gold shrink-0" />}
                            <span className="truncate">{spot.title}</span>
                          </div>
                          <div className="text-[11px] text-ink-soft mt-0.5 flex items-center gap-2">
                            <span className="inline-flex items-center gap-1">
                              <ImageIcon size={10} /> {galleryCount}
                            </span>
                            {spot.latitude != null && spot.longitude != null && (
                              <span className="inline-flex items-center gap-1"><MapPin size={10} /> pinned</span>
                            )}
                            {spot.review_count > 0 && <span>{spot.review_count} review{spot.review_count === 1 ? '' : 's'}</span>}
                            <span>{spot.price > 0 ? `₹${spot.price}` : 'Free'}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="p-4 text-xs text-ink-soft">{spot.location}</td>

                    {/* Content completeness — a spot can be published with gaps, so surface them. */}
                    <td className="p-4">
                      <div className="flex items-center gap-2" title={missing.length ? `Missing: ${missing.join(', ')}` : 'All fields filled'}>
                        <div className="w-16 h-1.5 rounded-full bg-mist overflow-hidden">
                          <div
                            className={`h-full rounded-full ${filled === total ? 'bg-pine' : 'bg-gold'}`}
                            style={{ width: `${(filled / total) * 100}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold text-ink-soft">{filled}/{total}</span>
                      </div>
                    </td>

                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                        spot.published ? 'bg-pine/10 text-pine' : 'bg-gold/20 text-[#8a6b04]'
                      }`}>
                        {spot.published ? 'Live' : 'Draft'}
                      </span>
                    </td>

                    <td className="p-4 text-xs font-mono text-ink-soft">{spot.sort_order}</td>

                    <td className="p-4">
                      <div className="flex items-center justify-center gap-1.5">
                        {rowBusy ? (
                          <Loader2 size={14} className="animate-spin text-ink-soft" />
                        ) : (
                          <>
                            <button
                              onClick={() => onTogglePublished(spot)}
                              data-testid={`spot-publish-${spot.id}`}
                              className="p-1.5 rounded-lg border border-[var(--line)] text-ink-soft hover:bg-mist transition-all"
                              title={spot.published ? 'Unpublish (hide from visitors)' : 'Publish (make live)'}
                            >
                              {spot.published ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                            <button
                              onClick={() => onToggleFeatured(spot)}
                              className={`p-1.5 rounded-lg border transition-all ${
                                spot.featured ? 'border-gold text-gold bg-gold/10' : 'border-[var(--line)] text-ink-soft hover:bg-mist'
                              }`}
                              title={spot.featured ? 'Remove from featured' : 'Feature this spot'}
                            >
                              <Star size={14} className={spot.featured ? 'fill-gold' : ''} />
                            </button>
                            <button
                              onClick={() => onEdit(spot)}
                              data-testid={`spot-edit-${spot.id}`}
                              className="p-1.5 rounded-lg border border-pine/30 text-pine hover:bg-pine/5 transition-all"
                              title="Edit spot"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => onDelete(spot)}
                              data-testid={`spot-delete-${spot.id}`}
                              className="p-1.5 rounded-lg border border-flag/30 text-flag hover:bg-flag/5 transition-all"
                              title="Delete spot"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {visible.length === 0 && (
            <div className="p-10 text-center">
              <Mountain size={28} className="mx-auto text-ink-soft" />
              <p className="mt-3 text-ink-soft text-sm">
                {spots.length === 0
                  ? 'No tourist spots yet. Add the first one — it appears under /spots as soon as you publish it.'
                  : 'No spots match this filter.'}
              </p>
              {spots.length === 0 && (
                <button
                  onClick={onCreate}
                  className="mt-4 inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold bg-flag text-white rounded-full btn-hover"
                >
                  <Plus size={13} /> Add spot
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
