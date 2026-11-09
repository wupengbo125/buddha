'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, ChevronRight, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { Counter } from '@/lib/types';

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : '操作失败';
}

type Edit = { id: string; field: 'name' | 'caption'; value: string } | null;

/** 添加页：佛号列表 + 添加 + 改名 + 删除 + 字幕文案编辑 + 每项目音效开关 + 进入图片管理。 */
export function CountersClient() {
  const [counters, setCounters] = useState<Counter[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<Edit>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { counters: list } = await api.listCounters();
        setCounters(list);
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const add = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError('');
    try {
      const { counter } = await api.createCounter(name);
      setCounters((prev) => [...prev, counter]);
      setNewName('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!edit) return;
    const value = edit.value.trim();
    if (edit.field === 'name' && !value) return;
    setBusy(true);
    setError('');
    try {
      const patch = edit.field === 'name' ? { name: value } : { caption: value };
      const { counter } = await api.updateCounter(edit.id, patch);
      setCounters((prev) => prev.map((c) => (c.id === edit.id ? counter : c)));
      setEdit(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // 每个计数器独立音效开关：写 D1（PATCH），跟账号走、跨设备一致。
  const toggleSound = async (c: Counter) => {
    const next = c.sound_enabled === 1 ? 0 : 1;
    try {
      const { counter } = await api.updateCounter(c.id, { sound_enabled: next });
      setCounters((prev) => prev.map((x) => (x.id === c.id ? counter : x)));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = async (id: string) => {
    setError('');
    try {
      await api.deleteCounter(id);
      setCounters((prev) => prev.filter((c) => c.id !== id));
      setConfirmDelete(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-6 md:pb-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-wide text-ink">添加佛号</h1>
        <p className="mt-1 text-sm text-muted">管理佛号、字幕文案、音效与图片</p>
      </header>

      {/* 添加输入框：四页里只有本页有；念佛页没有 */}
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add();
          }}
          placeholder="输入佛号，如 南无阿弥陀佛"
          className="min-w-0 flex-1 rounded-full border border-line bg-surface px-5 py-3 text-base text-ink outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy}
          className="tap-press flex shrink-0 items-center gap-1 rounded-full bg-accent px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          <Plus size={18} /> 添加
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="mt-12 text-center text-muted">加载中…</p>
      ) : counters.length === 0 ? (
        <p className="mt-12 text-center text-muted">还没有佛号，添加一个开始念佛吧</p>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {counters.map((c) => {
            const editingName = edit?.id === c.id && edit.field === 'name';
            const editingCaption = edit?.id === c.id && edit.field === 'caption';
            const soundOn = c.sound_enabled === 1;
            return (
              <li key={c.id} className="px-4 py-4">
                {editingName ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={edit!.value}
                      onChange={(e) => setEdit({ ...edit!, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveEdit();
                        if (e.key === 'Escape') setEdit(null);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-ink outline-none focus:border-accent"
                    />
                    <button aria-label="保存" onClick={() => void saveEdit()} disabled={busy} className="tap-press rounded-lg px-2 text-accent">
                      <Check size={20} />
                    </button>
                    <button aria-label="取消" onClick={() => setEdit(null)} className="tap-press rounded-lg px-2 text-muted">
                      <X size={20} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="min-w-0 flex-1 truncate text-lg font-semibold text-ink">{c.name}</h2>
                    <button
                      aria-label="改名"
                      onClick={() => setEdit({ id: c.id, field: 'name', value: c.name })}
                      className="tap-press rounded-lg p-1 text-muted"
                    >
                      <Pencil size={16} />
                    </button>
                    <Link
                      href={`/counter/${c.id}`}
                      className="tap-press flex items-center gap-0.5 rounded-lg px-2 py-1 text-sm text-accent"
                    >
                      <ImagePlus size={15} /> 图片 <ChevronRight size={15} />
                    </Link>
                    {confirmDelete === c.id ? (
                      <span className="flex items-center gap-2 text-sm">
                        <button onClick={() => void remove(c.id)} className="font-semibold text-danger">确定</button>
                        <button onClick={() => setConfirmDelete(null)} className="text-muted">取消</button>
                      </span>
                    ) : (
                      <button
                        aria-label="删除"
                        onClick={() => setConfirmDelete(c.id)}
                        className="tap-press rounded-lg p-1 text-muted"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className="shrink-0 text-muted">字幕</span>
                  {editingCaption ? (
                    <>
                      <input
                        autoFocus
                        value={edit!.value}
                        onChange={(e) => setEdit({ ...edit!, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void saveEdit();
                          if (e.key === 'Escape') setEdit(null);
                        }}
                        placeholder="留空则取佛号名"
                        className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-1.5 text-ink outline-none focus:border-accent"
                      />
                      <button aria-label="保存" onClick={() => void saveEdit()} disabled={busy} className="tap-press rounded-lg px-1 text-accent">
                        <Check size={18} />
                      </button>
                      <button aria-label="取消" onClick={() => setEdit(null)} className="tap-press rounded-lg px-1 text-muted">
                        <X size={18} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-ink-soft">{c.caption || '（同佛号名）'}</span>
                      <button
                        aria-label="编辑字幕"
                        onClick={() => setEdit({ id: c.id, field: 'caption', value: c.caption })}
                        className="tap-press rounded-lg p-1 text-muted"
                      >
                        <Pencil size={14} />
                      </button>
                    </>
                  )}
                </div>

                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className="shrink-0 text-muted">音效</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={soundOn}
                    aria-label={`切换 ${c.name} 音效`}
                    onClick={() => void toggleSound(c)}
                    className={`tap-press relative h-6 w-11 shrink-0 rounded-full border border-line transition-colors ${
                      soundOn ? 'bg-accent' : 'bg-line'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        soundOn ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                  <span className="text-ink-soft">{soundOn ? '开' : '关'}</span>
                  <span className="ml-auto text-xs text-muted">全局总开关见设置页</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
