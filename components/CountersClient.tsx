'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, ChevronRight, Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { Counter } from '@/lib/types';

export function CountersClient() {
  const [counters, setCounters] = useState<Counter[]>([]);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listCounters().then(({ counters: list }) => setCounters(list))
      .catch((error: unknown) => setError(error instanceof Error ? error.message : '载入失败'))
      .finally(() => setLoading(false));
  }, []);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError('');
    try {
      const { counter } = await api.createCounter(name);
      setCounters((previous) => [...previous, counter]);
      setNewName('');
      setAdding(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : '添加失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <header className="page-header">
        <div><p className="eyebrow">我的念诵</p><h1 className="page-title">佛号</h1></div>
        <button className="icon-button bg-accent-soft text-accent" type="button" onClick={() => setAdding(!adding)}
          aria-label={adding ? '收起新增' : '添加佛号'} title={adding ? '收起新增' : '添加佛号'} aria-expanded={adding}>
          {adding ? <X size={22} /> : <Plus size={22} />}
        </button>
      </header>

      {(adding || (!loading && counters.length === 0)) && (
        <form onSubmit={add} className="mb-6 space-y-3">
          <label htmlFor="new-counter" className="field-label">新佛号</label>
          <input id="new-counter" className="field" value={newName} onChange={(event) => setNewName(event.target.value)}
            placeholder="如：南无阿弥陀佛" required maxLength={100} autoFocus={adding} />
          <button type="submit" disabled={busy || !newName.trim()} className="primary-button w-full"><Plus size={18} />{busy ? '正在添加...' : '添加佛号'}</button>
        </form>
      )}
      {error && <p className="error-message" role="alert">{error}</p>}
      {loading ? <p className="empty-state" role="status">正在载入佛号...</p> : (
        <ul className="border-t border-line">
          {counters.map((counter, index) => (
            <li className="counter-row" key={counter.id}>
              <span className="counter-number">{String(index + 1).padStart(2, '0')}</span>
              <div className="min-w-0 flex-1">
                <h2 className="counter-name">{counter.name}</h2>
                <p className="mt-1 text-xs text-muted">累计 {counter.total.toLocaleString()} 声</p>
                <Link href={`/?counter=${encodeURIComponent(counter.id)}`} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent">开始念佛<ArrowUpRight size={16} /></Link>
              </div>
              <Link href={`/counter/${counter.id}`} className="icon-button" aria-label={`编辑${counter.name}`} title="编辑佛号"><ChevronRight size={20} /></Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}