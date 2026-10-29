import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleNotch as Loader2, Newspaper } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import PostCard from '@/components/feed/PostCard';
import PostComposer from '@/components/feed/PostComposer';
import ReportDialog, { ReportTarget } from '@/components/listing-detail/ReportDialog';
import { CanPostReason, deletePost, fetchFeed, fetchMyPosts, HostPost } from '@/lib/posts';

/**
 * The host feed: what hosts say about their own places, newest first, readable by anyone. A host
 * who can post sees the composer at the top and their own posts (including any an admin hid)
 * with Edit and Delete.
 */
export default function Feed() {
  const { t } = useTranslation();
  const { user } = useAuth();
  useSeo({ title: t('feed.title'), description: t('feed.subtitle') });

  const [posts, setPosts] = useState<HostPost[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const [canPost, setCanPost] = useState(false);
  const [reason, setReason] = useState<CanPostReason>(null);
  const [mine, setMine] = useState<HostPost[]>([]);
  const [editing, setEditing] = useState<HostPost | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const page = await fetchFeed({ limit: 20 });
      setPosts(page.posts);
      setNextBefore(page.nextBefore);
    } catch {
      setError(t('feed.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadMine = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetchMyPosts();
      setCanPost(res.canPost);
      setReason(res.reason);
      setMine(res.posts);
    } catch {
      setCanPost(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMine(); }, [loadMine]);

  const more = async () => {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchFeed({ before: nextBefore, limit: 20 });
      setPosts((p) => [...p, ...page.posts]);
      setNextBefore(page.nextBefore);
    } catch {
      toast.error(t('feed.load_failed'));
    } finally {
      setLoadingMore(false);
    }
  };

  const onSaved = () => {
    setEditing(null);
    load();
    loadMine();
  };

  const remove = async (post: HostPost) => {
    if (!window.confirm(t('feed.delete_confirm'))) return;
    try {
      await deletePost(post.id);
      toast.success(t('feed.deleted'));
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || t('feed.post_failed'));
    }
  };

  // My own posts that the public feed does not show (hidden by an admin), so I can see why.
  const myHidden = mine.filter((p) => p.hidden);
  const isMine = (p: HostPost) => !!user && p.author_user_id === user.id;

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6 py-6 md:py-10">
      <div className="mb-6">
        <div className="text-[11px] font-bold uppercase tracking-widest text-flag flex items-center gap-1.5">
          <Newspaper size={14} /> {t('feed.label')}
        </div>
        <h1 className="mt-2 font-display font-extrabold text-3xl md:text-4xl text-ink leading-tight">{t('feed.title')}</h1>
        <p className="mt-2 text-ink-soft">{t('feed.subtitle')}</p>
      </div>

      {user && canPost && (
        <div className="mb-6">
          <PostComposer editing={editing} onSaved={onSaved} onCancelEdit={() => setEditing(null)} />
        </div>
      )}
      {user && !canPost && (reason === 'not_verified' || reason === 'plan_not_live') && (
        <div className="mb-6 rounded-2xl bg-mist p-4 text-sm text-ink">
          {reason === 'not_verified' ? t('feed.cannot_post_unverified') : t('feed.cannot_post_plan')}{' '}
          <Link to="/provider/dashboard" className="font-bold text-pine underline">{t('nav.business_dashboard')}</Link>
        </div>
      )}

      {myHidden.length > 0 && (
        <div className="mb-6 space-y-3">
          {myHidden.map((p) => (
            <PostCard key={p.id} post={p} isMine onEdit={setEditing} onDelete={remove} />
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-ink-soft"><Loader2 size={24} className="animate-spin" /></div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-flag font-semibold">{error}</p>
          <button type="button" onClick={load} className="mt-3 px-5 py-2 rounded-full border border-[var(--line)] font-bold text-ink">
            {t('feed.retry')}
          </button>
        </div>
      ) : posts.length === 0 ? (
        <div data-testid="feed-empty" className="text-center py-16 text-ink-soft">{t('feed.empty')}</div>
      ) : (
        <div className="space-y-4" data-testid="feed-list">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              isMine={isMine(p)}
              canReport={!!user && !isMine(p)}
              onEdit={(post) => { setEditing(post); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              onDelete={remove}
              onReport={(post) => setReportTarget({ type: 'post', id: post.id, authorId: post.author_user_id, authorName: post.host.name })}
            />
          ))}
          {nextBefore && (
            <div className="flex justify-center pt-2">
              <button type="button" onClick={more} disabled={loadingMore} data-testid="feed-more"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-[var(--line)] font-bold text-ink hover:border-pine disabled:opacity-50">
                {loadingMore && <Loader2 size={15} className="animate-spin" />}
                {t('feed.load_more')}
              </button>
            </div>
          )}
        </div>
      )}

      {!user && (
        <p className="mt-8 text-center text-sm text-ink-soft">
          {t('feed.host_cta')}{' '}
          <Link to="/provider/onboard" className="font-bold text-pine underline">{t('nav.host_with_us', 'List your Stay / Taxi')}</Link>
        </p>
      )}

      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onBlocked={load} />
    </div>
  );
}
