import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { HostPost } from '@/lib/posts';
import { Box } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';

/**
 * "Business websites": each host in the feed, once, linking to their public business page. Built
 * from the posts already loaded (there is no endpoint that lists every business), so it only shows
 * hosts who have posted; renders nothing when there are none.
 */
export default function HostSites({ posts }: { posts: HostPost[] }) {
  const { t } = useTranslation();
  const seen = new Set<string>();
  const hosts = posts.filter((p) => !p.hidden && p.host.provider_id && !seen.has(p.host.provider_id) && seen.add(p.host.provider_id)).map((p) => p.host);
  if (hosts.length === 0) return null;
  return (
    <Box data-testid="feed-sites" aria-labelledby="feed-sites-h" as="section">
      <p className="ag-eyebrow m-0">{t('feed.label')}</p>
      <h2 id="feed-sites-h" className="ag-feed-boxh">{t('feed.sites_title', 'Business websites')}</h2>
      <p className="ag-small m-0">{t('feed.sites_sub', 'Pages made by hosts, drivers, guides and cafes. Tap to open, share with friends.')}</p>
      <div className="ag-feed-sites">
        {hosts.map((h) => (
          <Link key={h.provider_id} to={`/business/${h.provider_id}`} className="ag-feed-site" data-testid={`feed-site-${h.provider_id}`}>
            {h.image ? <img src={h.image} alt="" loading="lazy" className="ag-feed-siteimg" />
              : <span className="ag-feed-siteimg" aria-hidden="true">{(h.name || '?').trim().charAt(0).toUpperCase()}</span>}
            <span className="min-w-0 flex-1">
              <b className="block truncate">{h.name}</b>
              <span className="ag-small block truncate">{t(`feed.type_${h.type}`, h.type)} · {h.location}</span>
            </span>
            <span className="ag-feed-sitego" aria-hidden="true"><Icon name="arrowne" /></span>
          </Link>
        ))}
      </div>
    </Box>
  );
}
