'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Check, Clock3, Copy, Heart, Library, Play, RefreshCw, Search, Share2 } from 'lucide-react';
import { PracticeRequestError, practiceRequest } from './PracticeLibrary';
import type { PracticeContent, PracticeKind } from './PracticeLibrary';
import styles from './PracticePages.module.css';

interface DiscoveryPage {
  items: PracticeContent[];
  page: number;
  hasMore: boolean;
}

interface UnavailableContent {
  id: string;
  kind: PracticeKind;
  available: false;
  liked?: boolean;
  favorited: boolean;
}

type DiscoveryContent = (PracticeContent & { available?: true }) | UnavailableContent;
type InteractionResult = (PracticeContent & { available?: true }) | (UnavailableContent & { likes: number; liked: boolean });
type FavoriteReference = { id: string; kind: PracticeKind } & (
  { available: true; content: PracticeContent } | { available: false; content: null }
);

function libraryPath(kind: PracticeKind, id?: string) {
  return `${kind === 'practices' ? '/practices' : '/practice-collections'}${id ? `?edit=${encodeURIComponent(id)}` : ''}`;
}

export function PracticeDiscover({ kind = 'practices', id }: { kind?: PracticeKind; id?: string }) {
  return id ? <PublicDetail kind={kind} id={id} /> : <DiscoveryList initialKind={kind} />;
}

