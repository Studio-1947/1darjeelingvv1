import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SealCheck } from '@phosphor-icons/react';
import { SecHead, SeeAll } from '@/components/ag';
import { fetchFeed, HostPost } from '@/lib/posts';
import { timeAgo } from './PostCard';

/**
 * "From our hosts" on the home page: the newest posts as cards, and a way into the full feed.
 * Renders nothing while there are no posts, so a fresh install has no empty section.
 */
export default function HostFeedStrip() {
  const { t, i18n } = useTranslation();
  const [posts, setPosts] = useState<HostPost[]>([]);

  useEffect(() => {
    fetchFeed({ limit: 4 }).then((p) => setPosts(p.posts)).catch(() => setPosts([]));
  }, []);

  if (posts.length === 0) return null;

  return (
    <section data-testid="host-feed-strip" aria-labelledby="home-feed-h">
      <SecHead id="home-feed-h" eyebrow={t('feed.strip_title')} title={t('nav.feed')}
        action={<SeeAll to="/feed">{t('feed.see_all')}</SeeAll>} />
      <div className="grid grid-cols-2 gap-2.5">
        {posts.map((p) => (
          <Link key={p.id} to={`/feed?post=${encodeURIComponent(p.id)}`} className="ag-card flex flex-col no-underline">
            {p.photos[0] && <img src={p.photos[0]} alt="" loading="lazy" className="img" />}
            <span className="body">
              <span className="flex min-w-0 items-center gap-1">
                <span className="name truncate">{p.host.name}</span>
                {p.host.verified && <SealCheck size={16} weight="fill" className="flex-none text-[var(--r)]" aria-label={t('kyc.verified')} />}
              </span>
              <span className="meta">{timeAgo(p.created_at, i18n.language, t)}</span>
              <span className="line-clamp-3 text-sm text-[var(--ink7)]">{p.body}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
