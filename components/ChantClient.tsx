'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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

// 时间模式统一按整分钟展示，不带冒号：本次 X 分，今日/累计 X 分（满 60 分进成 X 时 X 分）。
function mins(seconds: number): string {
  return `${Math.floor(Math.max(0, seconds) / 60)} 分`;
}

function hm(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(total / 60);
  return hours > 0 ? `${hours} 时 ${total % 60} 分` : `${total} 分`;
}

export function ChantClient() {
  const { counters, states, caption, loading, error, handleTap, feedbackTap, refreshCounts } = useChant();
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

  // 时长模式：本次是真实流动的时间；敲击只判断超时是否清零、满一分钟是否上报；今日/累计只显示已上报的整分钟。
  const isTime = selected?.target_kind === 'time';
  const idleSeconds = Math.min(60, Math.max(1, selected?.idle_seconds ?? 10));
  const baseToday = state?.today ?? 0;
  const baseTotal = state?.total ?? 0;
  
  const [paused, setPaused] = useState(true);
  const [, setClock] = useState(0);
  // startAt：本次真实起点（null = 本次没有在走）；reported：本次已上报的整分钟数。
  const session = useRef<{ startAt: number | null; lastTapAt: number | null; reported: number; seq: number }>({ startAt: null, lastTapAt: null, reported: 0, seq: 0 });

  const track = () => (session.current.startAt === null ? 0 : (Date.now() - session.current.startAt) / 1000);
  const minSeconds = Math.max(60, selected?.min_seconds ?? 300);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reportMinutes = (minutes: number) => {
    if (!selected || minutes <= 0) return;
    session.current.seq += 1;
    const local = new Date();
    const date = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    const eventId = `min-${selected.id}-${session.current.seq}-${Date.now()}`;
    void fetch(`/api/counters/${selected.id}/minutes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId, minutes, date }),
    })
      .then((res) => { if (res.ok) void refreshCounts(); })
      .catch(() => undefined);
  };

  // 本次时间正常流动，界面每秒刷新；这里不做任何累计逻辑。
  useEffect(() => {
    session.current = { startAt: null, lastTapAt: null, reported: 0, seq: 0 };
    setPaused(true);
    setClock((value) => value + 1);
    if (!isTime) return;
    const clock = setInterval(() => setClock((value) => value + 1), 500);
    return () => clearInterval(clock);
  }, [isTime, idleSeconds, minSeconds, selected?.id]);

  // 敲击：只判断间隔是否超时；没超时就看本次满了几分钟、要不要上报。
  const tapSettle = () => {
    const now = Date.now();
    if (timerRef.current) clearTimeout(timerRef.current);
    // 超时看的是「距上一次敲击」，不是距本次开始。
    const gap = session.current.lastTapAt === null ? Infinity : now - session.current.lastTapAt;
    if (session.current.startAt === null || gap > idleSeconds * 1000) {
      // 本次还没开始，或隔太久才敲：本次整段作废，从现在重新开始。
      session.current = { startAt: now, lastTapAt: now, reported: 0, seq: session.current.seq };
    } else {
      session.current.lastTapAt = now;
    }
    const elapsed = track();
    if (elapsed >= minSeconds) {
      const whole = Math.floor(elapsed / 60);
      if (whole > session.current.reported) {
        const delta = whole - session.current.reported;
        session.current.reported = whole;
        reportMinutes(delta);
      }
    }
    setPaused(false);
    // 到点没有敲击：直接停表、本次清零。
    timerRef.current = setTimeout(() => {
      session.current = { startAt: null, lastTapAt: null, reported: 0, seq: session.current.seq };
      setPaused(true);
    }, idleSeconds * 1000);
  };

  // 本次：真实流动的秒数。
  const sessionSeconds = paused ? 0 : track();

  // 页面被隐藏 / 关闭：未上报的本地累计直接作废。
  useEffect(() => {
    const drop = () => {
      session.current = { startAt: null, lastTapAt: null, reported: 0, seq: session.current.seq };
      if (timerRef.current) clearTimeout(timerRef.current);
      setPaused(true);
    };
    const onHidden = () => { if (document.visibilityState === 'hidden') drop(); };
    window.addEventListener('pagehide', drop);
    document.addEventListener('visibilitychange', onHidden);
    return () => { window.removeEventListener('pagehide', drop); document.removeEventListener('visibilitychange', onHidden); };
  }, [idleSeconds]);

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
              <WoodenFish onTap={() => {
                // 时长模式只走本地计时与分钟上报，不发 /taps；但音效弹幕照常。
                if (isTime) {
                  tapSettle();
                  feedbackTap(selected);
                } else handleTap(selected);
              }} />
            </div>
            {isTime ? (
              <div className={`count-row ${paused ? 'count-row-paused' : ''}`} aria-label={`本次 ${mins(sessionSeconds)}，今日 ${hm(baseToday)}，累计 ${hm(baseTotal)}`}>
                <span className="count-row-label">本次</span>
                <span className="count-row-num count-row-today">{mins(sessionSeconds)}</span>
                <span className="count-row-sub">今日 {hm(baseToday)} · 累计 {hm(baseTotal)}</span>
              </div>
            ) : (
              <div className="count-row" aria-label={`今日 ${state?.today ?? 0} 声，累计 ${state?.total ?? 0} 声`}>
                <span className="count-row-label">今日</span>
                <span className="count-row-num count-row-today">{(state?.today ?? 0).toLocaleString()}</span>
                <span className="count-row-sep">/</span>
                <span className="count-row-label">累计</span>
                <span className="count-row-num count-row-total">{(state?.total ?? 0).toLocaleString()}</span>
                <span className="count-row-label">声</span>
              </div>
            )}
            {isTime && (selected.target_seconds ?? 0) > 0 ? <div className="count-progress" aria-label={`累计 ${hm(baseTotal)} / 目标 ${hm(selected.target_seconds ?? 0)}`}><div className="count-progress-track"><i style={{ width: `${Math.min(100, (baseTotal / (selected.target_seconds ?? 1)) * 100)}%` }} /></div></div>
            : !isTime && selected.target ? <div className="count-progress" aria-label={`累计 ${state?.total ?? 0} / 目标 ${selected.target}`}><div className="count-progress-track"><i style={{ width: `${Math.min(100, ((state?.total ?? 0) / selected.target) * 100)}%` }} /></div></div> : null}
          </div>
        </>
      )}
      {error && <p className="error-message" role="alert">{error}</p>}
      {syncError && <p className="error-message" role="alert">{syncError}</p>}
    </main>
  );
}