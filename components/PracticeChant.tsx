'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { PracticeSessionState } from '@/lib/practice-types';
import { loadSettings } from '@/lib/settings';
import { dateKey } from '@/lib/time';
import { playWoodFish, prefersReducedMotion, vibrateShort } from '@/lib/sound';
import { Caption, type CaptionData } from './Caption';
import { WoodenFish } from './WoodenFish';

export function PracticeChant({ initial, onPaused }: { initial: PracticeSessionState; onPaused: (state: PracticeSessionState) => void }) {
  const [session, setSession] = useState(initial);
  const [caption, setCaption] = useState<CaptionData | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(0);
  const [stageDone, setStageDone] = useState(false);
  const current = useRef(initial);
  const queue = useRef<{ eventId: string; runId: string; itemIndex: number; date: string }[]>([]);
  const sending = useRef(false);
  const mounted = useRef(true);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const token = useRef(0);

  function showState(saved: PracticeSessionState) {
    let projected = saved;
    for (const event of queue.current) {
      const active = projected.active;
      if (!active || active.completed || active.id !== event.runId || active.index !== event.itemIndex) continue;
      const counts = [...active.counts];
      counts[active.index] += 1;
      const finished = counts[active.index] >= active.items[active.index].target;
      const completed = finished && active.index === active.items.length - 1;
      const index = active.index;
      projected = { ...projected,
        stats: { today: projected.stats.today + (event.date === projected.date ? 1 : 0), total: projected.stats.total + 1 },
        active: { ...active, counts, index, completed, count: counts[index], total: active.total + 1 } };
    }
    current.current = projected;
    if (mounted.current) {
      setSession(projected);
      if (!projected.active) onPaused(projected);
    }
  }

  async function flush() {
    if (sending.current || !queue.current.length) return;
    sending.current = true;
    try {
      while (queue.current.length) {
        const event = queue.current[0];
        const timeZone = encodeURIComponent(loadSettings().timeZone);
        const response = await fetch(`/api/practice-session/taps?timeZone=${timeZone}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        });
        const result = await response.json() as PracticeSessionState & { error?: string };
        if (!response.ok) {
          if (response.status < 500) {
            queue.current = [];
            const refreshed = await fetch(`/api/practice-session?timeZone=${timeZone}`);
            if (refreshed.ok) showState(await refreshed.json() as PracticeSessionState);
          }
          throw new Error(result.error || '敲击尚未同步');
        }
        queue.current.shift();
        showState(result);
        if (mounted.current) { setPending(queue.current.length); setError(''); }
      }
    } catch (failure) {
      if (mounted.current) {
        setPending(queue.current.length);
        setError(`${failure instanceof Error ? failure.message : '敲击尚未同步'}${queue.current.length ? '，请保持页面打开' : ''}`);
      }
      if (queue.current.length) retry.current = setTimeout(flush, 1500);
    } finally {
      sending.current = false;
    }
  }

  useEffect(() => {
    mounted.current = true;
    const resume = () => { if (!document.hidden) void flush(); };
    const leaving = (event: BeforeUnloadEvent) => {
      if (queue.current.length) { event.preventDefault(); event.returnValue = ''; }
    };
    const navigating = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest('a[href]');
      if (anchor && queue.current.length && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        setError('敲击正在同步，请稍后离开');
      }
    };
    window.addEventListener('beforeunload', leaving);
    document.addEventListener('click', navigating, true);
    document.addEventListener('visibilitychange', resume);
    return () => {
      mounted.current = false;
      window.removeEventListener('beforeunload', leaving);
      document.removeEventListener('click', navigating, true);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);

  const run = session.active;
  if (!run) return null;
  const practice = run.items[run.index];
  const displayed = run.count;

  const tap = () => {
    const active = current.current.active;
    if (!active || active.completed) return;
    const item = active.items[active.index];
    const settings = loadSettings();
    if (settings.soundEnabled) playWoodFish();
    vibrateShort(prefersReducedMotion());
    setCaption({ text: item.prompts[active.count % item.prompts.length] || item.recitation,
      durationMs: settings.captionMs, token: ++token.current });
    const event = { eventId: crypto.randomUUID(), runId: active.id, itemIndex: active.index,
      date: dateKey(new Date(), settings.timeZone) };
    const counts = [...active.counts];
    counts[active.index] += 1;
    const finished = counts[active.index] >= item.target;
    const completed = finished && active.index === active.items.length - 1;
    const index = active.index;
    if (finished && !completed) setStageDone(true);
    const projected = { ...current.current,
      stats: { today: current.current.stats.today + 1, total: current.current.stats.total + 1 },
      active: { ...active, counts, index, completed, count: counts[index], total: active.total + 1 } };
    current.current = projected;
    setSession(projected);
    queue.current.push(event);
    setPending(queue.current.length);
    void flush();
  };

  const advance = () => {
    setStageDone(false);
    const active = current.current.active;
    if (!active) return;
    const index = active.index + 1;
    const projected = { ...current.current, active: { ...active, index, count: active.counts[index], completed: false } };
    current.current = projected;
    setSession(projected);
  };

  return (
    <section className="chant-center" aria-label="当前发愿">
      <div className="practice-chant-heading">
        <p className="text-sm text-muted">{run.collection_name} · {Math.min(run.index + 1, run.items.length)} / {run.items.length}</p>
        <h1 className="text-xl font-medium text-ink">{run.completed ? '本次念诵完成' : practice?.name}</h1>
        {!run.completed && <p className="practice-recitation">{practice?.recitation}</p>}
      </div>
      {stageDone && !run.completed && <div className="stage-done" role="status">
        <p className="stage-done-k">第 {run.index + 1} 关完成</p>
        <p className="stage-done-n">{practice?.name}</p>
        <p className="stage-done-s">{practice?.target.toLocaleString()} 声，念满了。</p>
        <button type="button" className="primary-button" onClick={advance}>进入第 {run.index + 2} 关</button>
      </div>}
      <div className="fish-stage">
        <div className="chant-caption" aria-live="off">{caption && <Caption key={caption.token} data={caption} />}</div>
        <WoodenFish onTap={tap} disabled={run.completed || stageDone} />
      </div>
      {!run.completed && <div className="practice-progress">
        <progress value={displayed} max={practice?.target} aria-label="当前发愿进度" />
        <span>{displayed.toLocaleString()} / {practice?.target.toLocaleString()} 声</span>
      </div>}
      <div className="count-row" aria-label="个人发愿计数">
        <span className="count-row-label">今日</span><span className="count-row-num count-row-today">{session.stats.today.toLocaleString()}</span>
        <span className="count-row-sep">/</span><span className="count-row-label">累计</span>
        <span className="count-row-num count-row-total">{session.stats.total.toLocaleString()}</span><span className="count-row-label">声</span>
      </div>
      {run.completed && <Link href="/practice-collections" className="secondary-button">我的发愿集</Link>}
      {pending > 0 && <p className="text-sm text-muted" role="status">正在同步 {pending} 声</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
  );
}