function DiscoveryList({ initialKind }: { initialKind: PracticeKind }) {
  const [kind, setKind] = useState(initialKind);
  const [sort, setSort] = useState<'latest' | 'likes'>('latest');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [items, setItems] = useState<DiscoveryContent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setItems([]);
    setError('');
    setNeedsLogin(false);
    setNotice('');
    async function load() {
      const params = new URLSearchParams({ kind, sort, q: query, page: String(page) });
      if (!onlyFavorites) {
        const result = await practiceRequest<DiscoveryPage>(`/api/discover?${params}`, 'GET', undefined, controller.signal);
        setItems(result.items);
        setHasMore(result.hasMore);
        return;
      }
      const result = await practiceRequest<{ items: FavoriteReference[] }>(`/api/discover/favorites?${new URLSearchParams({ kind })}`, 'GET', undefined, controller.signal);
      const favorites = result.items.map<DiscoveryContent>((item) => item.available ? item.content : {
        id: item.id, kind: item.kind, available: false, favorited: true,
      }).filter((item) => (item.available === false ? item.id : `${item.name} ${item.description}`).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
      if (sort === 'likes') favorites.sort((left, right) => (right.available === false ? 0 : right.likes) - (left.available === false ? 0 : left.likes));
      setItems(favorites.slice((page - 1) * 12, page * 12));
      setHasMore(favorites.length > page * 12);
    }
    load().catch((failure: unknown) => {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : '载入失败');
        setNeedsLogin(failure instanceof PracticeRequestError && failure.status === 401);
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [kind, sort, query, page, onlyFavorites, revision]);

  async function toggle(item: DiscoveryContent, action: 'like' | 'favorite') {
    if (busy) return;
    setBusy(true);
    setError('');
    setNeedsLogin(false);
    try {
      const enabled = !(action === 'like' ? item.liked : item.favorited);
      const endpoint = kind === 'practices' ? 'practices' : 'practice-collections';
      const updated = await practiceRequest<InteractionResult>(`/api/${endpoint}/${encodeURIComponent(item.id)}`, 'POST', { action, enabled });
      setItems((previous) => previous.map((entry) => entry.id === item.id ? updated : entry).filter((entry) => !onlyFavorites || entry.favorited));
      setNotice(action === 'like' ? enabled ? '已点赞' : '已取消点赞' : enabled ? '已收藏' : '已取消收藏');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '操作失败');
      setNeedsLogin(failure instanceof PracticeRequestError && failure.status === 401);
    } finally {
      setBusy(false);
    }
  }

  return <main className={`page ${styles.root}`}>
    <header className="page-header"><div><p className="eyebrow">公开内容</p><h1 className="page-title">广场</h1></div><Link href="/practices" className="icon-button" title="我的发愿" aria-label="我的发愿"><Library size={22} /></Link></header>
    <div className={styles.kindTabs} role="group" aria-label="内容类型"><button type="button" aria-pressed={kind === 'practices'} disabled={busy} onClick={() => { setKind('practices'); setPage(1); }}>发愿</button><button type="button" aria-pressed={kind === 'collections'} disabled={busy} onClick={() => { setKind('collections'); setPage(1); }}>发愿集</button></div>
    <form className={styles.searchBar} onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); setPage(1); }} role="search"><label htmlFor="discover-search" className={styles.srOnly}>搜索名称或简介</label><input id="discover-search" className="field" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称或简介" /><button type="submit" className="icon-button" title="搜索" aria-label="搜索"><Search size={20} /></button></form>
    <div className={styles.filters}><div className={styles.sortButtons} role="group" aria-label="排序"><button type="button" disabled={busy} aria-pressed={sort === 'latest'} onClick={() => { setSort('latest'); setPage(1); }}><Clock3 size={15} />最新</button><button type="button" disabled={busy} aria-pressed={sort === 'likes'} onClick={() => { setSort('likes'); setPage(1); }}><Heart size={15} />点赞排行</button></div><label className={styles.checkLabel}><input type="checkbox" checked={onlyFavorites} disabled={busy} onChange={(event) => { setOnlyFavorites(event.target.checked); setPage(1); }} />收藏</label></div>
    {error && <div className="error-message" role="alert">{error}{needsLogin && <> <Link href="/login" className={styles.textLink}>登录</Link></>}<button type="button" className="icon-button" title="重试" aria-label="重试" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={17} /></button></div>}
    <p className={styles.notice} role="status" aria-live="polite">{notice}</p>
    {loading ? <p className="empty-state" role="status">正在载入...</p> : error && items.length === 0 ? null : items.length === 0 ? <div className="empty-state"><Bookmark size={26} strokeWidth={1.4} /><p>{query ? '没有匹配的内容' : onlyFavorites ? '暂无收藏' : '暂无公开内容'}</p></div> : <ul className={styles.contentList}>{items.map((item) => <li className={styles.contentRow} key={item.id}>
      {item.available === false ? <>
        <h2 className={styles.contentTitle}>内容不可访问</h2><p className={styles.meta}>{item.kind === 'practices' ? '发愿' : '发愿集'} · {item.id}</p>
        <div className={styles.actions}>{item.liked && <button type="button" disabled={busy} className="icon-button" title="取消点赞" aria-label="取消点赞不可访问的内容" onClick={() => toggle(item, 'like')}><Heart size={18} fill="currentColor" /></button>}{item.favorited && <button type="button" disabled={busy} className="icon-button" title="取消收藏" aria-label="取消收藏不可访问的内容" onClick={() => toggle(item, 'favorite')}><Bookmark size={18} fill="currentColor" /></button>}</div>
      </> : <>
      <Link href={`/discover/${kind}/${encodeURIComponent(item.id)}`} className={styles.discoveryHeading}><h2 className={styles.contentTitle}>{item.name}</h2><ArrowRight size={18} /></Link>
      {item.description && <p className={styles.description}>{item.description}</p>}
      <p className={styles.meta}>{'items' in item ? `${item.items.length} 项 · ${item.total_target.toLocaleString()} 次` : `${item.target.toLocaleString()} 次`}</p>
        {item.source_name && <p className={styles.meta}>来源：{item.source_name}</p>}
      <div className={styles.actions}><button type="button" disabled={busy} className={`${styles.reaction} ${item.liked ? styles.selected : ''}`} title={item.liked ? '取消点赞' : '点赞'} aria-label={`${item.liked ? '取消点赞' : '点赞'}${item.name}，${item.likes} 个赞`} aria-pressed={item.liked} onClick={() => toggle(item, 'like')}><Heart size={18} fill={item.liked ? 'currentColor' : 'none'} /><span>{item.likes.toLocaleString()}</span></button><button type="button" disabled={busy} className={`icon-button ${item.favorited ? styles.selected : ''}`} title={item.favorited ? '取消收藏' : '收藏'} aria-label={`${item.favorited ? '取消收藏' : '收藏'}${item.name}`} aria-pressed={item.favorited} onClick={() => toggle(item, 'favorite')}><Bookmark size={18} fill={item.favorited ? 'currentColor' : 'none'} /></button></div>
      </>}
    </li>)}</ul>}
    {!loading && !error && (page > 1 || hasMore) && <nav aria-label="分页" className={styles.pagination}><button type="button" className="icon-button" title="上一页" aria-label="上一页" disabled={page === 1 || busy} onClick={() => { setPage((value) => value - 1); window.scrollTo({ top: 0 }); }}><ArrowLeft size={19} /></button><span className={styles.meta}>第 {page} 页</span><button type="button" className="icon-button" title="下一页" aria-label="下一页" disabled={!hasMore || busy} onClick={() => { setPage((value) => value + 1); window.scrollTo({ top: 0 }); }}><ArrowRight size={19} /></button></nav>}
  </main>;
}

