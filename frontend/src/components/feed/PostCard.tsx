import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapPin, PencilSimple, SealCheck, Trash, EyeSlash } from '@phosphor-icons/react';
import type { HostPost } from '@/lib/posts';

/** "3 h ago", "2 d ago", then a date: a feed reads by recency, not by timestamp. */
export function timeAgo(iso: string, lang: string, t: (k: string, o?: any) => string): string {
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return t('feed.just_now');
  if (mins < 60) return t('feed.minutes_ago', { count: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t('feed.hours_ago', { count: hours });
  const days = Math.round(hours / 24);
  if (days < 7) return t('feed.days_ago', { count: days });
  return new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
}

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
}: {
  post: HostPost;
  isMine?: boolean;
  canReport?: boolean;
  onReport?: (post: HostPost) => void;
  onEdit?: (post: HostPost) => void;
  onDelete?: (post: HostPost) => void;
}) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const long = post.body.length > 320;
  const text = long && !expanded ? `${post.body.slice(0, 300).trimEnd()}…` : post.body;
  const photos = post.photos || [];

  return (
    <article data-testid={`post-${post.id}`} className="rounded-3xl border border-[var(--line)] bg-white p-4 md:p-5">
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
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 text-sm font-semibold text-pine">
          {expanded ? t('feed.show_less') : t('feed.read_more')}
        </button>
      )}

      {photos.length > 0 && (
        <div className={`mt-3 grid gap-1.5 rounded-2xl overflow-hidden ${photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {photos.map((src, i) => (
            <a key={src + i} href={src} target="_blank" rel="noopener noreferrer" className="block bg-mist">
              <img src={src} alt={t('feed.photo_alt', { name: post.host.name })} loading="lazy"
                className={`w-full object-cover ${photos.length === 1 ? 'max-h-[420px]' : 'aspect-square h-full'}`} />
            </a>
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
    </article>
  );
}
