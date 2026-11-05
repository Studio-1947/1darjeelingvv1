import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, PencilSimple, SealCheck, Trash, EyeSlash } from '@phosphor-icons/react';
import type { Engagement, HostPost } from '@/lib/posts';
import { PostActionBar, PostViewer } from '@/components/feed/PostActions';

import { timeAgo } from '@/lib/timeAgo';

export { timeAgo };

/**
 * One post: who wrote it (the host's business, with a verified badge), when, the words, up to four
 * photos, and the listing it is about. Readers get Report; the author gets Edit and Delete.
 */
export default function PostCard({
  post,
  isMine,
  canReport,
  onReport,
  onEdit,
  onDelete,
  autoOpen = false,
}: {
  post: HostPost;
  isMine?: boolean;
  canReport?: boolean;
  onReport?: (post: HostPost) => void;
  onEdit?: (post: HostPost) => void;
  onDelete?: (post: HostPost) => void;
  /** Open the full post straight away (a shared /feed?post= link). */
  autoOpen?: boolean;
}) {
  const { t, i18n } = useTranslation();
    const long = post.body.length > 320;
  const text = long ? `${post.body.slice(0, 300).trimEnd()}…` : post.body;
  const photos = post.photos || [];
  const [engagement, setEngagement] = useState<Engagement>({
    like_count: post.like_count ?? 0,
    comment_count: post.comment_count ?? 0,
    liked_by_me: !!post.liked_by_me,
    reactions: post.reactions,
    my_reaction: post.my_reaction ?? null,
  });
  const [open, setOpen] = useState<false | 'post' | 'comment'>(autoOpen ? 'post' : false);
  // Tapping the post (not a button or link inside it) opens the whole post.
  const openFromCard = (e: React.MouseEvent) => {
    // Clicks inside the open post (a portal) still bubble here through React; ignore them.
    if (!e.currentTarget.contains(e.target as Node)) return;
    if ((e.target as HTMLElement).closest('a,button')) return;
    setOpen('post');
  };

  return (
    <article data-testid={`post-${post.id}`} onClick={openFromCard} className="rounded-3xl border border-[var(--line)] bg-white p-4 md:p-5 cursor-pointer">
      {post.hidden && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-flag/10 text-flag text-xs font-semibold px-3 py-2">
          <EyeSlash size={14} /> {t('feed.hidden_notice')}
          {post.hidden_reason ? `: ${post.hidden_reason}` : ''}
        </div>
      )}

      <header className="flex items-center gap-3">
        {post.host.image ? (
          <img src={post.host.image} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-bold flex-shrink-0">
            {(post.host.name || '?').trim().charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-ink text-sm truncate">{post.host.name}</span>
            {post.host.verified && (
              <SealCheck size={15} weight="fill" className="text-pine flex-shrink-0" aria-label={t('feed.verified_host')} />
            )}
          </div>
          <div className="text-[11px] text-ink-soft truncate">
            {t(`feed.type_${post.host.type}`, post.host.type)} · {post.host.location} · {timeAgo(post.created_at, i18n.language, t)}
          </div>
        </div>
        {isMine ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button type="button" onClick={() => onEdit?.(post)} aria-label={t('feed.edit')} data-testid={`post-edit-${post.id}`}
              className="w-9 h-9 rounded-full grid place-items-center text-ink-soft hover:bg-mist">
              <PencilSimple size={16} />
            </button>
            <button type="button" onClick={() => onDelete?.(post)} aria-label={t('feed.delete')} data-testid={`post-delete-${post.id}`}
              className="w-9 h-9 rounded-full grid place-items-center text-flag hover:bg-flag/10">
              <Trash size={16} />
            </button>
          </div>
        ) : canReport ? (
          <button type="button" onClick={() => onReport?.(post)} data-testid={`post-report-${post.id}`}
            className="text-xs font-semibold text-ink-soft hover:text-flag flex-shrink-0">
            {t('report.review_link')}
          </button>
        ) : null}
      </header>

      <p className="mt-3 text-ink text-[15px] leading-relaxed whitespace-pre-line break-words">{text}</p>
      {long && (
        <button type="button" onClick={() => setOpen('post')} className="mt-1 text-sm font-semibold text-pine">
          {t('feed.read_more')}
        </button>
      )}

      {photos.length > 0 && (
        <div className={`mt-3 grid gap-1.5 rounded-2xl overflow-hidden ${photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {photos.map((src, i) => (
            <div key={src + i} className="block bg-mist">
              <img src={src} alt={t('feed.photo_alt', { name: post.host.name })} loading="lazy"
                className={`w-full object-cover ${photos.length === 1 ? 'max-h-[420px]' : 'aspect-square h-full'}`} />
            </div>
          ))}
        </div>
      )}

      {post.listing && (
        <Link to={`/listing/${post.listing.id}`} data-testid={`post-listing-${post.id}`}
          className="mt-3 flex items-center gap-3 rounded-2xl border border-[var(--line)] p-2.5 hover:border-pine transition-colors">
          {post.listing.image ? (
            <img src={post.listing.image} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-mist grid place-items-center text-pine flex-shrink-0"><MapPin size={18} /></div>
          )}
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest font-bold text-ink-soft">{t('feed.about_listing')}</div>
            <div className="font-bold text-ink text-sm truncate">{post.listing.title}</div>
          </div>
        </Link>
      )}
      {!post.hidden && (
        <PostActionBar post={post} engagement={engagement} onEngagement={setEngagement} onComment={() => setOpen('comment')} />
      )}
      {open && (
        <PostViewer post={post} engagement={engagement} onEngagement={setEngagement}
          focusComment={open === 'comment'} onClose={() => setOpen(false)} />
      )}
    </article>
  );
}
