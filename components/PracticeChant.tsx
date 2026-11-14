'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { PracticeSessionState } from '@/lib/practice-types';
import { storageNamespace } from '@/lib/brand';
import { projectPracticeTap } from '@/lib/practice-projection';
import { sendPracticeTap, type PendingPracticeTap } from '@/lib/practice-sync';
import { PendingQueue } from '@/lib/storage';
import { loadSettings } from '@/lib/settings';
import { dateKey, msUntilNextDay } from '@/lib/time';
import { playWoodFish, prefersReducedMotion, vibrateShort } from '@/lib/sound';
import { Caption, type CaptionData } from './Caption';
import { WoodenFish } from './WoodenFish';

export function PracticeChant({ initial, onStateChange }: { initial: PracticeSessionState; onStateChange: (state: PracticeSessionState) => void }) {
  const [session, setSession] = useState(initial);
  const [caption, setCaption] = useState<CaptionData | null>(null);
  const [error, setError] = useState('');
  const [recovering, setRecovering] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const current = useRef(initial);
  const confirmedRevision = useRef(initial.revision);
  const queue = useRef(new PendingQueue<PendingPracticeTap>());
  const sending = useRef(false);
  const recoveringRef = useRef(true);
  const blockedRef = useRef(false);
  const mounted = useRef(true);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const token = useRef(0);

  function showState(saved: PracticeSessionState) {
    if (saved.revision < confirmedRevision.current) return;
    confirmedRevision.current = saved.revision;
    let projected = saved;
    if (!recoveringRef.current) for (const event of queue.current.values()) {
      if (!saved.confirmedEventIds?.includes(event.eventId)) projected = projectPracticeTap(projected, event);
    }
    current.current = projected;
    if (mounted.current) {
      setSession(projected);
      onStateChange(projected);
    }
  }

  async function flush() {
    if (sending.current) return;
    if (!queue.current.size) {
      recoveringRef.current = false;
      blockedRef.current = false;
      if (mounted.current) { setRecovering(false); setBlocked(false); }
      return;
    }
    sending.current = true;
    let retryable = true;
    try {
      while (queue.current.size) {
        const event = queue.current.values()[0];
        const timeZone = loadSettings().timeZone;
        const { response, result } = await sendPracticeTap(queue.current, event, timeZone, queue.current.values().map((pending) => pending.eventId));
        if (!response.ok) {
          if (response.status === 410) {
            recoveringRef.current = false;
            if (mounted.current) { setRecovering(false); setError('部分敲击因发愿或轮次已删除而无法同步，记录已保留'); }
            if (!queue.current.size) {
              const refreshed = await fetch(`/api/practice-session?timeZone=${encodeURIComponent(timeZone)}`);
              if (!refreshed.ok) throw new Error('无法刷新发愿进度');
              showState(await refreshed.json() as PracticeSessionState);
            }
            continue;
          }
          if (response.status < 500) {
            retryable = false;
            blockedRef.current = true;
            if (mounted.current) setBlocked(true);
            const refreshed = await fetch(`/api/practice-session?timeZone=${encodeURIComponent(timeZone)}`);
            if (refreshed.ok) showState(await refreshed.json() as PracticeSessionState);
          }
          throw new Error(result.error || '敲击尚未同步');
        }
        queue.current.remove(event.eventId);
        blockedRef.current = false;
        recoveringRef.current = false;
        if (mounted.current) { setBlocked(false); setRecovering(false); }
        showState(result);
        if (mounted.current) { setError(queue.current.rejectedSize ? '部分敲击因发愿或轮次已删除而无法同步，记录已保留' : ''); }
      }
    } catch (failure) {
      if (mounted.current) {
        setError(`${failure instanceof Error ? failure.message : '敲击尚未同步'}${queue.current.size ? '，敲击尚未同步' : ''}`);
      }
      if (retryable && queue.current.size) retry.current = setTimeout(flush, 1500);
    } finally {
      sending.current = false;
    }
  }

  useEffect(() => {
    mounted.current = true;
    try {
      queue.current = new PendingQueue(window.localStorage, `${storageNamespace}:pending-practice-taps`);
      recoveringRef.current = queue.current.size > 0;
      if (queue.current.rejectedSize) setError('部分敲击因发愿或轮次已删除而无法同步，记录已保留');
    } catch {
      setError('无法读取待同步敲击，请检查浏览器存储设置');
      return;
    }
    setRecovering(recoveringRef.current);
    showState(initial);
    void flush();
    const refresh = async () => {
      if (queue.current.size) return;
      const timeZone = encodeURIComponent(loadSettings().timeZone);
      const response = await fetch(`/api/practice-session?timeZone=${timeZone}`);
      if (response.ok) {
        const saved = await response.json() as PracticeSessionState;
        if (!queue.current.size) showState(saved);
      }
    };
    const resume = () => { if (!document.hidden) { void refresh().catch(() => setError('无法刷新发愿进度')); void flush(); } };
        const storageChanged = (event: StorageEvent) => {
          if (!event.key?.startsWith(`${storageNamespace}:pending-practice-taps:`)) return;
          if (queue.current.size) void flush();
          else void refresh().catch(() => setError('无法刷新发愿进度'));
        };
    let midnight: ReturnType<typeof setTimeout>;
    const armMidnight = () => {
      midnight = setTimeout(() => { void refresh().catch(() => setError('无法刷新发愿进度')); armMidnight(); }, msUntilNextDay(new Date(), loadSettings().timeZone));
    };
    armMidnight();
    const leaving = (event: BeforeUnloadEvent) => {
      if (queue.current.size) { event.preventDefault(); event.returnValue = ''; }
    };
    const navigating = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest('a[href]');
      if (anchor && queue.current.size && !blockedRef.current && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
        setError('敲击正在同步，请稍后离开');
      }
    };
    window.addEventListener('beforeunload', leaving);
    document.addEventListener('click', navigating, true);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('storage', storageChanged);
    return () => {
      mounted.current = false;
      clearTimeout(midnight);
      clearTimeout(retry.current);
      window.removeEventListener('beforeunload', leaving);
      document.removeEventListener('click', navigating, true);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('storage', storageChanged);
    };
  }, []);

  const run = session.active;
  if (!run) return null;
  const practice = run.items[run.index];
  const tap = () => {
    const active = current.current.active;
    if (!active || active.completed || recoveringRef.current || blockedRef.current) return;
    const item = active.items[active.index];
    const settings = loadSettings();
    const event = { eventId: crypto.randomUUID(), runId: active.id, itemIndex: active.index,
      date: dateKey(new Date(), settings.timeZone) };
    try {
      queue.current.add(event);
    } catch {
      setError('无法保存敲击，请检查浏览器存储设置');
      return;
    }
    if (settings.soundEnabled) playWoodFish();
    vibrateShort(prefersReducedMotion());
    setCaption({ text: item.prompts[active.count % item.prompts.length] || item.recitation,
      durationMs: settings.captionMs, token: ++token.current });
    const projected = projectPracticeTap(current.current, event);
    current.current = projected;
    setSession(projected);
    onStateChange(projected);
    void flush();
  };

  return (
    <section className="chant-center" aria-label="当前发愿">
      <div className="fish-stage">
        <div className="chant-caption" aria-live="off">{caption && <Caption key={caption.token} data={caption} />}</div>
        <WoodenFish onTap={tap} disabled={run.completed || recovering || blocked} />
      </div>
      {!run.completed && <div className="count-row" aria-label={`今日 ${practice?.today_total ?? 0} 声，累计 ${practice?.personal_total ?? 0} 声`}>
        <span className="count-row-label">今日</span>
        <span className="count-row-num count-row-today">{(practice?.today_total ?? 0).toLocaleString()}</span>
        <span className="count-row-sep">/</span>
        <span className="count-row-label">累计</span>
        <span className="count-row-num count-row-total">{(practice?.personal_total ?? 0).toLocaleString()}</span>
        <span className="count-row-label">声</span>
      </div>}
      {run.completed && <Link href="/practice-collections" className="secondary-button">我的发愿集</Link>}

      {recovering && <p role="status">正在同步之前的敲击</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      {blocked && <Link href="/practice-collections" className="secondary-button">返回发愿集</Link>}
    </section>
  );
}