function PublicDetail({ kind, id }: { kind: PracticeKind; id: string }) {
  const router = useRouter();
  const [content, setContent] = useState<InteractionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const endpoint = kind === 'practices' ? 'practices' : 'practice-collections';

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setContent(null);
    setCopiedId(null);
    setLoadError('');
    setError('');
    setUnavailable(false);
    practiceRequest<PracticeContent>(`/api/discover/${kind}/${encodeURIComponent(id)}`, 'GET', undefined, controller.signal)
      .then(setContent)
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        const hidden = failure instanceof PracticeRequestError && [401, 403, 404, 410].includes(failure.status);
        setUnavailable(hidden);
        setLoadError(hidden ? '内容不可访问' : failure instanceof Error ? failure.message : '载入失败');
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [kind, id, revision]);

  async function action(command: 'like' | 'favorite' | 'copy' | 'start') {
    if (!content || busy) return;
    if (content.available === false && (command === 'copy' || command === 'start')) return;
    setBusy(true);
    setError('');
    setNotice('');
    setNeedsLogin(false);
    try {
      if (command === 'start') {
        let ownedId = copiedId;
        if (!ownedId) {
          const copy = await practiceRequest<PracticeContent>(`/api/${endpoint}/${encodeURIComponent(id)}`, 'POST', { action: 'copy' });
          ownedId = copy.id;
          setCopiedId(ownedId);
        }
        if (kind === 'practices') {
          await practiceRequest('/api/practice-session', 'POST', { action: 'pause' });
          router.push(`/?counter=${encodeURIComponent(ownedId)}`);
        } else {
          await practiceRequest('/api/practice-session', 'POST', { action: 'start', collectionId: ownedId });
          router.push('/');
        }
      } else {
        const enabled = command === 'like' ? !content.liked : !content.favorited;
        const result = await practiceRequest<InteractionResult>(`/api/${endpoint}/${encodeURIComponent(id)}`, 'POST', { action: command, ...(command === 'copy' ? {} : { enabled }) });
        if (command === 'copy') {
          router.push(libraryPath(kind, result.id));
        } else {
          setContent(result);
          setNotice(command === 'like' ? enabled ? '已点赞' : '已取消点赞' : enabled ? '已收藏' : '已取消收藏');
        }
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '操作失败');
      setNeedsLogin(failure instanceof PracticeRequestError && failure.status === 401);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setError('');
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/discover/${kind}/${encodeURIComponent(id)}`);
      setNotice('分享链接已复制');
    } catch {
      setError('无法复制链接，请复制浏览器地址。');
    }
  }

  const feedback = <>
    <p className={styles.notice} role="status" aria-live="polite">{notice && <span className={styles.inlineNotice}><Check size={15} />{notice}</span>}</p>
    {error && <div className="error-message" role="alert">{error}{needsLogin && <> <Link href="/login" className={styles.textLink}>登录</Link></>}</div>}
  </>;

  return <main className={`page ${styles.root}`}>
    <div className={styles.detailNav}><Link href={`/discover?kind=${kind}`} className={styles.textLink}><ArrowLeft size={17} />广场</Link><Link href={libraryPath(kind)} className="icon-button" title={kind === 'practices' ? '我的发愿' : '我的发愿集'} aria-label={kind === 'practices' ? '我的发愿' : '我的发愿集'}><Library size={20} /></Link></div>
    {loading ? <p role="status" className="empty-state">正在载入...</p> : loadError ? <section className="empty-state"><h1 className={styles.unavailableTitle}>{loadError}</h1>{!unavailable && <button type="button" className="secondary-button" onClick={() => setRevision((value) => value + 1)}><RefreshCw size={17} />重试</button>}<Link className={styles.textLink} href="/discover">返回广场</Link></section> : content && (content.available === false ? <section className="empty-state">
      <h1 className={styles.unavailableTitle}>内容不可访问</h1>
      <div className={styles.actions}>{content.liked && <button type="button" disabled={busy} className="icon-button" title="取消点赞" aria-label="取消点赞" onClick={() => action('like')}><Heart size={19} fill="currentColor" /></button>}{content.favorited && <button type="button" disabled={busy} className="icon-button" title="取消收藏" aria-label="取消收藏" onClick={() => action('favorite')}><Bookmark size={19} fill="currentColor" /></button>}</div>
      {feedback}
    </section> : <>
      <header className={styles.detailHeader}>
        <p className="eyebrow">公开{kind === 'practices' ? '发愿' : '发愿集'}</p>
        <h1 className={styles.detailTitle}>{content.name}</h1>
        {content.source_name && <p className={styles.meta}>来源：{content.source_name}</p>}
        {content.description && <p className={styles.description}>{content.description}</p>}
        <p className={styles.target}>{'items' in content ? `${content.items.length} 项 · ${content.total_target.toLocaleString()} 次` : `${content.target.toLocaleString()} 次`}</p>
      </header>
      <div className={styles.actions}><button type="button" className={`${styles.reaction} ${content.liked ? styles.selected : ''}`} disabled={busy} title={content.liked ? '取消点赞' : '点赞'} aria-label={`${content.liked ? '取消点赞' : '点赞'}，${content.likes} 个赞`} aria-pressed={content.liked} onClick={() => action('like')}><Heart size={19} fill={content.liked ? 'currentColor' : 'none'} /><span>{content.likes.toLocaleString()}</span></button><button type="button" disabled={busy} className={`icon-button ${content.favorited ? styles.selected : ''}`} title={content.favorited ? '取消收藏' : '收藏'} aria-label={content.favorited ? '取消收藏' : '收藏'} aria-pressed={content.favorited} onClick={() => action('favorite')}><Bookmark size={19} fill={content.favorited ? 'currentColor' : 'none'} /></button><button type="button" className="icon-button" title="复制分享链接" aria-label="复制分享链接" onClick={share}><Share2 size={19} /></button></div>
      <div className={styles.detailCommands}><button type="button" className="primary-button" disabled={busy || ('items' in content && content.items.length === 0)} onClick={() => action('start')}><Play size={17} />{busy ? '正在处理...' : '开始念诵'}</button><button type="button" disabled={busy} className="secondary-button" onClick={() => action('copy')}><Copy size={17} />复制到我的{kind === 'practices' ? '发愿' : '发愿集'}</button></div>
      {feedback}
      {copiedId && <Link href={libraryPath(kind, copiedId)} className={styles.textLink}><Library size={16} />查看已复制的{kind === 'practices' ? '发愿' : '发愿集'}</Link>}
      {'items' in content ? <section className={styles.publicSection} aria-labelledby="collection-content"><h2 id="collection-content" className={styles.smallTitle}>发愿顺序</h2><ol className={styles.sequence}>{content.items.map((practice, index) => <li key={`${practice.id}-${index}`}><span className={styles.number}>{String(index + 1).padStart(2, '0')}</span><div className={styles.grow}><h3>{practice.name}</h3>{practice.description && <p className={styles.description}>{practice.description}</p>}<span className={styles.meta}>{practice.target.toLocaleString()} 次</span>{practice.prompts.length > 0 && <><h4 className={styles.meta}>弹幕</h4><ol className={styles.promptList}>{practice.prompts.map((prompt, position) => <li key={position}>{prompt}</li>)}</ol></>}</div></li>)}</ol></section> : <>
        {content.prompts.length > 0 && <section className={styles.publicSection} aria-labelledby="prompts-content"><h2 id="prompts-content" className={styles.smallTitle}>弹幕</h2><ol className={styles.promptList}>{content.prompts.map((prompt, index) => <li key={index}>{prompt}</li>)}</ol></section>}
      </>}
    </>)}
  </main>;
}