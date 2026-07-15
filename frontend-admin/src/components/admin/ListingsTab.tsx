import { Trash2 } from 'lucide-react';

interface ListingsTabProps {
  listings: any[];
  onDeleteListing: (listingId: string, title: string) => Promise<void>;
}

/**
 * ListingsTab displays spots, homestays, driver hires, cafes, and shops,
 * with active controls to delete spam or incorrect content.
 */
export default function ListingsTab({ listings, onDeleteListing }: ListingsTabProps) {
  return (
    <div className="mist-panel overflow-hidden border border-[var(--line)]">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-mist text-ink-soft text-xs uppercase font-bold tracking-wider border-b border-[var(--line)]">
              <th className="p-4">Service Details</th>
              <th className="p-4">Category</th>
              <th className="p-4">Location</th>
              <th className="p-4">Price</th>
              <th className="p-4 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] text-sm text-ink">
            {listings.map((lst) => (
              <tr key={lst.id} className="hover:bg-mist/40 transition-colors">
                {/* Service Card Details */}
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-mist flex-shrink-0">
                      {lst.image && <img src={lst.image} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div>
                      <div className="font-bold">{lst.title}</div>
                      <div className="text-[11px] text-ink-soft mt-0.5 font-mono select-all">{lst.id}</div>
                    </div>
                  </div>
                </td>

                {/* Categories */}
                <td className="p-4 capitalize">
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-mist text-ink-soft">
                    {lst.type}
                  </span>
                </td>

                {/* Location */}
                <td className="p-4 text-xs text-ink-soft">{lst.location}</td>

                {/* Price tag */}
                <td className="p-4 font-bold text-pine">₹{lst.price}</td>

                {/* Actions */}
                <td className="p-4 text-center">
                  <button
                    onClick={() => onDeleteListing(lst.id, lst.title)}
                    className="p-1.5 rounded-lg border border-flag/30 text-flag hover:bg-flag/5 transition-all"
                    title="Delete Listing"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {listings.length === 0 && (
          <div className="p-8 text-center text-ink-soft">No active listings found. Seed listing content.</div>
        )}
      </div>
    </div>
  );
}
