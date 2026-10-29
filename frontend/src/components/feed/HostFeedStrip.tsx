import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Newspaper, SealCheck } from '@phosphor-icons/react';
import { fetchFeed, HostPost } from '@/lib/posts';
import { timeAgo } from './PostCard';

/**
 * "From our hosts" on the home page: the three newest posts as compact cards, and a way into the
 * full feed. Renders nothing while there are no posts, so a fresh install has no empty section.
 */
export default function HostFeedStrip() {
  const { t, i18n } = useTranslation();
  const [posts, setPosts] = useState<HostPost[]>([]);

  useEffect(() => {
    fetchFeed({ limit: 3 }).then((p) => setPosts(p.posts)).catch(() => setPosts([]));
  }, []);

  if (posts.length === 0) return null;

  return (
    <section data-testid="host-feed-strip" className="mx-auto max-w-6xl px-4 md:px-6 pt-10 md:pt-14">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display font-extrabold text-2xl md:text-3xl text-ink">
          <Newspaper size={20} className="text-pine" /> {t('feed.strip_title')}
        </h2>
        <Link to="/feed" className="inline-flex items-center gap-1 text-sm font-bold text-pine">
          {t('feed.see_all')} <ArrowRight size={14} />
        </Link>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {posts.map((p) => (
          <Link key={p.id} to="/feed" className="block rounded-3xl border border-[var(--line)] bg-white overflow-hidden btn-hover">
            {p.photos[0] && <img src={p.photos[0]} alt="" loading="lazy" className="w-full aspect-[16/10] object-cover" />}
            <div className="p-4">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-ink text-sm truncate">{p.host.name}</span>
                {p.host.verified && <SealCheck size={14} weight="fill" className="text-pine flex-shrink-0" />}
              </div>
              <div className="text-[11px] text-ink-soft">{timeAgo(p.created_at, i18n.language, t)}</div>
              <p className="mt-2 text-sm text-ink line-clamp-3">{p.body}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
