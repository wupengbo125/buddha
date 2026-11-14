'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Bookmark, BookmarkCheck, ChevronDown, ChevronUp, Copy, ExternalLink, EllipsisVertical, Pencil, Play, Plus, RefreshCw, RotateCcw, Save, Share2, Trash2, X } from 'lucide-react';
import type { Collection as PracticeCollection, Practice } from '@/lib/practice-types';
import styles from './PracticePages.module.css';

export type PracticeKind = 'practices' | 'collections';

export type { Collection as PracticeCollection, Practice } from '@/lib/practice-types';
export type PracticeContent = Practice | PracticeCollection;

const visibilityLabels = { private: '私有', pending: '待审核', public: '已公开', rejected: '审核未通过' };

interface Editor {
  id?: string;
  name: string;
  description: string;
  target: string;
  prompts: string[];
  practiceIds: string[];
}

function makeEditor(item?: PracticeContent): Editor {
  return {
    id: item?.id,
    name: item?.name ?? '',
    description: item?.description ?? '',
    target: item && 'target' in item ? String(item.target) : '10000',
    prompts: item && 'prompts' in item ? [...item.prompts] : [],
    practiceIds: item && 'items' in item ? item.items.map((practice) => practice.id) : [],
  };
}

function moveEntry<Value>(entries: Value[], index: number, direction: number): Value[] {
  const next = [...entries];
  const [entry] = next.splice(index, 1);
  next.splice(index + direction, 0, entry);
  return next;
}

export class PracticeRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function practiceRequest<Result>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<Result> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) {
    const { error } = data as { error?: string };
    throw new PracticeRequestError(error || `请求失败（${response.status}）`, response.status);
  }
  return data as Result;
}

