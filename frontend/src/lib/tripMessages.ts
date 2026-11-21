/**
 * Small shared rules for the board's booking flow, the same as the server's lib/hostStats.ts and
 * the app's src/lib/tripMessages.ts.
 */

/** Today in Darjeeling as YYYY-MM-DD: booking dates are calendar days there. */
export const todayInIndia = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

type B = { status: string; check_in?: string | null; check_out?: string | null; guests?: number };

/** Happening today: checked in, not yet checked out. */
export function isOngoing(b: B, today = todayInIndia()): boolean {
  if (b.status !== 'confirmed' || !b.check_in) return false;
  return b.check_in.slice(0, 10) <= today && (b.check_out || b.check_in).slice(0, 10) >= today;
}

/** On, but not started yet. */
export function isUpcoming(b: B, today = todayInIndia()): boolean {
  if (b.status !== 'confirmed' && b.status !== 'accepted') return false;
  if (!b.check_in) return b.status === 'accepted';
  return b.check_in.slice(0, 10) > today;
}

/** Finished: confirmed and the last day has gone by (or no date at all). */
export function isFinished(b: B, today = todayInIndia()): boolean {
  if (b.status !== 'confirmed') return false;
  const end = b.check_out || b.check_in;
  return !end || end.slice(0, 10) < today;
}

export const sumGuests = (list: B[]) => list.reduce((a, b) => a + (b.guests || 0), 0);

/** wa.me link for a number in any written form (+91 98765 43210, 098765..., 9876543210). */
export function waLink(phone: string | null | undefined, text: string): string {
  let d = (phone || '').replace(/\D/g, '');
  if (d.length === 10) d = `91${d}`;
  if (d.length === 11 && d.startsWith('0')) d = `91${d.slice(1)}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

/** wa.me link with no number: WhatsApp asks who to send it to. */
export const waShare = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/**
 * Board, Guide: "Confirm > Call/WhatsApp > Long message to tourist with WhatsApp message".
 * Everything the guest needs in one message: when, how many, what is included and the price,
 * where to meet, and who to call.
 */
export function guideTripMessage(opts: {
  guestName?: string | null;
  hostName: string;
  businessName: string;
  date?: string | null;
  endDate?: string | null;
  guests?: number;
  services: { name: string; price?: number; unit?: string }[];
  meetingPoint?: string | null;
  phone?: string | null;
  notes?: string | null;
}): string {
  const when = opts.date
    ? new Date(opts.date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      + (opts.endDate && opts.endDate !== opts.date ? ` to ${new Date(opts.endDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}` : '')
    : 'the date we agree';
  const lines = [
    `Namaste ${opts.guestName || ''}! This is ${opts.hostName} from ${opts.businessName} on aangan.`.replace('  ', ' '),
    '',
    `Your guided trip is confirmed for ${when}${opts.guests ? `, for ${opts.guests} ${opts.guests === 1 ? 'person' : 'people'}` : ''}.`,
  ];
  if (opts.services.length) {
    lines.push('', 'What we will do:');
    opts.services.forEach((s) => lines.push(`• ${s.name}${s.price ? ` – ₹${s.price.toLocaleString('en-IN')}${s.unit ? ` per ${s.unit}` : ''}` : ''}`));
  }
  if (opts.meetingPoint) lines.push('', `Where we meet: ${opts.meetingPoint}`);
  if (opts.notes) lines.push('', `Your note: ${opts.notes}`);
  lines.push(
    '',
    'Please carry water, a light jacket and comfortable shoes. Reply here with any questions, or if anything changes.',
    opts.phone ? `You can also call me on ${opts.phone}.` : '',
    '',
    'See you soon!',
  );
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
}

/**
 * Board, after completion: "Share your trip story (WhatsApp + asking others to join the app
 * through link tap)".
 */
export function tripStoryMessage(opts: { place: string; rating?: number; story?: string; inviteCode?: string | null; site?: string }): string {
  const site = opts.site || (typeof window !== 'undefined' ? window.location.origin : 'https://aanganerp.in');
  const stars = opts.rating ? ` ${'★'.repeat(opts.rating)}` : '';
  return [
    `Just back from ${opts.place}${stars}, booked on aangan.`,
    opts.story ? `"${opts.story}"` : '',
    '',
    `Plan your own Darjeeling trip with local homestays, drivers, guides and cafes: ${site}`,
    opts.inviteCode ? `Use my code ${opts.inviteCode} when you sign up.` : '',
  ].filter(Boolean).join('\n');
}
