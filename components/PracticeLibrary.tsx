'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Bookmark, Check, ChevronDown, ChevronUp, CircleArrowRight, Copy, EllipsisVertical, Pencil, Plus, RefreshCw, RotateCcw, Save, Share2, Trash2, X } from 'lucide-react';
import type { Practice } from '@/lib/practice-types';
import styles from './PracticePages.module.css';

function durationLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours > 0 ? `${hours} 时 ${minutes} 分` : `${minutes} 分`;
}

interface Wishlist { id: string; name: string; practiceIds: string[]; }

const visibilityLabels = { private: '私有', pending: '待审核', public: '已公开', rejected: '审核未通过' };

interface Editor {
  id?: string;
  name: string;
  description: string;
  target: string;
  targetKind: 'count' | 'time';
  minutes: string;
  idle: string;
  min: string;
  prompts: string[];
}

function makeEditor(item?: Practice): Editor {
  return {
    id: item?.id,
    name: item?.name ?? '',
    description: item?.description ?? '',
    target: item ? String(item.target) : '10000',
    targetKind: item?.targetKind === 'time' ? 'time' : 'count',
    minutes: item?.targetSeconds ? String(Math.round(item.targetSeconds / 60)) : '60',
    idle: String(item?.idleSeconds || 10),
    min: item?.targetKind === 'time'
      ? String(Math.round((item?.minSeconds || 300) / 60))
      : String(item?.minSeconds || 100),
    prompts: item ? [...item.prompts] : [],
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

export function PracticeLibrary() {
  const router = useRouter();
  const [practices, setPractices] = useState<Practice[]>([]);
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [activeList, setActiveList] = useState('all');
  const [listEditor, setListEditor] = useState<{ id?: string; name: string } | null>(null);
  const [adding, setAdding] = useState<Practice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [lastPracticeId, setLastPracticeId] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ item: Practice; action: 'delete' | 'restart' | 'zero' } | null>(null);
  const [menu, setMenu] = useState<Practice | null>(null);
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
      practiceRequest<Wishlist[]>('/api/wishlists', 'GET', undefined, controller.signal).catch(() => [] as Wishlist[]),
    ])
      .then(([owned, lists]) => {
        setWishlists(lists);
        setPractices(owned);
        const editId = new URLSearchParams(window.location.search).get('edit');
        const selected = owned.find((item) => item.id === editId);
        if (selected) setEditor(makeEditor(selected));
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) showError(failure);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => { try { setLastPracticeId(window.localStorage.getItem('buddha:last-practice') ?? ''); } catch {} }, []);

  const activeListIds = activeList === 'all' ? null : new Set(wishlists.find((list) => list.id === activeList)?.practiceIds ?? []);
  const visible = activeListIds ? practices.filter((entry) => activeListIds.has(entry.id)) : practices;
  const foldDone = visible.filter((entry) => Boolean(entry.roundDone));
  const statusFold = visible.filter((entry) => entry.visibility === 'public' && !entry.roundDone);
  const items = visible.filter((entry) => entry.visibility !== 'public' && !entry.roundDone);
  const editingItem = editor?.id ? practices.find((entry) => entry.id === editor.id) : undefined;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!editor || busy) return;
    // 保存前先自己查一遍，直接说是哪一项不对，别等接口回一句「输入无效」。
    const problem = !editor.name.trim() ? '名称不能为空'
      : editor.targetKind === 'count' && !(Number(editor.target) >= 1) ? '目标次数必须是大于 0 的整数'
      : editor.targetKind === 'time' && !(Number(editor.minutes) >= 1) ? '目标时长（分钟）必须大于 0'
      : !(Number(editor.idle) >= 1 && Number(editor.idle) <= 60) ? '超时（秒）要在 1 到 60 之间'
      : !(Number(editor.min) >= 1) ? `最少坚持（${editor.targetKind === 'count' ? '声' : '分钟'}）必须大于 0`
      : '';
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = {
        name: editor.name.trim(),
        description: editor.description.trim(),
        prompts: editor.prompts.map((prompt) => prompt.trim()).filter(Boolean),
        target: Number(editor.target),
        targetKind: editor.targetKind,
        targetSeconds: editor.targetKind === 'time' ? Math.round(Number(editor.minutes) * 60) : 0,
        idleSeconds: Math.min(60, Math.max(1, Number(editor.idle) || 10)),
        minSeconds: editor.targetKind === 'count' ? Math.max(1, Math.round(Number(editor.min) || 100)) : Math.max(1, Math.round((Number(editor.min) || 5) * 60)),
      };
      const result = await practiceRequest<Practice>(editor.id ? `/api/practices/${encodeURIComponent(editor.id)}` : '/api/practices', editor.id ? 'PATCH' : 'POST', body);
      setPractices((previous) => editor.id ? previous.map((item) => item.id === result.id ? result : item) : [...previous, result]);
      setEditor(null);
      setNotice(`已保存发愿 · ${visibilityLabels[result.visibility]}`);
      window.history.replaceState(null, '', '/practices');
    } catch (failure) {
      showError(failure);
    } finally {
      setBusy(false);
    }
  }

  async function mutate(item: Practice, action: 'publish' | 'unpublish' | 'copy' | 'delete') {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await practiceRequest<Practice>(`/api/practices/${encodeURIComponent(item.id)}`, action === 'delete' ? 'DELETE' : 'POST', action === 'delete' ? undefined : { action });
      if (action === 'delete') {
        setPractices((previous) => previous.filter((entry) => entry.id !== item.id));
        if (editor?.id === item.id) setEditor(null);
        setNotice('已删除发愿');
      } else {
        setPractices((previous) => action === 'copy' ? [...previous, result] : previous.map((entry) => entry.id === result.id ? result : entry));
        if (action === 'copy') setEditor(makeEditor(result));
        setNotice(action === 'copy' ? '已复制' : `${result.name} · ${visibilityLabels[result.visibility]}`);
        if (result.visibility === 'rejected') setError('审核未通过，修改内容后可重新提交。');
      }
      setConfirmation(null);
    } catch (failure) {
      showError(failure);
    } finally {
      setBusy(false);
    }
  }

  async function restartRound(item: Practice) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await practiceRequest(`/api/practices/${encodeURIComponent(item.id)}`, 'POST', { action: 'restart' });
      setPractices((previous) => previous.map((entry) => entry.id === item.id ? { ...entry, roundDone: false } : entry));
      setNotice('已回到未完成，可以再念一次');
      setConfirmation(null);
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
      try { window.localStorage.setItem('buddha:last-practice', practice.id); } catch {}
      router.push(`/?counter=${encodeURIComponent(practice.id)}`);
    } catch (failure) {
      showError(failure);
    } finally {
      setBusy(false);
    }
  }

  async function share(item: Practice) {
    setError('');
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/discover/practices/${encodeURIComponent(item.id)}`);
      setNotice('分享链接已复制');
    } catch {
      setError('无法复制链接，请稍后重试。');
    }
  }

  async function zeroPractice(item: Practice) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await practiceRequest(`/api/practices/${encodeURIComponent(item.id)}`, 'POST', { action: 'zero' });
      setPractices((previous) => previous.map((entry) => entry.id === item.id ? { ...entry, personal_total: 0, today_total: 0, roundDone: false } : entry));
      setNotice('已归零：今日与累计清零');
      setConfirmation(null);
    } catch (failure) {
      showError(failure);
    } finally {
      setBusy(false);
    }
  }

  async function saveList(event: React.FormEvent) {
    event.preventDefault();
    if (!listEditor || busy) return;
    const name = listEditor.name.trim();
    if (!name) { setError('愿单名称不能为空'); return; }
    setBusy(true);
    setError('');
    try {
      const saved = await practiceRequest<Wishlist>(listEditor.id ? `/api/wishlists/${encodeURIComponent(listEditor.id)}` : '/api/wishlists', listEditor.id ? 'PATCH' : 'POST', { name });
      setWishlists((previous) => listEditor.id ? previous.map((entry) => entry.id === saved.id ? saved : entry) : [...previous, saved]);
      setActiveList(saved.id);
      setNotice(listEditor.id ? '愿单已改名' : `已新建愿单「${name}」`);
      setListEditor(null);
    } catch (failure) {
      showError(failure);
    } finally {
      setBusy(false);
    }
  }

  async function toggleMembership(practice: Practice, listId: string) {
    if (busy) return;
    const list = wishlists.find((entry) => entry.id === listId);
    if (!list) return;
    const inside = list.practiceIds.includes(practice.id);
    const next = inside ? list.practiceIds.filter((id) => id !== practice.id) : [...list.practiceIds, practice.id];
    setBusy(true);
    setError('');
    try {
      const saved = await practiceRequest<Wishlist>(`/api/wishlists/${encodeURIComponent(listId)}`, 'PATCH', { practiceIds: next });
      setWishlists((previous) => previous.map((entry) => entry.id === listId ? saved : entry));
      setNotice(inside ? `已从「${list.name}」移出` : `已加入「${list.name}」`);
    } catch (failure) {
      showError(failure);
    } finally {
      setBusy(false);
    }
  }

  const isRunning = (item: Practice) => item.id === lastPracticeId;

  const progressOf = (item: Practice) => {
    const done = item.targetKind === 'time' ? (item.personal_total ?? 0) / Math.max(1, item.targetSeconds) : (item.personal_total ?? 0) / Math.max(1, item.target);
    return Math.min(100, Math.max(0, done * 100));
  };

  const renderCard = (item: Practice) => (
    <li className={`${styles.contentRow} ${isRunning(item) ? styles.runningRow : ''}`} key={item.id}>
      <div className={styles.rowHeading}>
        <button type="button" className={styles.rowMain} aria-expanded={expanded === item.id} disabled={busy} onClick={() => setExpanded((current) => current === item.id ? null : item.id)}>
          <h2 className={styles.contentTitle}>{item.name}</h2>
          <p className={`${styles.rowMeta} ${isRunning(item) ? styles.rowMetaRunning : ''}`}>{item.targetKind === 'time' ? `今日 ${durationLabel(item.today_total ?? 0)} · 累计 ${durationLabel(item.personal_total ?? 0)} · 目标 ${durationLabel(item.targetSeconds)}` : `今日 ${(item.today_total ?? 0).toLocaleString()} · 累计 ${(item.personal_total ?? 0).toLocaleString()} · 目标 ${item.target.toLocaleString()}`}</p>
        </button>
        <div className={styles.cardButtons}>
          <button type="button" className="icon-button" title={`进入 ${item.name}`} aria-label={`进入 ${item.name}`} disabled={busy} onClick={() => startPractice(item)}><CircleArrowRight size={19} /></button>
          <button type="button" className={styles.more} title={`${item.name} 的更多操作`} aria-label={`${item.name} 的更多操作`} aria-haspopup="dialog" aria-expanded={menu?.id === item.id} disabled={busy} onClick={() => { setMenu(item); setConfirmation(null); }}><EllipsisVertical size={18} /></button>
        </div>
      </div>
      <div className={styles.rowProgress} data-done={item.roundDone ? 'true' : 'false'} aria-hidden="true"><i style={{ width: `${progressOf(item)}%` }} /></div>
      {expanded === item.id && <div className={styles.details}>{item.prompts.length > 0 && <><h3 className={styles.meta}>弹幕</h3><ol className={styles.promptList}>{item.prompts.map((prompt, index) => <li key={index}>{prompt}</li>)}</ol></>}</div>}
    </li>
  );

  return (
    <main className={`page ${styles.root}`}>
      <header className="page-header">
        <div><p className="eyebrow">我的内容</p><h1 className="page-title">我的发愿</h1></div>
        <button type="button" className="icon-button bg-accent-soft text-accent" title="新增发愿" aria-label="新增发愿" disabled={loading || busy} onClick={() => { setEditor(makeEditor()); setError(''); setConfirmation(null); }}><Plus size={22} /></button>
      </header>
      {!loading && practices.length > 0 && <p className={styles.summary}><b>{practices.length}</b>个发愿 · 今日念 {practices.reduce((sum, item) => sum + (item.targetKind === 'count' ? (item.today_total ?? 0) : 0), 0).toLocaleString()} 声</p>}

      <div className={styles.chipRow} role="group" aria-label="愿单">
        <button type="button" className={styles.listChip} aria-pressed={activeList === 'all'} disabled={busy} onClick={() => setActiveList('all')}>全部 <span>{practices.length}</span></button>
        {wishlists.map((list) => <button key={list.id} type="button" className={styles.listChip} aria-pressed={activeList === list.id} disabled={busy} onClick={() => setActiveList(list.id)}>{list.name} <span>{list.practiceIds.length}</span></button>)}
        <button type="button" className={styles.listAdd} title="新建愿单" aria-label="新建愿单" disabled={busy} onClick={() => { setListEditor({ name: '' }); setError(''); }}><Plus size={15} />愿单</button>
      </div>

      {error && <div role="alert" className="error-message">{error}{needsLogin && <> <Link href="/login" className={styles.textLink}>登录</Link></>}<button type="button" className="icon-button" title="重新载入" aria-label="重新载入" disabled={busy} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={17} /></button></div>}
      <p className={styles.notice} role="status" aria-live="polite">{notice}</p>

      {editor && <section className={styles.editor} aria-labelledby="editor-title">
        <div className={styles.sectionHeading}><h2 id="editor-title">{editor.id ? '编辑' : '新增'}发愿</h2><button type="button" className="icon-button" disabled={busy} title="关闭编辑" aria-label="关闭编辑" onClick={() => setEditor(null)}><X size={20} /></button></div>
        {error && <p role="alert" className="error-message">{error}</p>}
        <form onSubmit={save}>
          <fieldset disabled={busy} className={styles.fields}>
            <label className={styles.label} htmlFor="practice-name">名称（必填）<input id="practice-name" className="field" required value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
            <label className={styles.label} htmlFor="practice-description">简介<textarea id="practice-description" className="field" rows={2} value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} /></label>
            <div className={styles.typeRow} role="group" aria-label="目标类型">
              <button type="button" className={`${styles.typeButton} ${editor.targetKind === 'count' ? styles.typeActive : ''}`} onClick={() => setEditor({ ...editor, targetKind: 'count' })}>次数</button>
              <button type="button" className={`${styles.typeButton} ${editor.targetKind === 'time' ? styles.typeActive : ''}`} onClick={() => setEditor({ ...editor, targetKind: 'time' })}>时长</button>
            </div>
            {editor.targetKind === 'count'
              ? <div className={styles.timeFields}>
                  <label className={styles.label} htmlFor="practice-target">目标次数（必填）<input id="practice-target" className="field" type="number" min="1" step="1" required inputMode="numeric" value={editor.target} onChange={(event) => setEditor({ ...editor, target: event.target.value })} /></label>
                  <label className={styles.label} htmlFor="practice-idle-count">超时（秒）<input id="practice-idle-count" className="field" type="number" min="1" max="60" step="1" required inputMode="numeric" value={editor.idle} onChange={(event) => setEditor({ ...editor, idle: event.target.value })} /></label>
                  <label className={styles.label} htmlFor="practice-min-count">最少坚持（声）<input id="practice-min-count" className="field" type="number" min="1" max="10000" step="1" required inputMode="numeric" value={editor.min} onChange={(event) => setEditor({ ...editor, min: event.target.value })} /></label>
                  <p className={styles.meta}>超过这么久没有敲击，就认为人不在，本次累计作废、停止计数；再敲一下重新开始。本地攒满「最少坚持」之后，每满这么多声才上报一次；没攒满就离开，本地数据直接作废。</p>
                </div>
              : <div className={styles.timeFields}>
                  <label className={styles.label} htmlFor="practice-minutes">目标时长（分钟）<input id="practice-minutes" className="field" type="number" min="1" max="10080" step="1" required inputMode="numeric" value={editor.minutes} onChange={(event) => setEditor({ ...editor, minutes: event.target.value })} /></label>
                  <label className={styles.label} htmlFor="practice-idle">超时时长（秒）<input id="practice-idle" className="field" type="number" min="1" max="60" step="1" required inputMode="numeric" value={editor.idle} onChange={(event) => setEditor({ ...editor, idle: event.target.value })} /></label>
                  <label className={styles.label} htmlFor="practice-min">最少坚持（分钟）<input id="practice-min" className="field" type="number" min="1" max="600" step="1" inputMode="numeric" value={editor.min} onChange={(event) => setEditor({ ...editor, min: event.target.value })} /></label>
                  <p className={styles.meta}>超过这么久没有敲击，就认为人不在，本次累计作废、停止计时；再敲一下重新开始。本地攒满「最少坚持」之后，每满一分钟才上报一次；没攒满就离开，本地数据直接作废。</p>
                </div>}
            <div><div className={styles.sectionHeading}><h3>弹幕</h3></div>
              <ol className={styles.editList}>{editor.prompts.map((prompt, index) => <li key={index} className={styles.editRow}>
                <label className={styles.grow}><span className={styles.srOnly}>弹幕 {index + 1}</span><input className="field" value={prompt} onChange={(event) => setEditor({ ...editor, prompts: editor.prompts.map((value, position) => position === index ? event.target.value : value) })} /></label>
                <div className={styles.orderButtons}><button type="button" className="icon-button" title={`上移提示 ${index + 1}`} aria-label={`上移提示 ${index + 1}`} disabled={index === 0} onClick={() => setEditor({ ...editor, prompts: moveEntry(editor.prompts, index, -1) })}><ArrowUp size={17} /></button><button type="button" className="icon-button" title={`下移提示 ${index + 1}`} aria-label={`下移提示 ${index + 1}`} disabled={index === editor.prompts.length - 1} onClick={() => setEditor({ ...editor, prompts: moveEntry(editor.prompts, index, 1) })}><ArrowDown size={17} /></button><button type="button" className="icon-button" title={`移除提示 ${index + 1}`} aria-label={`移除提示 ${index + 1}`} onClick={() => setEditor({ ...editor, prompts: editor.prompts.filter((_, position) => position !== index) })}><X size={17} /></button></div>
              </li>)}</ol>
              <button type="button" className="secondary-button" disabled={busy || editor.prompts.length >= 100} onClick={() => setEditor({ ...editor, prompts: [...editor.prompts, ''] })}><Plus size={16} />添加弹幕</button>
            </div>
            {editingItem && <div className={styles.pubRow}><div className={styles.grow}><p className={styles.pubTitle}>公开到广场</p><p className={styles.meta}>{editingItem.visibility === 'rejected' ? '上次审核未通过，改完再打开这里重新送审' : editingItem.visibility === 'pending' ? '正在审核，关掉就是撤回' : editingItem.visibility === 'public' ? '同修能在广场看到这一页' : '打开后送审，通过就在广场出现'}</p></div>
              <button type="button" className={styles.switch} data-status={editingItem.visibility} role="switch" aria-checked={editingItem.visibility === 'public' || editingItem.visibility === 'pending'} aria-label={`${editingItem.name} 是否公开到广场`} disabled={busy} onClick={() => mutate(editingItem, editingItem.visibility === 'public' || editingItem.visibility === 'pending' ? 'unpublish' : 'publish')}><i /></button></div>}
            <div className={styles.actions}><button type="submit" className="primary-button" disabled={!editor.name.trim()}><Save size={18} />{busy ? '正在保存...' : '保存'}</button><button type="button" className="secondary-button" onClick={() => setEditor(null)}>取消</button></div>
          </fieldset>
        </form>
      </section>}

      {confirmation && <div className={styles.confirmOverlay} onClick={() => !busy && setConfirmation(null)}><section className={styles.confirmation} onClick={(event) => event.stopPropagation()} aria-labelledby="confirmation-title"><h2 id="confirmation-title">{confirmation.action === 'delete' ? '删除' : confirmation.action === 'zero' ? '归零' : '再念一次'}「{confirmation.item.name}」？</h2><p>{confirmation.action === 'delete' ? '发愿将被删除。' : confirmation.action === 'zero' ? '今日与累计都会清零，进度条从头开始。' : '回到未完成，可以重新念一轮；今日与累计不清零。'}</p><div className={styles.actions}><button type="button" disabled={busy} className="secondary-button" onClick={() => setConfirmation(null)}>取消</button><button type="button" disabled={busy} className="primary-button" onClick={() => confirmation.action === 'delete' ? mutate(confirmation.item, 'delete') : confirmation.action === 'zero' ? zeroPractice(confirmation.item) : restartRound(confirmation.item)}>{confirmation.action === 'delete' ? <Trash2 size={17} /> : <RotateCcw size={17} />}{busy ? '正在处理...' : '确认'}</button></div></section></div>}

      {loading ? <p role="status" className="empty-state">正在载入...</p> : items.length === 0 && statusFold.length === 0 && !error ? <div className="empty-state"><p>{activeList === 'all' ? '暂无发愿' : '这个愿单里还没有发愿'}</p><button className="secondary-button" type="button" onClick={() => setEditor(makeEditor())}><Plus size={17} />新增发愿</button></div> : (
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
        {foldOpen && <ul className={`${styles.contentList} ${styles.foldBody}`}>{foldDone.map(renderCard)}</ul>}
      </section>}
      {menu && <div className={styles.scrim} onClick={() => setMenu(null)} />}
      {menu && <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={`${menu.name} 的更多操作`}>
        <div className={styles.sheetGrab} />
        <p className={styles.sheetK}>可以做什么</p>
        <h2 className={styles.sheetTitle}>{menu.name}</h2>
        <button type="button" className={styles.sheetRow} disabled={busy} onClick={() => { setEditor(makeEditor(menu)); setMenu(null); }}><Pencil size={18} />编辑<span className={styles.sheetHint}>名称 · 内容 · 提示</span></button>
        <button type="button" className={styles.sheetRow} disabled={busy} onClick={() => { mutate(menu, 'copy'); setMenu(null); }}><Copy size={18} />复制<span className={styles.sheetHint}>含提示与目标</span></button>
        {menu.visibility === 'public' && <button type="button" className={styles.sheetRow} disabled={busy} onClick={() => { share(menu); setMenu(null); }}><Share2 size={18} />复制分享链接<span className={styles.sheetHint}>复制链接</span></button>}
        <button type="button" className={styles.sheetRow} disabled={busy} onClick={() => { setAdding(menu); setMenu(null); }}><Bookmark size={18} />加入愿单<span className={styles.sheetHint}>可多选</span></button>
        {menu.roundDone && <button type="button" className={styles.sheetRow} disabled={busy} onClick={() => { setConfirmation({ item: menu, action: 'restart' }); setMenu(null); }}><RotateCcw size={18} />再念一次<span className={styles.sheetHint}>回到未完成</span></button>}
        <button type="button" className={styles.sheetRow} disabled={busy} onClick={() => { setConfirmation({ item: menu, action: 'zero' }); setMenu(null); }}><RotateCcw size={18} />归零<span className={styles.sheetHint}>今日与累计清零</span></button>
        <button type="button" className={`${styles.sheetRow} ${styles.sheetDanger}`} disabled={busy} onClick={() => { setConfirmation({ item: menu, action: 'delete' }); setMenu(null); }}><Trash2 size={18} />删除<span className={styles.sheetHint}>不可恢复</span></button>
        <button type="button" className={styles.sheetCancel} onClick={() => setMenu(null)}>取消</button>
      </div>}
      {adding && <div className={styles.scrim} onClick={() => setAdding(null)} />}
      {adding && <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="加入愿单">
        <div className={styles.sheetGrab} />
        <p className={styles.sheetK}>加入愿单</p>
        <h2 className={styles.sheetTitle}>{adding.name}</h2>
        {wishlists.length === 0 && <p className={styles.sheetHint} style={{ padding: '14px 20px' }}>还没有愿单，先新建一个。</p>}
        {wishlists.map((list) => { const inside = list.practiceIds.includes(adding.id); return <button type="button" key={list.id} className={styles.pickRow} disabled={busy} aria-pressed={inside} onClick={() => toggleMembership(adding, list.id)}><span className={styles.grow}>{list.name}<span className={styles.meta}> · {list.practiceIds.length} 个发愿</span></span>{inside ? <Check size={17} /> : <Plus size={17} />}</button>; })}
        <button type="button" className={styles.sheetCancel} onClick={() => { setAdding(null); setListEditor({ name: '' }); }}>新建愿单</button>
        <button type="button" className={styles.sheetCancel} onClick={() => setAdding(null)}>完成</button>
      </div>}
      {listEditor && <div className={styles.scrim} onClick={() => !busy && setListEditor(null)} />}
      {listEditor && <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="愿单名称">
        <div className={styles.sheetGrab} />
        <p className={styles.sheetK}>愿单</p>
        <h2 className={styles.sheetTitle}>{listEditor.id ? '改名' : '新建愿单'}</h2>
        <form onSubmit={saveList} style={{ padding: '14px 20px 0' }}>
          <label className={styles.label} htmlFor="wishlist-name">愿单名称<input id="wishlist-name" className="field" maxLength={40} value={listEditor.name} onChange={(event) => setListEditor({ ...listEditor, name: event.target.value })} /></label>
          <div className={styles.actions}><button type="submit" className="primary-button" disabled={busy || !listEditor.name.trim()}>{busy ? '正在保存...' : '保存'}</button><button type="button" className="secondary-button" onClick={() => setListEditor(null)}>取消</button></div>
        </form>
        {listEditor.id && <button type="button" className={`${styles.sheetCancel} ${styles.sheetDanger}`} disabled={busy} onClick={async () => { const id = listEditor.id!; setBusy(true); try { await practiceRequest(`/api/wishlists/${encodeURIComponent(id)}`, 'DELETE'); setWishlists((previous) => previous.filter((entry) => entry.id !== id)); if (activeList === id) setActiveList('all'); setListEditor(null); setNotice('愿单已删除'); } catch (failure) { showError(failure); } finally { setBusy(false); } }}>删除这个愿单</button>}
      </div>}
    </main>
  );
}
