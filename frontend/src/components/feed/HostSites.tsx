import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import type { HostPost } from '@/lib/posts';
import { listingImage, listingImageBackups } from '@/lib/listingContent';
import SmartImg from '@/components/SmartImg';
import { Box } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';

type Host = HostPost['host'] & { backups?: string[] };

const BUSINESS_TYPES = new Set(['homestay', 'driver', 'guide', 'cafe', 'shop']);
const SEED_PROVIDER = 'admin-seed-provider';

/** One entry per live business, from the public listings (the first listing stands for the host). */
export function hostsFromListings(items: any[]): Host[] {
  const seen = new Set<string>();
  const out: Host[] = [];
  for (const it of items || []) {
    const id = it?.provider_id;
    if (!id || id === SEED_PROVIDER || !BUSINESS_TYPES.has(it.type) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      provider_id: id, name: it.title, type: it.type, location: it.location || '',
      image: listingImage(it, 200) || null, backups: listingImageBackups(it, 200), verified: !!it.provider_verified,
    });
  }
  return out;
}

/**
 * "Business websites" (prototype feed): every live business once, linking to its public page.
 * Hosts who posted come first (from the posts already loaded), then the other live businesses
 * from the public listings, so the section is there before anyone has posted.
 */
export default function HostSites({ posts }: { posts: HostPost[] }) {
  const { t } = useTranslation();
  const [listed, setListed] = useState<Host[]>([]);
  useEffect(() => {
    let live = true;
    api.get('/listings', { params: { limit: 50 } })
      .then(({ data }) => { if (live) setListed(hostsFromListings(data?.items || [])); })
      .catch(() => { /* the posters alone still show */ });
    return () => { live = false; };
  }, []);

  const seen = new Set<string>();
  const fromPosts: Host[] = posts.filter((p) => !p.hidden && p.host.provider_id && !seen.has(p.host.provider_id) && seen.add(p.host.provider_id)).map((p) => p.host);
  const hosts = fromPosts.concat(listed.filter((h) => !seen.has(h.provider_id)));
  if (hosts.length === 0) return null;
  return (
    <Box data-testid="feed-sites" aria-labelledby="feed-sites-h" as="section">
      <p className="ag-eyebrow m-0">{t('feed.label')}</p>
      <h2 id="feed-sites-h" className="ag-feed-boxh">{t('feed.sites_title', 'Business websites')}</h2>
      <p className="ag-small m-0">{t('feed.sites_sub', 'Pages made by hosts, drivers, guides and cafes. Tap to open, share with friends.')}</p>
      <div className="ag-feed-sites">
        {hosts.map((h) => (
          <Link key={h.provider_id} to={`/business/${h.provider_id}`} className="ag-feed-site" data-testid={`feed-site-${h.provider_id}`}>
            {h.image ? <SmartImg src={h.image} fallback={h.backups} alt="" className="ag-feed-siteimg" />
              : <span className="ag-feed-siteimg" aria-hidden="true">{(h.name || '?').trim().charAt(0).toUpperCase()}</span>}
            <span className="min-w-0 flex-1">
              <b className="block truncate">{h.name}</b>
              <span className="ag-small block truncate">{t(`feed.type_${h.type}`, h.type)}{h.location ? ` · ${h.location}` : ''}</span>
            </span>
            <span className="ag-feed-sitego" aria-hidden="true"><Icon name="arrowne" /></span>
          </Link>
        ))}
      </div>
    </Box>
  );
}
