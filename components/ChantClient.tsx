'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Plus, Volume2, VolumeX } from 'lucide-react';
import { createState } from '@/lib/counter-store';
import { siteName, storageNamespace } from '@/lib/brand';
import { loadSettings, saveSettings } from '@/lib/settings';
import { sendPracticeTap, type PendingPracticeTap } from '@/lib/practice-sync';
import { PendingQueue } from '@/lib/storage';
import { Caption } from './Caption';
import { WoodenFish } from './WoodenFish';
import { useChant } from './useChant';
import { PracticeChant } from './PracticeChant';
import type { PracticeSessionState } from '@/lib/practice-types';

export function ChantClient() {
  const { counters, states, caption, loading, error, handleTap, refreshCounts } = useChant();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [practiceSession, setPracticeSession] = useState<PracticeSessionState | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    let live = true;
    fetch(`/api/practice-session?timeZone=${encodeURIComponent(loadSettings().timeZone)}`)
      .then(async response => {
        if (!response.ok) throw new Error('发愿进度暂时无法载入');
        return response.json();
      })
      .then(result => { if (live) setPracticeSession(result as PracticeSessionState); })
      .catch(failure => { if (live) setSessionError(failure.message); })
      .finally(() => { if (live) setSessionLoading(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (sessionLoading || practiceSession?.active) return;
    let active = true;
    let sending = false;
    let retry: ReturnType<typeof setTimeout>;
    let queue: PendingQueue<PendingPracticeTap>;
    try {
      queue = new PendingQueue(window.localStorage, `${storageNamespace}:pending-practice-taps`);
      queue.values();
      if (queue.rejectedSize) setSyncError('部分敲击因发愿或轮次已删除而无法同步，记录已保留');
    } catch {
      setSyncError('无法读取待同步敲击，请检查浏览器存储设置');
      return;
    }
    const sync = async () => {
      if (sending || !active) return;
      sending = true;
      try {
        while (active && queue.size) {
          const event = queue.values()[0];
          const { response, result } = await sendPracticeTap(queue, event, loadSettings().timeZone);
          if (!response.ok) {
            if (response.status === 410) {
              setSyncError('部分敲击因发愿或轮次已删除而无法同步，记录已保留');
              continue;
            }
            setSyncError(result.error || '发愿敲击尚未同步');
            if (response.status >= 500) retry = setTimeout(sync, 1500);
            return;
          }
          queue.remove(event.eventId);
          if (active && result.active) { setPracticeSession(result); return; }
        }
        if (active) { setSyncError(queue.rejectedSize ? '部分敲击因发愿或轮次已删除而无法同步，记录已保留' : ''); await refreshCounts(); }
      } catch {
        if (active) { setSyncError('发愿敲击尚未同步'); retry = setTimeout(sync, 1500); }
      } finally {
        sending = false;
      }
    };
    if (queue.size) void sync();
    const resume = () => { if (!document.hidden) void sync(); };
    document.addEventListener('visibilitychange', resume);
    return () => { active = false; clearTimeout(retry); document.removeEventListener('visibilitychange', resume); };
  }, [sessionLoading, practiceSession?.active?.id]);

  useEffect(() => {
    setSoundEnabled(loadSettings().soundEnabled);
    const requested = new URLSearchParams(window.location.search).get('counter');
    try {
      const recent = localStorage.getItem(`${storageNamespace}:selected-counter`);
      setSelectedId(requested || recent);
      if (requested) localStorage.setItem(`${storageNamespace}:selected-counter`, requested);
    } catch {
      setSelectedId(requested);
    }
  }, []);

  const selected = counters.find((counter) => counter.id === selectedId) ?? counters[0];
  const state = selected ? states[selected.id] ?? createState('') : null;

  const toggleSound = () => {
    const next = !soundEnabled;
    saveSettings({ ...loadSettings(), soundEnabled: next });
    setSoundEnabled(next);
  };

  return (
    <main className="page chant-page">
      <header className="chant-header">
        <span className="chant-brand flex items-center gap-2">
          <img src="/wooden-fish.png" width={40} height={40} alt="" />
          {practiceSession?.active && !practiceSession.active.completed ? (practiceSession.active.items[practiceSession.active.index]?.name || '') : (selected?.title || '')}
        </span>
        <button type="button" className="icon-button" onClick={toggleSound}
          aria-label={soundEnabled ? '关闭全部音效' : '开启全局音效'}
          title={soundEnabled ? '关闭全部音效' : '开启全局音效'} aria-pressed={!soundEnabled}>
          {soundEnabled ? <Volume2 size={21} /> : <VolumeX size={21} />}
        </button>
      </header>

      {sessionLoading || loading ? <div className="empty-state" role="status">正在载入...</div> : sessionError ? (
        <p className="error-message" role="alert">{sessionError}</p>
      ) : practiceSession?.active ? <PracticeChant initial={practiceSession} onStateChange={setPracticeSession} /> : !selected ? (
        <div className="empty-state">
          <div className="fish-stage"><WoodenFish disabled onTap={() => undefined} /></div>
          <h1 className="page-title text-ink">从一个发愿开始</h1>
          <Link className="primary-button" href="/practices"><Plus size={18} />创建发愿</Link>
        </div>
      ) : (
        <>
          <div className="chant-center">
            <div className="fish-stage">
              <div className="chant-caption" aria-live="off">
                {caption && <Caption key={caption.token} data={caption} />}
              </div>
              <WoodenFish onTap={() => handleTap(selected)} />
            </div>
            <div className="count-row" aria-label={`今日 ${state?.today ?? 0} 声，累计 ${state?.total ?? 0} 声`}>
              <span className="count-row-label">今日</span>
              <span className="count-row-num count-row-today">{(state?.today ?? 0).toLocaleString()}</span>
              <span className="count-row-sep">/</span>
              <span className="count-row-label">累计</span>
              <span className="count-row-num count-row-total">{(state?.total ?? 0).toLocaleString()}</span>
              <span className="count-row-label">声</span>
            </div>
            {selected.target ? <div className="count-progress" aria-label={`累计 ${state?.total ?? 0} / 目标 ${selected.target}`}><div className="count-progress-track"><i style={{ width: `${Math.min(100, ((state?.total ?? 0) / selected.target) * 100)}%` }} /></div></div> : null}
          </div>
        </>
      )}
      {error && <p className="error-message" role="alert">{error}</p>}
      {syncError && <p className="error-message" role="alert">{syncError}</p>}
    </main>
  );
}