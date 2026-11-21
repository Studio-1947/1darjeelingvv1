import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PencilSimple, SealCheck, Trash, EyeSlash } from '@phosphor-icons/react';
import type { Engagement, HostPost } from '@/lib/posts';
import { HostAvatar, ListingLink, PostActionBar, PostViewer } from '@/components/feed/PostActions';
import { Box, Button, IconButton, Status } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';

import { timeAgo } from '@/lib/timeAgo';

export { timeAgo };

/**
 * One post: who wrote it (the host's business, with a verified badge), its kind as a tag (update,
 * offer, event, photo: prototype feed.js), when, the words, up to four
 * photos, the listing it is about, then the reaction chips. Readers get Report; the author gets
 * Edit and Delete.
 */
export default function PostCard({
  post,
  isMine,
  ownBusiness,
  canReport,
  onReport,
  onEdit,
  onDelete,
  autoOpen = false,
}: {
  post: HostPost;
  isMine?: boolean;
  /** The viewer's own business post, seen from the traveller side: tagged, not editable here. */
  ownBusiness?: boolean;
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
    <Box as="article" data-testid={`post-${post.id}`} onClick={openFromCard} className="ag-feed-post cursor-pointer">
      {post.hidden && (
        <Status tone="no" className="self-start">
          <EyeSlash size={14} /> {t('feed.hidden_notice')}{post.hidden_reason ? `: ${post.hidden_reason}` : ''}
        </Status>
      )}

      <header className="flex items-center gap-2">
        <Link to={`/business/${post.host.provider_id}`} className="ag-feed-phead" data-testid={`post-host-${post.id}`}>
          <HostAvatar post={post} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <b className="truncate">{post.host.name}</b>
              {post.host.verified && (
                <SealCheck size={16} weight="fill" className="text-[var(--r)] flex-none" aria-label={t('feed.verified_host')} />
              )}
            </span>
            <span className="ag-small block truncate">
              {post.kind && <span className="ag-feed-kind" data-testid={`post-kind-${post.id}`}>{t(`feed.kind_${post.kind}`, post.kind.charAt(0).toUpperCase() + post.kind.slice(1))}</span>}
              {t(`feed.type_${post.host.type}`, post.host.type)} · {post.host.location} · {timeAgo(post.created_at, i18n.language, t)}
            </span>
          </span>
          {!isMine && !ownBusiness && <Icon name="arrowne" className="ag-feed-pgo" />}
        </Link>
        {isMine ? (
          <div className="flex items-center gap-1.5 flex-none">
            <IconButton small label={t('feed.edit')} onClick={() => onEdit?.(post)} data-testid={`post-edit-${post.id}`}>
              <PencilSimple />
            </IconButton>
            <IconButton small on label={t('feed.delete')} onClick={() => onDelete?.(post)} data-testid={`post-delete-${post.id}`}>
              <Trash />
            </IconButton>
          </div>
        ) : ownBusiness ? (
          <Status tone="info" className="flex-none" data-testid={`post-own-${post.id}`}>{t('feed.your_business')}</Status>
        ) : null}
      </header>

      <p className="ag-feed-ptext">{text}</p>
      {long && (
        <Button variant="text" className="self-start" onClick={() => setOpen('post')}>{t('feed.read_more')}</Button>
      )}

      {photos.length > 0 && (
        <div className={`grid gap-1.5 rounded-xl overflow-hidden ${photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {photos.map((src, i) => (
            <img key={src + i} src={src} alt={t('feed.photo_alt', { name: post.host.name })} loading="lazy"
              className={`block w-full object-cover bg-[var(--creme2)] ${photos.length === 1 ? 'aspect-video max-h-[420px]' : 'aspect-square'}`} />
          ))}
        </div>
      )}

      <ListingLink post={post} testId={`post-listing-${post.id}`} />

      {!post.hidden && (
        <PostActionBar post={post} engagement={engagement} onEngagement={setEngagement} onComment={() => setOpen('comment')}
          onReport={canReport && !isMine ? () => onReport?.(post) : undefined} />
      )}
      {open && (
        <PostViewer post={post} engagement={engagement} onEngagement={setEngagement}
          focusComment={open === 'comment'} onClose={() => setOpen(false)} />
      )}
    </Box>
  );
}
