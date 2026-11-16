import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleNotch as Loader2, Newspaper, SquaresFour, CloudSun } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import PostCard from '@/components/feed/PostCard';
import PostComposer from '@/components/feed/PostComposer';
import ReportDialog, { ReportTarget } from '@/components/listing-detail/ReportDialog';
import { CanPostReason, deletePost, fetchFeed, fetchMyPosts, HostPost } from '@/lib/posts';
import api from '@/lib/api';
import { HillWeather } from '@/components/WeatherForecast';
import { Box, Button, ButtonLink, Chip, Chips, FieldError, PageHead, SecHead } from '@/components/ag';

/** What "Show me" can narrow the feed to: the kinds the app has data for. */
type Show = 'all' | 'weather' | 'posts';
const SHOW: Array<{ k: Show; label: string; fallback: string; icon: React.ReactNode }> = [
  { k: 'all', label: 'feed.kind_all', fallback: 'Everything', icon: <SquaresFour /> },
  { k: 'weather', label: 'feed.kind_weather', fallback: 'Weather', icon: <CloudSun /> },
  { k: 'posts', label: 'feed.kind_posts', fallback: 'Host posts', icon: <Newspaper /> },
];
const SHOW_KEY = 'aangan-feed-show';
function savedShow(): Show {
  try {
    const v = localStorage.getItem(SHOW_KEY);
    return v === 'weather' || v === 'posts' ? v : 'all';
  } catch {
    return 'all';
  }
}

/**
 * The host feed: the hill weather and what hosts say about their own places, newest first,
 * readable by anyone. "Show me" narrows it to one kind. A host who can post sees the composer at
 * the top and their own posts (including any an admin hid) with Edit and Delete.
 */
export default function Feed() {
  const { t } = useTranslation();
  const { user, audience } = useAuth();
  // Posting and editing are business-side actions. A host browsing as a traveller sees the feed as
  // travellers do; their own posts are tagged so it is clear whose they are.
  const business = audience.side === 'business';
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
  // A shared link (/feed?post=<id>) opens that post on arrival.
  const [sp] = useSearchParams();
  const sharedPostId = sp.get('post');
  // A shared post always shows, whatever the reader last picked.
  const [show, setShow] = useState<Show>(() => (sharedPostId ? 'all' : savedShow()));
  const pick = (k: Show) => {
    setShow(k);
    try { localStorage.setItem(SHOW_KEY, k); } catch { /* private window: just this visit */ }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const page = await fetchFeed({ limit: 20 });
      let list = page.posts;
      // An older shared post is not on the first page: fetch it and put it on top.
      if (sharedPostId && !list.some((p) => p.id === sharedPostId)) {
        try {
          const { data } = await api.get(`/posts/${encodeURIComponent(sharedPostId)}`);
          if (data?.post) list = [data.post, ...list];
        } catch { /* gone or hidden: show the feed as usual */ }
      }
      setPosts(list);
      setNextBefore(page.nextBefore);
    } catch {
      setError(t('feed.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [t, sharedPostId]);

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
  const myHidden = business ? mine.filter((p) => p.hidden) : [];
  const isMine = (p: HostPost) => !!user && p.author_user_id === user.id;
  const showWeather = show !== 'posts';
  const showPosts = show !== 'weather';

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        <PageHead eyebrow={t('feed.label')} title={t('feed.title')} sub={t('feed.subtitle')} />

        {user && business && canPost && (
          <PostComposer editing={editing} onSaved={onSaved} onCancelEdit={() => setEditing(null)} />
        )}
        {user && business && !canPost && (reason === 'not_verified' || reason === 'plan_not_live') && (
          <Box>
            <p className="ag-small m-0 !text-[var(--ink7)]">
              {reason === 'not_verified' ? t('feed.cannot_post_unverified') : t('feed.cannot_post_plan')}
            </p>
            <ButtonLink to="/provider/dashboard" go size="sm" className="self-start">{t('nav.business_dashboard')}</ButtonLink>
          </Box>
        )}

        <div className="flex flex-col gap-2">
          <span className="ag-eyebrow" id="feed-show-me">{t('feed.show_me', 'Show me')}</span>
          <Chips scroll role="group" aria-labelledby="feed-show-me">
            {SHOW.map((s) => (
              <Chip key={s.k} on={show === s.k} onClick={() => pick(s.k)} data-testid={`feed-show-${s.k}`}>
                {s.icon} {t(s.label, s.fallback)}
              </Chip>
            ))}
          </Chips>
        </div>

        {showWeather && <HillWeather />}

        {showPosts && (
          <section className="flex flex-col gap-3" aria-labelledby="feed-posts-h">
            {showWeather && <SecHead id="feed-posts-h" title={t('feed.kind_posts', 'Host posts')} className="!mb-0" />}
            {!showWeather && <h2 id="feed-posts-h" className="sr-only">{t('feed.kind_posts', 'Host posts')}</h2>}

            {myHidden.map((p) => (
              <PostCard key={p.id} post={p} isMine onEdit={setEditing} onDelete={remove} />
            ))}

            {loading ? (
              <div className="flex justify-center py-16 text-[var(--ink-muted)]"><Loader2 size={24} className="animate-spin" /></div>
            ) : error ? (
              <Box>
                <FieldError>{error}</FieldError>
                <Button size="sm" className="self-start" onClick={load}>{t('feed.retry')}</Button>
              </Box>
            ) : posts.length === 0 ? (
              <Box data-testid="feed-empty" className="items-start">
                <Newspaper size={24} className="text-[var(--r)]" aria-hidden="true" />
                <p className="m-0 text-[var(--ink7)]">{t('feed.empty')}</p>
                {!business && (
                  <ButtonLink to="/provider/onboard" go size="sm">{t('feed.list_cta', 'Add my homestay, car or shop')}</ButtonLink>
                )}
              </Box>
            ) : (
              <div className="flex flex-col gap-3" data-testid="feed-list">
                {posts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    isMine={business && isMine(p)}
                    ownBusiness={!business && isMine(p)}
                    canReport={!!user && !isMine(p)}
                    onEdit={(post) => { setEditing(post); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    onDelete={remove}
                    onReport={(post) => setReportTarget({ type: 'post', id: post.id, authorId: post.author_user_id, authorName: post.host.name })}
                    autoOpen={p.id === sharedPostId}
                  />
                ))}
                {nextBefore && (
                  <Button onClick={more} disabled={loadingMore} data-testid="feed-more" center className="self-center"
                    icon={loadingMore ? <Loader2 className="animate-spin" /> : undefined}>
                    {t('feed.load_more')}
                  </Button>
                )}
              </div>
            )}
          </section>
        )}

        {!user && (
          <Box tone="blush">
            <h2>{t('feed.host_cta')}</h2>
            <ButtonLink to="/provider/onboard" go className="self-start">{t('nav.host_with_us', 'List your Stay / Taxi')}</ButtonLink>
          </Box>
        )}
      </div>

      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onBlocked={load} />
    </div>
  );
}