export function PracticeLibrary({ kind = 'practices' }: { kind?: PracticeKind }) {
  const router = useRouter();
  const [practices, setPractices] = useState<Practice[]>([]);
  const [collections, setCollections] = useState<PracticeCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ item: PracticeContent; action: 'delete' | 'restart' } | null>(null);
  const [menu, setMenu] = useState<PracticeContent | null>(null);
  const [collecting, setCollecting] = useState<Practice | null>(null);
  const [foldOpen, setFoldOpen] = useState(false);
  const [publicFoldOpen, setPublicFoldOpen] = useState(false);

  function showError(failure: unknown) {
    setError(failure instanceof Error ? failure.message : '操作失败');
    setNeedsLogin(failure instanceof PracticeRequestError && failure.status === 401);
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setNeedsLogin(false);
    Promise.all([
      practiceRequest<Practice[]>('/api/practices', 'GET', undefined, controller.signal),
      practiceRequest<PracticeCollection[]>('/api/practice-collections', 'GET', undefined, controller.signal),
    ]).then(([ownedPractices, ownedCollections]) => {
      setPractices(ownedPractices);
      setCollections(ownedCollections);
      const editId = new URLSearchParams(window.location.search).get('edit');
      const selected = (kind === 'practices' ? ownedPractices : ownedCollections).find((item) => item.id === editId);
      if (selected) setEditor(makeEditor(selected));
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) showError(failure);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [revision, kind]);

  const allItems = kind === 'practices' ? practices : collections;
  const foldDone = allItems.filter((entry) => 'items' in entry ? Boolean(entry.progress?.completed) : (entry.personal_total ?? 0) >= entry.target);
  const entityName = kind === 'practices' ? '发愿' : '发愿集';
  const statusFold = allItems.filter((entry) => entry.visibility === 'public' && !foldDone.some((done) => done.id === entry.id));
  const items = allItems.filter((entry) => entry.visibility !== 'public' && !foldDone.some((done) => done.id === entry.id));
  const collectedIds = new Set(collections.flatMap((collection) => collection.items.map((entry) => entry.id)));
  const endpoint = kind === 'practices' ? '/api/practices' : '/api/practice-collections';
  const editingItem = editor?.id ? items.find((entry) => entry.id === editor.id) : undefined;
  const references = kind === 'practices' && confirmation?.action === 'delete'
    ? collections.filter((collection) => collection.items.some((practice) => practice.id === confirmation.item.id)) : [];

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editor || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const common = { name: editor.name.trim(), description: editor.description.trim() };
      const body = kind === 'practices'
        ? { ...common, prompts: editor.prompts.map((prompt) => prompt.trim()).filter(Boolean), target: Number(editor.target) }
        : { ...common, practiceIds: editor.practiceIds };
      const path = editor.id ? `${endpoint}/${encodeURIComponent(editor.id)}` : endpoint;
      const result = await practiceRequest<PracticeContent>(path, editor.id ? 'PATCH' : 'POST', body);
      if (kind === 'practices') setPractices((previous) => editor.id ? previous.map((item) => item.id === result.id ? result as Practice : item) : [...previous, result as Practice]);
      else setCollections((previous) => editor.id ? previous.map((item) => item.id === result.id ? result as PracticeCollection : item) : [...previous, result as PracticeCollection]);
      setEditor(null);
      setNotice(`已保存${entityName} · ${visibilityLabels[result.visibility]}`);
      window.history.replaceState(null, '', kind === 'practices' ? '/practices' : '/practice-collections');
    } catch (failure) {
      showError(failure);
    } finally {
      setBusy(false);
    }
  }

  async function mutate(item: PracticeContent, action: 'publish' | 'unpublish' | 'copy' | 'delete') {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await practiceRequest<PracticeContent>(`${endpoint}/${encodeURIComponent(item.id)}`, action === 'delete' ? 'DELETE' : 'POST', action === 'delete' ? undefined : { action });
      if (action === 'delete') {
        if (kind === 'practices') setPractices((previous) => previous.filter((entry) => entry.id !== item.id));
        else setCollections((previous) => previous.filter((entry) => entry.id !== item.id));
        if (editor?.id === item.id) setEditor(null);
        setNotice(`已删除${entityName}`);
      } else {
        if (kind === 'practices') setPractices((previous) => action === 'copy' ? [...previous, result as Practice] : previous.map((entry) => entry.id === result.id ? result as Practice : entry));
        else setCollections((previous) => action === 'copy' ? [...previous, result as PracticeCollection] : previous.map((entry) => entry.id === result.id ? result as PracticeCollection : entry));
        if (action === 'copy') setEditor(makeEditor(result));
        setNotice(action === 'copy' ? '已复制' : `${result.name} · ${visibilityLabels[result.visibility]}`);
        if (result.visibility === 'rejected') setError('审核未通过，修改内容后可重新提交。');
        if (action === 'copy' && kind === 'collections') setRevision((value) => value + 1);
      }
      setConfirmation(null);
    } catch (failure) {
      showError(failure);
    } finally {
      setBusy(false);
    }
  }

  async function sessionAction(action: 'start' | 'pause' | 'restart', collectionId?: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await practiceRequest('/api/practice-session', 'POST', { action, ...(collectionId ? { collectionId } : {}) });
      router.push('/');
    } catch (failure) {
      showError(failure);
    } finally {
      setBusy(false);
    }
  }

  async function startPractice(practice: Practice) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await practiceRequest('/api/practice-session', 'POST', { action: 'pause' });
      router.push(`/?counter=${encodeURIComponent(practice.id)}`);
    } catch (failure) {
      showError(failure);
    } finally {
      setBusy(false);
    }
  }

  async function collectInto(practice: Practice, collection: PracticeCollection) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await practiceRequest(`/api/practice-collections/${encodeURIComponent(collection.id)}`, 'PATCH', { practiceIds: [...collection.items.map((entry) => entry.id), practice.id] });
      setNotice(`已添加到「${collection.name}」`);
      setCollecting(null);
      setRevision((value) => value + 1);
    } catch (failure) {
      showError(failure);
    } finally {
      setBusy(false);
    }
  }

  async function share(item: PracticeContent) {
    setError('');
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/discover/${kind}/${encodeURIComponent(item.id)}`);
      setNotice('分享链接已复制');
    } catch {
      setError('无法复制链接，请稍后重试。');
    }
  }

  const renderCard = (item: PracticeContent) => (
    <li className={styles.contentRow} key={item.id}>
      <div className={styles.rowHeading}><h2 className={styles.contentTitle}>{item.name}</h2>
        <div className={styles.cardButtons}>
          {!('items' in item) && <button type="button" className="icon-button" title={`开始念诵 ${item.name}`} aria-label={`开始念诵 ${item.name}`} disabled={busy} onClick={() => startPractice(item)}><Play size={18} /></button>}
          <button type="button" className={styles.more} title={`${item.name} 的更多操作`} aria-label={`${item.name} 的更多操作`} aria-haspopup="dialog" aria-expanded={menu?.id === item.id} disabled={busy} onClick={() => { setMenu(item); setConfirmation(null); }}><EllipsisVertical size={18} /></button>
        </div>
      </div>

          {expanded === item.id && ('items' in item ? <ol className={styles.sequence}>{item.items.map((practice, index) => <li key={`${practice.id}-${index}`}><span className={styles.number}>{index + 1}</span><div className={styles.grow}><h3>{practice.name}</h3><span className={styles.meta}>{practice.target.toLocaleString()} 次</span></div></li>)}</ol> : <div className={styles.details}>{item.prompts.length > 0 && <><h3 className={styles.meta}>弹幕</h3><ol className={styles.promptList}>{item.prompts.map((prompt, index) => <li key={index}>{prompt}</li>)}</ol></>}</div>)}
    </li>
  );

  return (
    <main className={`page ${styles.root}`}>
      <header className="page-header">
        <div><p className="eyebrow">我的内容</p><h1 className="page-title">我的{entityName}</h1></div>
        <button type="button" className="icon-button bg-accent-soft text-accent" title={`新增${entityName}`} aria-label={`新增${entityName}`} disabled={loading || busy} onClick={() => { setEditor(makeEditor()); setError(''); setConfirmation(null); }}><Plus size={22} /></button>
      </header>
      <nav aria-label="我的内容" className={styles.tabs}>
        <Link href="/practices" aria-current={kind === 'practices' ? 'page' : undefined}>发愿</Link>
        <Link href="/practice-collections" aria-current={kind === 'collections' ? 'page' : undefined}>发愿集</Link>
      </nav>

      {error && <div role="alert" className="error-message">{error}{needsLogin && <> <Link href="/login" className={styles.textLink}>登录</Link></>}<button type="button" className="icon-button" title="重新载入" aria-label="重新载入" disabled={busy} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={17} /></button></div>}
      <p className={styles.notice} role="status" aria-live="polite">{notice}</p>

      {editor && <section className={styles.editor} aria-labelledby="editor-title">
        <div className={styles.sectionHeading}><h2 id="editor-title">{editor.id ? '编辑' : '新增'}{entityName}</h2><button type="button" className="icon-button" disabled={busy} title="关闭编辑" aria-label="关闭编辑" onClick={() => setEditor(null)}><X size={20} /></button></div>
        <form onSubmit={save}>
          <fieldset disabled={busy} className={styles.fields}>
            <label className={styles.label} htmlFor="practice-name">名称（必填）<input id="practice-name" className="field" required value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
            <label className={styles.label} htmlFor="practice-description">简介<textarea id="practice-description" className="field" rows={2} value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} /></label>
            {kind === 'practices' ? <>
              <label className={styles.label} htmlFor="practice-target">目标次数（必填）<input id="practice-target" className="field" type="number" min="1" step="1" required inputMode="numeric" value={editor.target} onChange={(event) => setEditor({ ...editor, target: event.target.value })} /></label>
              <div><div className={styles.sectionHeading}><h3>弹幕</h3></div>
                <ol className={styles.editList}>{editor.prompts.map((prompt, index) => <li key={index} className={styles.editRow}>
                  <label className={styles.grow}><span className={styles.srOnly}>弹幕 {index + 1}</span><input className="field" value={prompt} onChange={(event) => setEditor({ ...editor, prompts: editor.prompts.map((value, position) => position === index ? event.target.value : value) })} /></label>
                  <div className={styles.orderButtons}><button type="button" className="icon-button" title={`上移提示 ${index + 1}`} aria-label={`上移提示 ${index + 1}`} disabled={index === 0} onClick={() => setEditor({ ...editor, prompts: moveEntry(editor.prompts, index, -1) })}><ArrowUp size={17} /></button><button type="button" className="icon-button" title={`下移提示 ${index + 1}`} aria-label={`下移提示 ${index + 1}`} disabled={index === editor.prompts.length - 1} onClick={() => setEditor({ ...editor, prompts: moveEntry(editor.prompts, index, 1) })}><ArrowDown size={17} /></button><button type="button" className="icon-button" title={`移除提示 ${index + 1}`} aria-label={`移除提示 ${index + 1}`} onClick={() => setEditor({ ...editor, prompts: editor.prompts.filter((_, position) => position !== index) })}><X size={17} /></button></div>
                </li>)}</ol>
              </div>
            </> : <>
              <div className={styles.levelHead}><h3>关卡</h3><span className={styles.meta}>{editor.practiceIds.length} 关</span></div>
              <ol className={styles.levelList}>{editor.practiceIds.map((id, index) => { const practice = practices.find((entry) => entry.id === id); return <li className={styles.levelRow} key={`${id}-${index}`}><span className={styles.levelNo}>{index + 1}</span><span className={styles.grow}><b>{practice?.name ?? '发愿已删除'}</b><span className={styles.meta}>{practice ? `${practice.target.toLocaleString()} 次` : '需要移除'}</span></span><div className={styles.orderButtons}><button type="button" className="icon-button" title={`上移第 ${index + 1} 关`} aria-label={`上移第 ${index + 1} 关`} disabled={index === 0} onClick={() => setEditor({ ...editor, practiceIds: moveEntry(editor.practiceIds, index, -1) })}><ArrowUp size={16} /></button><button type="button" className="icon-button" title={`下移第 ${index + 1} 关`} aria-label={`下移第 ${index + 1} 关`} disabled={index === editor.practiceIds.length - 1} onClick={() => setEditor({ ...editor, practiceIds: moveEntry(editor.practiceIds, index, 1) })}><ArrowDown size={16} /></button><button type="button" className="icon-button" title={`移除第 ${index + 1} 关`} aria-label={`移除第 ${index + 1} 关`} onClick={() => setEditor({ ...editor, practiceIds: editor.practiceIds.filter((entry) => entry !== id) })}><X size={16} /></button></div></li>; })}</ol>
              {editor.practiceIds.length === 0 && <p className={styles.meta}>还没有关卡，点下面的发愿就能成为第 1 关。</p>}
              <div className={styles.levelChips}>{practices.filter((practice) => !editor.practiceIds.includes(practice.id)).map((practice) => <button type="button" className={styles.chip} key={practice.id} disabled={busy} onClick={() => setEditor({ ...editor, practiceIds: [...editor.practiceIds, practice.id] })}><Plus size={14} />{practice.name}</button>)}</div>
              {practices.length === 0 && <Link href="/practices" className={styles.textLink}><Plus size={16} />先去创建发愿</Link>}
            </>}
              {editingItem && <div className={styles.pubRow}><div className={styles.grow}><p className={styles.pubTitle}>公开到广场</p><p className={styles.meta}>{editingItem.visibility === 'rejected' ? '上次审核未通过，改完再打开这里重新送审' : editingItem.visibility === 'pending' ? '正在审核，关掉就是撤回' : editingItem.visibility === 'public' ? '同修能在广场看到这一页' : '打开后送审，通过就在广场出现'}</p></div>
                <button type="button" className={styles.switch} data-status={editingItem.visibility} role="switch" aria-checked={editingItem.visibility === 'public' || editingItem.visibility === 'pending'} aria-label={`${editingItem.name} 是否公开到广场`} disabled={busy} onClick={() => mutate(editingItem, editingItem.visibility === 'public' || editingItem.visibility === 'pending' ? 'unpublish' : 'publish')}><i /></button></div>}
            <div className={styles.actions}><button type="submit" className="primary-button" disabled={!editor.name.trim() || (kind === 'collections' && editor.practiceIds.length === 0)}><Save size={18} />{busy ? '正在保存...' : '保存'}</button><button type="button" className="secondary-button" onClick={() => setEditor(null)}>取消</button></div>
          </fieldset>
        </form>
      </section>}

  {confirmation && <div className={styles.confirmOverlay} onClick={() => !busy && setConfirmation(null)}><section className={styles.confirmation} onClick={(event) => event.stopPropagation()} aria-labelledby="confirmation-title"><h2 id="confirmation-title">{confirmation.action === 'delete' ? '删除' : '重新开始'}「{confirmation.item.name}」？</h2><p>{confirmation.action === 'delete' ? references.length > 0 ? '此发愿仍被发愿集引用。' : kind === 'practices' ? '发愿将被删除。' : '发愿集与个人进度将被删除，发愿保留。' : '本轮进度将清零，使用当前内容重新开始。'}</p>{references.map((collection) => <Link key={collection.id} className={styles.textLink} href={`/practice-collections?edit=${encodeURIComponent(collection.id)}`}>{collection.name}<Pencil size={14} /></Link>)}<div className={styles.actions}><button type="button" disabled={busy} className="secondary-button" onClick={() => setConfirmation(null)}>取消</button><button type="button" disabled={busy || references.length > 0} className="primary-button" onClick={() => confirmation.action === 'delete' ? mutate(confirmation.item, 'delete') : sessionAction('restart', confirmation.item.id)}>{confirmation.action === 'delete' ? <Trash2 size={17} /> : <RotateCcw size={17} />}{busy ? '正在处理...' : '确认'}</button></div></section></div>}

      {loading ? <p role="status" className="empty-state">正在载入...</p> : items.length === 0 && statusFold.length === 0 && !error ? <div className="empty-state"><p>暂无{entityName}</p><button className="secondary-button" type="button" onClick={() => setEditor(makeEditor())}><Plus size={17} />新增{entityName}</button></div> : (
      <>
      {statusFold.length > 0 && <section className={styles.fold}>
        <button type="button" className={styles.foldHead} aria-expanded={publicFoldOpen} onClick={() => setPublicFoldOpen((value) => !value)}><span>公开 · {statusFold.length}</span><span>{publicFoldOpen ? '收起' : '展开'}{publicFoldOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span></button>
        {publicFoldOpen && <ul className={`${styles.contentList} ${styles.foldBody}`}>{statusFold.map(renderCard)}</ul>}
      </section>}
      <ul className={styles.contentList}>{items.map(renderCard)}</ul>
      </>
      )}
      {!loading && foldDone.length > 0 && <section className={styles.fold}>
        <button type="button" className={styles.foldHead} aria-expanded={foldOpen} onClick={() => setFoldOpen((value) => !value)}><span>已完成 · {foldDone.length}</span><span>{foldOpen ? '收起' : '展开'}{foldOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span></button>
        {foldOpen && <ul className={`${styles.contentList} ${styles.foldBody}`}>{foldDone.map((item) => <li className={styles.contentRow} key={item.id}><div className={styles.rowHeading}><h2 className={styles.contentTitle}>{item.name}</h2><span className={styles.pubLabel}>{'items' in item ? '已完成' : `已念 ${(item.personal_total ?? 0).toLocaleString()} 次`}</span></div><div className={styles.actions}><button type="button" className="secondary-button" disabled={busy} onClick={() => ('items' in item ? sessionAction('start', item.id) : startPractice(item))}><Play size={16} />再念一次</button></div></li>)}</ul>}
      </section>}
      {menu && <div className={styles.scrim} onClick={() => setMenu(null)} />}
      {menu && <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={`${menu.name} 的更多操作`}>
        <div className={styles.sheetGrab} />
        <p className={styles.sheetK}>可以做什么</p>
        <h2 className={styles.sheetTitle}>{menu.name}</h2>
        {'items' in menu && <button type="button" className={styles.sheetRow} disabled={busy || menu.items.length === 0} onClick={() => { setMenu(null); sessionAction('start', menu.id); }}><Play size={18} />开始</button>}
        <button type="button" className={styles.sheetRow} disabled={busy} onClick={() => { setEditor(makeEditor(menu)); setMenu(null); }}><Pencil size={18} />编辑<span className={styles.sheetHint}>名称 · 内容 · 提示</span></button>
        <button type="button" className={styles.sheetRow} disabled={busy} onClick={() => { mutate(menu, 'copy'); setMenu(null); }}><Copy size={18} />复制<span className={styles.sheetHint}>含提示与目标</span></button>
        {!('items' in menu) && <button type="button" className={styles.sheetRow} disabled={busy} onClick={() => { setCollecting(menu); setMenu(null); }}><Bookmark size={18} />加入发愿集<span className={styles.sheetHint}>放进某一集</span></button>}
        {menu.visibility === 'public' && <button type="button" className={styles.sheetRow} disabled={busy} onClick={() => { share(menu); setMenu(null); }}><Share2 size={18} />复制分享链接<span className={styles.sheetHint}>复制链接</span></button>}
        {'items' in menu && <button type="button" className={styles.sheetRow} disabled={busy} onClick={() => { setConfirmation({ item: menu, action: 'restart' }); setMenu(null); }}><RotateCcw size={18} />重新开始<span className={styles.sheetHint}>清零发愿累计</span></button>}
        <button type="button" className={`${styles.sheetRow} ${styles.sheetDanger}`} disabled={busy} onClick={() => { setConfirmation({ item: menu, action: 'delete' }); setMenu(null); }}><Trash2 size={18} />删除<span className={styles.sheetHint}>不可恢复</span></button>
        <button type="button" className={styles.sheetCancel} onClick={() => setMenu(null)}>取消</button>
      {collecting && <div className={styles.scrim} onClick={() => setCollecting(null)} />}
      {collecting && <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="加入发愿集">
        <div className={styles.sheetGrab} />
        <p className={styles.sheetK}>加入发愿集</p>
        <h2 className={styles.sheetTitle}>{collecting.name}</h2>
        {collections.length === 0 && <p className={styles.sheetHint} style={{ padding: '14px 20px' }}>还没有发愿集。先去发愿集页新建一个。</p>}
        {collections.map((collection) => { const inside = collection.items.some((entry) => entry.id === collecting.id); return <button type="button" key={collection.id} className={styles.pickRow} disabled={busy || inside} onClick={() => collectInto(collecting, collection)}><span className={styles.grow}>{collection.name}<span className={styles.meta}> · {collection.items.length} 关</span></span>{inside ? <BookmarkCheck size={16} /> : <Plus size={16} />}</button>; })}
        <button type="button" className={styles.sheetCancel} onClick={() => setCollecting(null)}>取消</button>
      </div>}

      </div>}

    </main>
  );
}
