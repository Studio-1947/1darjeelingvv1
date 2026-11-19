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
