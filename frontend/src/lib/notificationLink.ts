/**
 * Where a message from the team opens on the website. The admin panel's Notifications page picks
 * one of these screen keys (or an https address); the app maps the same keys to its own screens
 * (app repo src/lib/notificationLink.ts). The website has no separate pass or invite page, so
 * those open the traveller dashboard, which has both.
 */
const WEB: Record<string, { traveller: string; host?: string }> = {
  home: { traveller: '/', host: '/provider/dashboard' },
  explore: { traveller: '/explore' },
  feed: { traveller: '/feed' },
  trips: { traveller: '/my-trips' },
  saved: { traveller: '/saved' },
  pass: { traveller: '/dashboard' },
  refer: { traveller: '/dashboard' },
  profile: { traveller: '/profile/edit' },
  host_dashboard: { traveller: '/provider/dashboard' },
  host_bookings: { traveller: '/provider/dashboard?s=bookings' },
  host_plan: { traveller: '/provider/dashboard' },
};

export type LinkTarget = { kind: 'route'; to: string } | { kind: 'external'; href: string } | null;

export function webLinkTarget(
  link: string | null | undefined,
  isHostMode: boolean,
  origin: string = typeof window !== 'undefined' ? window.location.origin : '',
): LinkTarget {
  if (!link) return null;
  const screen = WEB[link];
  if (screen) return { kind: 'route', to: (isHostMode && screen.host) || screen.traveller };
  if (/^https:\/\//i.test(link)) {
    try {
      const url = new URL(link);
      // Our own pages stay in this tab.
      if (url.origin === origin) return { kind: 'route', to: `${url.pathname}${url.search}${url.hash}` };
      return { kind: 'external', href: url.toString() };
    } catch {
      return null;
    }
  }
  return null;
}

/** A booking notice (request, acceptance, cancellation): opens where that booking is handled. */
export const isBookingNote = (kind?: string) => !!kind && (kind.startsWith('booking_') || kind.startsWith('cancel_request'));

/**
 * Where tapping a notification goes, on the Notifications page and in the search sheet alike:
 * the team's chosen screen first, then by what the notice is about.
 */
export function noteTarget(
  n: { kind?: string; ref_id?: string | null; link?: string | null },
  isHostMode: boolean,
): LinkTarget {
  const target = webLinkTarget(n.link, isHostMode);
  if (target) return target;
  const to = (path: string): LinkTarget => ({ kind: 'route', to: path });
  if (isBookingNote(n.kind)) return to(isHostMode ? `/provider/dashboard?s=bookings${n.ref_id ? `&b=${encodeURIComponent(n.ref_id)}` : ''}` : '/my-trips');
  if (n.kind?.startsWith('delivery')) return to(isHostMode ? '/provider/dashboard' : '/my-trips');
  if (n.kind === 'place_suggestion_live' && n.ref_id) return to(`/listing/${n.ref_id}`);
  if (n.kind?.startsWith('place_suggestion')) return to('/#my-suggestions');
  if (n.kind?.startsWith('plan_')) return to(n.kind === 'plan_cancelled' || !n.ref_id ? '/feed' : `/plan/${n.ref_id}`);
  return null;
}
