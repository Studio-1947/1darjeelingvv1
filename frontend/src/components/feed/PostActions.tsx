import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Heart, ChatCircle, ShareNetwork, X, PaperPlaneRight, Trash, SealCheck, MapPin, Smiley, CircleNotch as Loader2 } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import {
  addComment, applyReaction, deleteComment, fetchComments, postUrl, REACTIONS, setReaction, topReactions,
  type Engagement, type HostPost, type PostComment, type ReactionKind,
} from '@/lib/posts';
import { timeAgo } from '@/lib/timeAgo';

/** Like, comment and share under a post, as on Instagram. Liking and commenting need a sign-in. */
export function PostActionBar({ post, engagement, onEngagement, onComment }: {
  post: HostPost;
  engagement: Engagement;
  onEngagement: (e: Engagement) => void;
  onComment: () => void;
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

  const btn = 'inline-flex items-center gap-1.5 h-9 px-2.5 rounded-full text-sm font-semibold transition-colors hover:bg-mist';
  return (
    <div className="mt-3 flex items-center gap-1 border-t border-[var(--line)] pt-2" data-testid={`post-actions-${post.id}`}>
      <div className="relative inline-flex items-center">
        <button type="button" onClick={toggleLike} disabled={busy} aria-pressed={!!mine}
          aria-label={t('feed.like')} data-testid={`post-like-${post.id}`}
          className={`${btn} ${mine ? 'text-flag' : 'text-ink'}`}>
          {mine && mine !== 'heart' ? <span className="text-lg leading-none">{mineEmoji}</span>
            : <Heart size={20} weight={mine ? 'fill' : 'regular'} />}
          {top.length > 1 && <span className="text-sm leading-none" aria-hidden="true">{top.join('')}</span>}
          <span className="tabular-nums">{engagement.like_count || ''}</span>
        </button>
        <button type="button" onClick={() => (user ? setPicking((v) => !v) : react('heart'))} disabled={busy}
          aria-label={t('feed.react')} aria-expanded={picking} data-testid={`post-react-${post.id}`}
          className="w-8 h-8 rounded-full grid place-items-center text-ink-soft hover:bg-mist">
          <Smiley size={18} />
        </button>
        {picking && (
          <div role="menu" className="absolute bottom-full left-0 mb-1 z-10 flex gap-1 rounded-full bg-white border border-[var(--line)] shadow-lg px-2 py-1"
            data-testid={`post-reactions-${post.id}`}>
            {REACTIONS.map((r) => (
              <button key={r.kind} type="button" role="menuitem" onClick={() => react(mine === r.kind ? null : r.kind)}
                aria-label={t(`feed.reaction_${r.kind}`)} aria-pressed={mine === r.kind}
                data-testid={`post-reaction-${r.kind}-${post.id}`}
                className={`w-9 h-9 rounded-full grid place-items-center text-xl transition-transform hover:scale-125 ${mine === r.kind ? 'bg-mist' : ''}`}>
                {r.emoji}
              </button>
            ))}
          </div>
        )}
      </div>
      <button type="button" onClick={onComment} aria-label={t('feed.comment')} data-testid={`post-comment-${post.id}`}
        className={`${btn} text-ink`}>
        <ChatCircle size={20} />
        <span className="tabular-nums">{engagement.comment_count || ''}</span>
      </button>
      <button type="button" onClick={share} aria-label={t('feed.share')} data-testid={`post-share-${post.id}`}
        className={`${btn} text-ink ml-auto`}>
        <ShareNetwork size={20} /> <span className="hidden sm:inline">{t('feed.share')}</span>
      </button>
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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-2xl h-[92dvh] sm:h-[88vh] bg-white rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-300">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-[var(--line)] flex-shrink-0">
          {post.host.image ? (
            <img src={post.host.image} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-pine text-white grid place-items-center font-bold">{(post.host.name || '?').charAt(0).toUpperCase()}</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Link to={`/business/${post.host.provider_id}`} onClick={onClose} className="font-bold text-ink text-sm truncate hover:underline">{post.host.name}</Link>
              {post.host.verified && <SealCheck size={15} weight="fill" className="text-pine" />}
            </div>
            <div className="text-[11px] text-ink-soft truncate">{post.host.location} · {timeAgo(post.created_at, i18n.language, t)}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} data-testid="post-viewer-close"
            className="w-9 h-9 rounded-full grid place-items-center hover:bg-mist"><X size={20} /></button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
          <p className="text-ink text-[15px] leading-relaxed whitespace-pre-line break-words">{post.body}</p>
          {photos.length > 0 && (
            <div className="mt-3 space-y-2">
              {photos.map((src, i) => (
                <img key={src + i} src={src} alt={t('feed.photo_alt', { name: post.host.name })}
                  className="w-full rounded-2xl object-contain bg-mist max-h-[70vh]" />
              ))}
            </div>
          )}
          {post.listing && (
            <Link to={`/listing/${post.listing.id}`} onClick={onClose}
              className="mt-3 flex items-center gap-3 rounded-2xl border border-[var(--line)] p-2.5 hover:border-pine">
              {post.listing.image ? <img src={post.listing.image} alt="" className="w-12 h-12 rounded-xl object-cover" />
                : <div className="w-12 h-12 rounded-xl bg-mist grid place-items-center text-pine"><MapPin size={18} /></div>}
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-widest font-bold text-ink-soft">{t('feed.about_listing')}</div>
                <div className="font-bold text-ink text-sm truncate">{post.listing.title}</div>
              </div>
            </Link>
          )}

          <PostActionBar post={post} engagement={engagement} onEngagement={onEngagement} onComment={() => inputRef.current?.focus()} />

          <h3 className="mt-4 text-xs font-bold uppercase tracking-widest text-ink-soft">{t('feed.comments')}</h3>
          {comments === null ? (
            <div className="py-6 grid place-items-center text-ink-soft"><Loader2 size={18} className="animate-spin" /></div>
          ) : comments.length === 0 ? (
            <p className="py-4 text-sm text-ink-soft" data-testid="post-no-comments">{t('feed.no_comments')}</p>
          ) : (
            <ul className="mt-2 space-y-3" data-testid="post-comments">
              {comments.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  {c.user.avatar ? <img src={c.user.avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-8 h-8 rounded-full bg-mist text-ink grid place-items-center text-xs font-bold flex-shrink-0">{(c.user.name || '?').charAt(0).toUpperCase()}</div>}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm"><span className="font-bold text-ink">{c.user.name}</span> <span className="text-ink break-words">{c.body}</span></div>
                    <div className="text-[11px] text-ink-soft mt-0.5 flex items-center gap-3">
                      {timeAgo(c.created_at, i18n.language, t)}
                      {c.can_delete && (
                        <button type="button" onClick={() => remove(c)} className="inline-flex items-center gap-1 text-flag font-semibold">
                          <Trash size={11} /> {t('feed.delete')}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form onSubmit={send} className="flex items-center gap-2 px-3 py-2.5 border-t border-[var(--line)] flex-shrink-0"
          style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
          <input ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500}
            placeholder={user ? t('feed.comment_placeholder') : t('feed.comment_sign_in')}
            data-testid="post-comment-input"
            className="flex-1 min-w-0 h-11 px-4 rounded-full bg-mist outline-none text-sm text-ink placeholder:text-ink-soft" />
          <button type="submit" disabled={sending || (!!user && !draft.trim())} aria-label={t('feed.send')} data-testid="post-comment-send"
            className="w-11 h-11 rounded-full bg-pine text-white grid place-items-center disabled:opacity-50">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <PaperPlaneRight size={18} weight="fill" />}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
