interface BookingsTabProps {
  bookings: any[];
}

/**
 * BookingsTab displays check-ins, guest counts, and status indicators
 * for all bookings across the platform.
 */
export default function BookingsTab({ bookings }: BookingsTabProps) {
  return (
    <div className="mist-panel overflow-hidden border border-[var(--line)]">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-mist text-ink-soft text-xs uppercase font-bold tracking-wider border-b border-[var(--line)]">
              <th className="p-4">Listing</th>
              <th className="p-4">Check-in / Check-out</th>
              <th className="p-4">Guests</th>
              <th className="p-4">Status</th>
              <th className="p-4">Booking ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)] text-sm text-ink">
            {bookings.map((bk) => (
              <tr key={bk.id} className="hover:bg-mist/40 transition-colors">
                {/* Booked Listing Details */}
                <td className="p-4">
                  <div className="font-bold">{bk.listingTitle}</div>
                  <div className="text-xs text-ink-soft capitalize">{bk.listingType}</div>
                </td>

                {/* Dates */}
                <td className="p-4 text-xs text-ink-soft">
                  {bk.checkIn ? `${bk.checkIn} to ${bk.checkOut}` : 'N/A'}
                </td>

                {/* Number of guests */}
                <td className="p-4 font-semibold">{bk.guests}</td>

                {/* Booking status badges */}
                <td className="p-4">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    bk.status === 'confirmed' ? 'bg-pine/10 text-pine' : bk.status === 'cancelled' ? 'bg-flag/10 text-flag' : 'bg-gold/10 text-gold-dark'
                  }`}>
                    {bk.status}
                  </span>
                </td>

                {/* Booking ID identifier */}
                <td className="p-4 font-mono text-xs text-ink-soft select-all">{bk.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {bookings.length === 0 && (
          <div className="p-8 text-center text-ink-soft">No booking records found.</div>
        )}
      </div>
    </div>
  );
}
