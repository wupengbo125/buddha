'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Copy, ExternalLink, Globe, Home, Lock, Pause, Pencil, Play, Plus, RefreshCw, RotateCcw, Save, Send, Share2, Trash2, X } from 'lucide-react';
import type { Collection as PracticeCollection, Practice, PracticeSessionState } from '@/lib/practice-types';
import styles from './PracticePages.module.css';

export type PracticeKind = 'practices' | 'collections';

export type { Collection as PracticeCollection, Practice } from '@/lib/practice-types';
export type PracticeContent = Practice | PracticeCollection;

const visibilityLabels = { private: '私有', pending: '待审核', public: '已公开', rejected: '审核未通过' };

interface Editor {
  id?: string;
  name: string;
  description: string;
  recitation: string;
  target: string;
  prompts: string[];
  practiceIds: string[];
}

function makeEditor(item?: PracticeContent): Editor {
  return {
    id: item?.id,
    name: item?.name ?? '',
    description: item?.description ?? '',
    recitation: item && 'recitation' in item ? item.recitation : '',
    target: item && 'target' in item ? String(item.target) : '108',
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
  const [active, setActive] = useState<PracticeSessionState['active']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [selectedPractice, setSelectedPractice] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ item: PracticeContent; action: 'delete' | 'restart' } | null>(null);

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
      practiceRequest<PracticeSessionState>('/api/practice-session', 'GET', undefined, controller.signal),
    ]).then(([ownedPractices, ownedCollections, session]) => {
      setPractices(ownedPractices);
      setCollections(ownedCollections);
      setActive(session.active);
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

  const items = kind === 'practices' ? practices : collections;
  const entityName = kind === 'practices' ? '发愿' : '发愿集';
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
        ? { ...common, recitation: editor.recitation.trim(), prompts: editor.prompts.map((prompt) => prompt.trim()).filter(Boolean), target: Number(editor.target) }
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

  async function share(item: PracticeContent) {
    setError('');
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/discover/${kind}/${encodeURIComponent(item.id)}`);
      setNotice('分享链接已复制');
    } catch {
      setError('无法复制链接，请稍后重试。');
    }
  }

  return (
    <main className={`page ${styles.root}`}>
      <header className="page-header">
        <div><p className="eyebrow">我的内容</p><h1 className="page-title">我的{entityName}</h1></div>
        <button type="button" className="icon-button bg-accent-soft text-accent" title={`新增${entityName}`} aria-label={`新增${entityName}`} disabled={loading || busy} onClick={() => { setEditor(makeEditor()); setError(''); setConfirmation(null); }}><Plus size={22} /></button>
      </header>
      <nav aria-label="我的内容" className={styles.tabs}>
        <Link href="/practices" aria-current={kind === 'practices' ? 'page' : undefined}>发愿</Link>
        <Link href="/practice-collections" aria-current={kind === 'collections' ? 'page' : undefined}>发愿集</Link>
        <Link href="/discover">广场</Link>
      </nav>
      {kind === 'collections' && <section className={styles.sessionBar} aria-label="当前发愿">
        <div className={styles.grow}><span className={styles.meta}>当前发愿集</span><p>{active ? `${active.collection_name}${active.completed ? ' · 已完成' : ''}` : '未开始发愿集'}</p>{active && <><p className={styles.meta}>{active.total.toLocaleString()} / {active.items.reduce((total, practice) => total + practice.target, 0).toLocaleString()} 次</p><progress className={styles.progress} aria-label="当前发愿集进度" value={active.total} max={active.items.reduce((total, practice) => total + practice.target, 0)} /></>}</div>
        {active && <button type="button" className="icon-button" disabled={busy} title="暂停念诵" aria-label="暂停念诵" onClick={() => sessionAction('pause')}><Pause size={19} /></button>}
        <button type="button" className="secondary-button" disabled={busy || loading} onClick={() => sessionAction('pause')}><Home size={17} />返回念佛</button>
      </section>}

      {error && <div role="alert" className="error-message">{error}{needsLogin && <> <Link href="/login" className={styles.textLink}>登录</Link></>}<button type="button" className="icon-button" title="重新载入" aria-label="重新载入" disabled={busy} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={17} /></button></div>}
      <p className={styles.notice} role="status" aria-live="polite">{notice}</p>

      {editor && <section className={styles.editor} aria-labelledby="editor-title">
        <div className={styles.sectionHeading}><h2 id="editor-title">{editor.id ? '编辑' : '新增'}{entityName}</h2><button type="button" className="icon-button" disabled={busy} title="关闭编辑" aria-label="关闭编辑" onClick={() => setEditor(null)}><X size={20} /></button></div>
        <form onSubmit={save}>
          <fieldset disabled={busy} className={styles.fields}>
            <label className={styles.label} htmlFor="practice-name">名称<input id="practice-name" className="field" required value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
            <label className={styles.label} htmlFor="practice-description">简介<textarea id="practice-description" className="field" rows={2} value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} /></label>
            {kind === 'practices' ? <>
              <label className={styles.label} htmlFor="practice-recitation">念诵内容<textarea id="practice-recitation" className="field" rows={3} required value={editor.recitation} onChange={(event) => setEditor({ ...editor, recitation: event.target.value })} /></label>
              <label className={styles.label} htmlFor="practice-target">目标次数<input id="practice-target" className="field" type="number" min="1" step="1" required inputMode="numeric" value={editor.target} onChange={(event) => setEditor({ ...editor, target: event.target.value })} /></label>
              <div><div className={styles.sectionHeading}><h3>发愿提示</h3><button type="button" className="icon-button" title="添加发愿提示" aria-label="添加发愿提示" onClick={() => setEditor({ ...editor, prompts: [...editor.prompts, ''] })}><Plus size={19} /></button></div>
                <ol className={styles.editList}>{editor.prompts.map((prompt, index) => <li key={index} className={styles.editRow}>
                  <label className={styles.grow}><span className={styles.srOnly}>发愿提示 {index + 1}</span><input className="field" value={prompt} onChange={(event) => setEditor({ ...editor, prompts: editor.prompts.map((value, position) => position === index ? event.target.value : value) })} /></label>
                  <div className={styles.orderButtons}><button type="button" className="icon-button" title={`上移提示 ${index + 1}`} aria-label={`上移提示 ${index + 1}`} disabled={index === 0} onClick={() => setEditor({ ...editor, prompts: moveEntry(editor.prompts, index, -1) })}><ArrowUp size={17} /></button><button type="button" className="icon-button" title={`下移提示 ${index + 1}`} aria-label={`下移提示 ${index + 1}`} disabled={index === editor.prompts.length - 1} onClick={() => setEditor({ ...editor, prompts: moveEntry(editor.prompts, index, 1) })}><ArrowDown size={17} /></button><button type="button" className="icon-button" title={`移除提示 ${index + 1}`} aria-label={`移除提示 ${index + 1}`} onClick={() => setEditor({ ...editor, prompts: editor.prompts.filter((_, position) => position !== index) })}><X size={17} /></button></div>
                </li>)}</ol>
              </div>
            </> : <>
              <div className={styles.addRow}><label htmlFor="add-practice" className={`${styles.label} ${styles.grow}`}>发愿<select id="add-practice" className="field" value={selectedPractice} onChange={(event) => setSelectedPractice(event.target.value)}><option value="">选择发愿</option>{practices.map((practice) => <option value={practice.id} key={practice.id}>{practice.name}</option>)}</select></label><button type="button" className="icon-button" disabled={!selectedPractice} title="加入发愿集" aria-label="加入发愿集" onClick={() => setEditor({ ...editor, practiceIds: [...editor.practiceIds, selectedPractice] })}><Plus size={20} /></button></div>
              {practices.length === 0 && <Link href="/practices" className={styles.textLink}><Plus size={16} />创建发愿</Link>}
              <ol className={styles.editList}>{editor.practiceIds.map((id, index) => <li className={styles.editRow} key={`${id}-${index}`}><span className={styles.number}>{index + 1}</span><span className={styles.grow}>{practices.find((practice) => practice.id === id)?.name ?? '发愿不可用'}</span><div className={styles.orderButtons}><button type="button" className="icon-button" title={`上移第 ${index + 1} 项`} aria-label={`上移第 ${index + 1} 项`} disabled={index === 0} onClick={() => setEditor({ ...editor, practiceIds: moveEntry(editor.practiceIds, index, -1) })}><ArrowUp size={17} /></button><button type="button" className="icon-button" title={`下移第 ${index + 1} 项`} aria-label={`下移第 ${index + 1} 项`} disabled={index === editor.practiceIds.length - 1} onClick={() => setEditor({ ...editor, practiceIds: moveEntry(editor.practiceIds, index, 1) })}><ArrowDown size={17} /></button><button type="button" className="icon-button" title={`移除第 ${index + 1} 项`} aria-label={`移除第 ${index + 1} 项`} onClick={() => setEditor({ ...editor, practiceIds: editor.practiceIds.filter((_, position) => position !== index) })}><X size={17} /></button></div></li>)}</ol>
              <p className={styles.meta}>{editor.practiceIds.length} 项 · {editor.practiceIds.reduce((total, id) => total + (practices.find((practice) => practice.id === id)?.target ?? 0), 0).toLocaleString()} 次</p>
            </>}
            {editingItem && <div>
              <div className={styles.sectionHeading}><h3>公开状态 · {visibilityLabels[editingItem.visibility]}</h3></div>
              <div className={styles.actions}>
                {editingItem.visibility !== 'public' && <button type="button" className="secondary-button" disabled={busy} onClick={() => mutate(editingItem, 'publish')}><Send size={16} />{editingItem.visibility === 'pending' || editingItem.visibility === 'rejected' ? '重新送审' : '提交公开'}</button>}
                {(editingItem.visibility === 'public' || editingItem.visibility === 'pending' || editingItem.visibility === 'rejected') && <button type="button" className="secondary-button" disabled={busy} onClick={() => mutate(editingItem, 'unpublish')}><Lock size={15} />取消公开</button>}
              </div>
            </div>}
            {editor.id && kind === 'practices' && <Link className={styles.textLink} href={`/counter/${encodeURIComponent(editor.id)}`}>发愿图片与更多设置<ExternalLink size={16} /></Link>}
            <div className={styles.actions}><button type="submit" className="primary-button" disabled={!editor.name.trim() || (kind === 'collections' && editor.practiceIds.length === 0)}><Save size={18} />{busy ? '正在保存...' : '保存'}</button><button type="button" className="secondary-button" onClick={() => setEditor(null)}>取消</button></div>
          </fieldset>
        </form>
      </section>}

  {confirmation && <section className={styles.confirmation} aria-labelledby="confirmation-title"><h2 id="confirmation-title">{confirmation.action === 'delete' ? '删除' : '重新开始'}「{confirmation.item.name}」？</h2><p>{confirmation.action === 'delete' ? references.length > 0 ? '此发愿仍被发愿集引用。' : kind === 'practices' ? '发愿将被删除。' : '发愿集与个人进度将被删除，发愿保留。' : '本轮进度将清零，使用当前内容重新开始。'}</p>{references.map((collection) => <Link key={collection.id} className={styles.textLink} href={`/practice-collections?edit=${encodeURIComponent(collection.id)}`}>{collection.name}<Pencil size={14} /></Link>)}<div className={styles.actions}><button type="button" disabled={busy} className="secondary-button" onClick={() => setConfirmation(null)}>取消</button><button type="button" disabled={busy || references.length > 0} className="primary-button" onClick={() => confirmation.action === 'delete' ? mutate(confirmation.item, 'delete') : sessionAction('restart', confirmation.item.id)}>{confirmation.action === 'delete' ? <Trash2 size={17} /> : <RotateCcw size={17} />}{busy ? '正在处理...' : '确认'}</button></div></section>}

      {loading ? <p role="status" className="empty-state">正在载入...</p> : items.length === 0 && !error ? <div className="empty-state"><p>暂无{entityName}</p><button className="secondary-button" type="button" onClick={() => setEditor(makeEditor())}><Plus size={17} />新增{entityName}</button></div> : (
        <ul className={styles.contentList}>{items.map((item) => <li className={styles.contentRow} key={item.id}>
          <div className={styles.rowHeading}><h2 className={styles.contentTitle}>{item.name}</h2><span className={styles.badge} data-status={item.visibility}>{item.visibility === 'private' ? <Lock size={12} /> : item.visibility === 'public' ? <Globe size={12} /> : null}{visibilityLabels[item.visibility]}</span></div>
          {item.description && <p className={styles.description}>{item.description}</p>}
          <p className={styles.meta}>{'items' in item ? `${item.items.length} 项 · ${item.total_target.toLocaleString()} 次` : `累计 ${(item.personal_total ?? 0).toLocaleString()} 次 · 目标 ${item.target.toLocaleString()} 次`} · 作者 {item.owner_id}</p>
                    {item.source_name && <p className={styles.meta}>来源：{item.source_name}{item.source_owner_id && ` · 作者 ${item.source_owner_id}`}</p>}
          {item.visibility === 'rejected' && <p className="error-message">审核未通过</p>}
          {'items' in item && item.visibility !== 'public' && item.items.some((practice) => practice.visibility !== 'public') && <div className={styles.reviewLinks}><span className={styles.meta}>尚未公开的发愿</span>{Array.from(new Map(item.items.filter((practice) => practice.visibility !== 'public').map((practice) => [practice.id, practice])).values()).map((practice) => <Link key={practice.id} href={`/practices?edit=${encodeURIComponent(practice.id)}`} className={styles.textLink}>{practice.name}<ExternalLink size={13} /></Link>)}</div>}
          <div className={styles.actions}>
                        {'items' in item && <button type="button" className="primary-button" disabled={busy || item.items.length === 0} onClick={() => sessionAction('start', item.id)}><Play size={16} />{active?.collection_id === item.id && active.completed ? '查看完成' : '开始 / 继续'}</button>}
            {!('items' in item) && <button type="button" className="primary-button" disabled={busy} onClick={() => startPractice(item)}><Play size={16} />开始念诵</button>}
            <button type="button" className="icon-button" title={`编辑${item.name}`} aria-label={`编辑${item.name}`} disabled={busy} onClick={() => { setEditor(makeEditor(item)); setConfirmation(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil size={18} /></button>
            <button type="button" className="icon-button" title={`复制${item.name}`} aria-label={`复制${item.name}`} disabled={busy} onClick={() => mutate(item, 'copy')}><Copy size={18} /></button>
            <button type="button" className="icon-button" title={expanded === item.id ? '收起详情' : '查看详情'} aria-label={`${expanded === item.id ? '收起' : '查看'}${item.name}详情`} aria-expanded={expanded === item.id} onClick={() => setExpanded(expanded === item.id ? null : item.id)}>{expanded === item.id ? <ChevronUp size={19} /> : <ChevronDown size={19} />}</button>
            <button type="button" className={`icon-button ${styles.danger}`} title={`删除${item.name}`} aria-label={`删除${item.name}`} disabled={busy} onClick={() => { setConfirmation({ item, action: 'delete' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Trash2 size={18} /></button>
          </div>
          {(item.visibility === 'public' || 'items' in item) && <div className={styles.actions}>
            {item.visibility === 'public' && <button type="button" className="icon-button" title="复制分享链接" aria-label={`分享${item.name}`} onClick={() => share(item)}><Share2 size={18} /></button>}
            {'items' in item && <button type="button" className="icon-button" title="重新开始" aria-label={`重新开始${item.name}`} disabled={busy} onClick={() => { setConfirmation({ item, action: 'restart' }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><RotateCcw size={18} /></button>}
          </div>}
          {expanded === item.id && ('items' in item ? <ol className={styles.sequence}>{item.items.map((practice, index) => <li key={`${practice.id}-${index}`}><span className={styles.number}>{index + 1}</span><div className={styles.grow}><h3>{practice.name}</h3><p className={styles.recitation}>{practice.recitation}</p><span className={styles.meta}>{practice.target.toLocaleString()} 次</span></div></li>)}</ol> : <div className={styles.details}><h3 className={styles.meta}>念诵内容</h3><p className={styles.recitation}>{item.recitation}</p>{item.prompts.length > 0 && <><h3 className={styles.meta}>发愿提示</h3><ol className={styles.promptList}>{item.prompts.map((prompt, index) => <li key={index}>{prompt}</li>)}</ol></>}</div>)}
        </li>)}</ul>
      )}
    </main>
  );
}