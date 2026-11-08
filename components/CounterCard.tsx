'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Check, ChevronRight, Pencil, Trash2, X } from 'lucide-react';
import type { Counter } from '@/lib/types';
import { pendingTotal, type CounterState } from '@/lib/counter-store';

interface Props {
  counter: Counter;
  state: CounterState;
  onTap: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

export function CounterCard({ counter, state, onTap, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(counter.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex min-h-[32px] items-center gap-2">
        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onRename(draft);
                  setEditing(false);
                }
                if (e.key === 'Escape') {
                  setDraft(counter.name);
                  setEditing(false);
                }
              }}
              className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 py-1 text-base text-ink outline-none focus:border-accent"
            />
            <button
              aria-label="保存名称"
              onClick={() => {
                onRename(draft);
                setEditing(false);
              }}
              className="tap-press rounded-lg p-1 text-accent"
            >
              <Check size={18} />
            </button>
            <button
              aria-label="取消"
              onClick={() => {
                setDraft(counter.name);
                setEditing(false);
              }}
              className="tap-press rounded-lg p-1 text-muted"
            >
              <X size={18} />
            </button>
          </>
        ) : (
          <>
            <h2 className="flex-1 truncate text-lg font-semibold text-ink">{counter.name}</h2>
            <button
              aria-label="改名"
              onClick={() => {
                setDraft(counter.name);
                setEditing(true);
              }}
              className="tap-press rounded-lg p-1 text-muted"
            >
              <Pencil size={16} />
            </button>
            <Link href={`/counter/${counter.id}`} aria-label="详情" className="tap-press rounded-lg p-1 text-muted">
              <ChevronRight size={20} />
            </Link>
          </>
        )}
      </div>

      <div className="mt-3 flex justify-around rounded-xl bg-accent-soft/60 py-2 text-center">
        <div>
          <div className="text-xs text-muted">当日声数</div>
          <div className="text-3xl font-bold tabular-nums text-accent">{state.today}</div>
        </div>
        <div>
          <div className="text-xs text-muted">累计总数</div>
          <div className="text-3xl font-bold tabular-nums text-ink">{state.total}</div>
        </div>
      </div>

      <button
        onClick={onTap}
        className="tap-press mt-3 w-full rounded-xl bg-accent py-7 text-xl font-semibold tracking-wide text-white shadow-sm"
      >
        念一声
      </button>

      <div className="mt-2 flex min-h-[24px] items-center justify-between text-xs text-muted">
        <span>待同步 {pendingTotal(state)}</span>
        {confirmDelete ? (
          <span className="flex items-center gap-2">
            确定删除？
            <button onClick={onDelete} className="font-semibold text-danger">删除</button>
            <button onClick={() => setConfirmDelete(false)} className="text-muted">取消</button>
          </span>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="tap-press flex items-center gap-1 text-muted">
            <Trash2 size={14} /> 删除
          </button>
        )}
      </div>
    </div>
  );
}
