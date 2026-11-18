import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, PaperPlaneRight, Trash, SealCheck, MapPin, ArrowUpRight, CircleNotch as Loader2 } from '@phosphor-icons/react';
import { Icon } from '@/components/ag/Icon';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import {
  addComment, applyReaction, deleteComment, fetchComments, postUrl, REACTIONS, setReaction, topReactions,
  type Engagement, type HostPost, type PostComment, type ReactionKind,
} from '@/lib/posts';
import { timeAgo } from '@/lib/timeAgo';
import { Button, IconButton } from '@/components/ag';

/** A line-art smiley in the prototype's icon style (its set has none): opens the reaction picker. */
const SMILEY = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5s1.3 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01';

/** Like (four reactions), comment, share and report under a post, as the prototype's red text buttons. Liking and commenting need a sign-in. */
export function PostActionBar({ post, engagement, onEngagement, onComment, onReport }: {
  post: HostPost;
  engagement: Engagement;
  onEngagement: (e: Engagement) => void;
  onComment: () => void;
  /** Readers who may report the post get a Report chip at the end of the row. */
  onReport?: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const mine = engagement.my_reaction ?? (engagement.liked_by_me ? 'heart' : null);

  // Board: more than one reaction. Picking one replaces yours; picking yours again takes it back.
  const react = async (kind: ReactionKind | null) => {
    if (!user) { nav(`/login?next=${encodeURIComponent(`/feed?post=${post.id}`)}`); return; }
    setPicking(false);
    // Show it straight away; the server's count replaces it a moment later.
    onEngagement(applyReaction(engagement, kind));
    setBusy(true);
    try {
      onEngagement(await setReaction(post.id, kind));
    } catch {
      onEngagement(engagement);
      toast.error(t('feed.like_failed'));
    } finally {
      setBusy(false);
    }
  };
  const toggleLike = () => react(mine ? null : 'heart');
  const mineEmoji = REACTIONS.find((r) => r.kind === mine)?.emoji;
  const top = topReactions(engagement);

  const share = async () => {
    const url = postUrl(post.id);
    const text = `${post.host.name}: ${post.body.slice(0, 120)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: post.host.name, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success(t('feed.link_copied'));
    } catch {
      /* the share sheet was closed */
    }
  };

  const likes = engagement.like_count;
  return (
    <div className="ag-feed-pact" data-testid={`post-actions-${post.id}`}>
      <button type="button" className={`ag-btn text${mine ? ' on' : ''}`} onClick={toggleLike} disabled={busy}
        aria-pressed={!!mine} aria-label={t('feed.like')} data-testid={`post-like-${post.id}`}>
        {mine && mine !== 'heart' ? <span className="text-base leading-none" aria-hidden="true">{mineEmoji}</span> : <Icon name="heart" />}
        <span>
          {t('feed.like')}
          {top.length > 1 && <span className="ml-1" aria-hidden="true">{top.join('')}</span>}
          {likes > 0 && <span className="tabular-nums"> · {likes}</span>}
        </span>
      </button>
      <button type="button" className="ag-btn text icon" onClick={() => (user ? setPicking((v) => !v) : react('heart'))} disabled={busy}
        aria-label={t('feed.react')} title={t('feed.react')} aria-expanded={picking} data-testid={`post-react-${post.id}`}>
        <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d={SMILEY} /></svg>
      </button>
      {picking && (
        <div role="menu" data-testid={`post-reactions-${post.id}`}
          className="absolute bottom-full left-0 mb-2 z-10 flex gap-1 rounded-full bg-[var(--surface)] border border-[var(--warmline)] shadow-[var(--shadow-lg)] p-1">
          {REACTIONS.map((r) => (
            <button key={r.kind} type="button" role="menuitem" onClick={() => react(mine === r.kind ? null : r.kind)}
              aria-label={t(`feed.reaction_${r.kind}`)} aria-pressed={mine === r.kind}
              data-testid={`post-reaction-${r.kind}-${post.id}`}
              className={`w-11 h-11 rounded-full grid place-items-center text-xl transition-transform hover:scale-125 ${mine === r.kind ? 'bg-[var(--r-tint)]' : ''}`}>
              {r.emoji}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="ag-btn text" onClick={onComment} aria-label={t('feed.comment')} data-testid={`post-comment-${post.id}`}>
        <Icon name="news" />
        <span>{t('feed.comment')}{engagement.comment_count > 0 && <span className="tabular-nums"> · {engagement.comment_count}</span>}</span>
      </button>
      <button type="button" className="ag-btn text icon" onClick={share} aria-label={t('feed.share')} title={t('feed.share')} data-testid={`post-share-${post.id}`}>
        <Icon name="share" />
      </button>
      {onReport && (
        <button type="button" className="ag-btn text icon" title={t('report.review_link')} onClick={onReport} aria-label={t('report.review_link')} data-testid={`post-report-${post.id}`}>
          <Icon name="flag" />
        </button>
      )}
    </div>
  );
}

/**
 * The whole post opened up: host, full text, every photo at full width, the listing, likes and the
 * comments with a box to add one. Opened by tapping a post anywhere, not only its photo.
 */
export function PostViewer({ post, engagement, onEngagement, onClose, focusComment = false }: {
  post: HostPost;
  engagement: Engagement;
  onEngagement: (e: Engagement) => void;
  onClose: () => void;
  focusComment?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const [comments, setComments] = useState<PostComment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    fetchComments(post.id).then((c) => { if (live) setComments(c); }).catch(() => { if (live) setComments([]); });
    return () => { live = false; };
  }, [post.id]);

  useEffect(() => {
    if (focusComment) setTimeout(() => inputRef.current?.focus(), 150);
  }, [focusComment]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { nav(`/login?next=${encodeURIComponent(`/feed?post=${post.id}`)}`); return; }
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const c = await addComment(post.id, body);
      setComments((list) => [...(list || []), c]);
      setDraft('');
      onEngagement({ ...engagement, comment_count: engagement.comment_count + 1 });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || t('feed.comment_failed'));
    } finally {
      setSending(false);
    }
  };

  const remove = async (c: PostComment) => {
    try {
      await deleteComment(post.id, c.id);
      setComments((list) => (list || []).filter((x) => x.id !== c.id));
      onEngagement({ ...engagement, comment_count: Math.max(0, engagement.comment_count - 1) });
    } catch {
      toast.error(t('feed.comment_failed'));
    }
  };

  const photos = post.photos || [];
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true"
      aria-label={post.host.name} data-testid="post-viewer">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-[640px] h-[92dvh] sm:h-[88vh] bg-[var(--page)] rounded-t-[22px] sm:rounded-[22px] flex flex-col overflow-hidden shadow-[var(--shadow-lg)] animate-in slide-in-from-bottom duration-300">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-[var(--warmline)] flex-shrink-0">
          <HostAvatar post={post} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Link to={`/business/${post.host.provider_id}`} onClick={onClose} className="font-medium text-[var(--ink-strong)] truncate hover:underline">{post.host.name}</Link>
              {post.host.verified && <SealCheck size={16} weight="fill" className="text-[var(--r)] flex-none" aria-label={t('feed.verified_host')} />}
            </div>
            <div className="ag-small truncate">{post.host.location} · {timeAgo(post.created_at, i18n.language, t)}</div>
          </div>
          <IconButton label={t('common.close')} onClick={onClose} data-testid="post-viewer-close"><X /></IconButton>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 flex flex-col gap-3">
          <p className="m-0 text-base leading-relaxed text-[var(--ink7)] whitespace-pre-line break-words">{post.body}</p>
          {photos.map((src, i) => (
            <img key={src + i} src={src} alt={t('feed.photo_alt', { name: post.host.name })}
              className="w-full rounded-[22px] object-contain bg-[var(--creme2)] max-h-[70vh]" />
          ))}
          {post.listing && <ListingLink post={post} onClick={onClose} />}

          <PostActionBar post={post} engagement={engagement} onEngagement={onEngagement} onComment={() => inputRef.current?.focus()} />

          <h3 className="ag-eyebrow mt-2">{t('feed.comments')}</h3>
          {comments === null ? (
            <div className="py-6 grid place-items-center text-[var(--ink-muted)]"><Loader2 size={18} className="animate-spin" /></div>
          ) : comments.length === 0 ? (
            <p className="ag-small m-0" data-testid="post-no-comments">{t('feed.no_comments')}</p>
          ) : (
            <ul className="flex flex-col gap-3" data-testid="post-comments">
              {comments.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  {c.user.avatar ? <img src={c.user.avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-none" />
                    : <span className="w-8 h-8 rounded-full bg-[var(--r-tint)] text-[var(--r)] grid place-items-center text-xs font-medium flex-none">{(c.user.name || '?').charAt(0).toUpperCase()}</span>}
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-sm text-[var(--ink7)] break-words"><b className="font-medium text-[var(--ink-strong)]">{c.user.name}</b> {c.body}</p>
                    <div className="ag-small !text-xs mt-0.5 flex items-center gap-3">
                      {timeAgo(c.created_at, i18n.language, t)}
                      {c.can_delete && (
                        <Button variant="text" onClick={() => remove(c)} icon={<Trash />} className="!text-[var(--fail)] !text-xs [&>svg]:!text-[var(--fail)]">
                          {t('feed.delete')}
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={send} className="flex items-center gap-2 px-3 pt-2.5 border-t border-[var(--warmline)] flex-shrink-0"
          style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
          <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500}
            placeholder={user ? t('feed.comment_placeholder') : t('feed.comment_sign_in')}
            aria-label={t('feed.comment')} data-testid="post-comment-input"
            className="ag-in flex-1 min-w-0 !h-12" />
          <IconButton type="submit" tint label={t('feed.send')} disabled={sending || (!!user && !draft.trim())} data-testid="post-comment-send">
            {sending ? <Loader2 className="animate-spin" /> : <PaperPlaneRight weight="fill" />}
          </IconButton>
        </form>
      </div>
    </div>,
    document.body,
  );
}

/** The host's photo, or the first letter of the business on a red tint. */
export function HostAvatar({ post }: { post: HostPost }) {
  return post.host.image ? (
    <img src={post.host.image} alt="" className="w-10 h-10 rounded-full object-cover flex-none" />
  ) : (
    <span className="w-10 h-10 rounded-full bg-[var(--r-tint)] text-[var(--r)] grid place-items-center font-medium text-base flex-none" aria-hidden="true">
      {(post.host.name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** The listing a post is about, as a small row with its photo. */
export function ListingLink({ post, onClick, testId }: { post: HostPost; onClick?: () => void; testId?: string }) {
  const { t } = useTranslation();
  if (!post.listing) return null;
  return (
    <Link to={`/listing/${post.listing.id}`} onClick={onClick} data-testid={testId}
      className="flex items-center gap-3 rounded-[18px] border border-[var(--warmline)] bg-[var(--surface)] p-2.5 hover:border-[var(--r)] transition-colors">
      {post.listing.image ? <img src={post.listing.image} alt="" className="w-12 h-12 rounded-xl object-cover flex-none" />
        : <span className="w-12 h-12 rounded-xl bg-[var(--r-tint)] grid place-items-center text-[var(--r)] flex-none"><MapPin size={20} /></span>}
      <span className="min-w-0 flex-1">
        <span className="ag-eyebrow block">{t('feed.about_listing')}</span>
        <span className="block font-medium text-[var(--ink-strong)] truncate">{post.listing.title}</span>
      </span>
      <ArrowUpRight size={18} className="text-[var(--r)] flex-none" aria-hidden="true" />
    </Link>
  );
}
