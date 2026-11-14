'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { storageNamespace } from '@/lib/brand';
import {
  applyServerSnapshot,
  applyServerTotals,
  createState,
  tap,
  type CounterState,
  type TapRequest,
} from '@/lib/counter-store';
import { RetryQueue } from '@/lib/storage';
import { dateKey, msUntilNextDay } from '@/lib/time';
import {
  defaultSettings,
  effectiveCaptionMs,
  loadCaptionOverrides,
  loadSettings,
  type Settings,
} from '@/lib/settings';
import {
  playWoodFish,
  prefersReducedMotion,
  shouldPlaySound,
  shouldVibrate,
  vibrateShort,
} from '@/lib/sound';
import type { Counter } from '@/lib/types';
import type { CaptionData } from './Caption';

const RETRY_DELAY_MS = 2000;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : '操作失败';
}

function nextCaptionText(counter: Counter, today: number): string {
  let prompts: string[] = [];
  try { prompts = JSON.parse(counter.prompts || '[]') as string[]; } catch { prompts = []; }
  const list = prompts.filter((text) => text.trim());
  if (list.length) return list[Math.abs(today) % list.length];
  return counter.caption || counter.name;
}

export function useChant() {
  const [counters, setCounters] = useState<Counter[]>([]);
  const [states, setStates] = useState<Record<string, CounterState>>({});
  const [caption, setCaption] = useState<CaptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const countersRef = useRef<Counter[]>([]);
  const statesRef = useRef<Record<string, CounterState>>({});
  const settingsRef = useRef<Settings>(defaultSettings());
  const overridesRef = useRef<Record<string, number>>({});
  const retryRef = useRef(new RetryQueue());
  const storageReady = useRef(false);
  const inFlight = useRef(new Set<string>());
  const refreshSequence = useRef(0);
  const stateVersion = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captionToken = useRef(0);

  function commitCounters(next: Counter[]) {
    countersRef.current = next;
    setCounters(next);
  }

  function commitStates(next: Record<string, CounterState>) {
    statesRef.current = next;
    setStates(next);
  }

  // 服务端响应校正显示（函数式更新，避免闭包拿到旧 state）。
  function reconcile(counterId: string, res: { total: number; today: number; today_date: string }) {
    const cur = statesRef.current[counterId] ?? createState(res.today_date);
    commitStates({ ...statesRef.current, [counterId]: applyServerTotals(cur, res) });
  }

  // 短退避定时重试：失败请求沿用同一 event_id 重发（幂等，不重复累加）。
  function scheduleRetry() {
    if (retryTimer.current) return;
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      drainRetry();
    }, RETRY_DELAY_MS);
  }

  function drainRetry() {
    const items = retryRef.current.values();
    for (const it of items) void send(it.counterId, { eventId: it.eventId, date: it.date });
  }

  async function send(counterId: string, req: TapRequest): Promise<void> {
    if (inFlight.current.has(req.eventId)) return;
    inFlight.current.add(req.eventId);
    try {
      const res = await api.reportTap(counterId, { event_id: req.eventId, date: req.date });
      retryRef.current.remove(req.eventId);
      stateVersion.current += 1;
      reconcile(counterId, res);
      if (!retryRef.current.values().some((item) => item.counterId === counterId)) {
        void refreshCounts().catch(() => undefined);
      }
    } catch {
      scheduleRetry();
    } finally {
      inFlight.current.delete(req.eventId);
    }
  }

  async function refreshCounts(): Promise<void> {
    const sequence = ++refreshSequence.current;
    const version = stateVersion.current;
    const { counters: list } = await api.listCounters();
    if (sequence !== refreshSequence.current) return;
    commitCounters(list);
    const date = dateKey(new Date(), loadSettings().timeZone);
    const pending = new Set(retryRef.current.values().map((item) => item.counterId));
    const next = { ...statesRef.current };
    for (const counter of list) {
      const state = applyServerSnapshot(next[counter.id], counter, date, version === stateVersion.current, pending.has(counter.id));
      if (state) next[counter.id] = state;
    }
    commitStates(next);
  }

  // 初始化：设置 / 计数器列表（服务端权威）。不再有 localStorage 对账 / 补推遗留 pending。
  useEffect(() => {
    const s = loadSettings();
    settingsRef.current = s;
    overridesRef.current = loadCaptionOverrides();
    try {
      retryRef.current = new RetryQueue(window.localStorage, `${storageNamespace}:pending-taps`);
      retryRef.current.values();
      storageReady.current = true;
    } catch {
      setError('无法读取待同步敲击，请检查浏览器存储设置');
    }
    void refreshCounts()
      .then(() => { if (storageReady.current) drainRetry(); })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
          void refreshCounts().catch(() => undefined);
      drainRetry();
    };
    document.addEventListener('visibilitychange', onVisibility);

    let midnightTimer: ReturnType<typeof setTimeout>;
    const armMidnight = () => {
      midnightTimer = setTimeout(() => {
        void refreshCounts().catch(() => undefined);
        armMidnight();
      }, msUntilNextDay(new Date(), settingsRef.current.timeZone));
    };
    armMidnight();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(midnightTimer);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTap(counter: Counter) {
    if (!storageReady.current) {
      setError('无法保存敲击，请检查浏览器存储设置');
      return;
    }
    settingsRef.current = loadSettings();
    const date = dateKey(new Date(), settingsRef.current.timeZone);

    // 乐观 +1 立即刷新 UI（不等待网络），每次点击生成一个全新 event_id 的上报请求。
    const cur = statesRef.current[counter.id] ?? createState(date);
    const { state, request } = tap(cur, date);
    try {
      retryRef.current.add(counter.id, request);
    } catch {
      setError('无法保存敲击，请检查浏览器存储设置');
      return;
    }
    stateVersion.current += 1;
    commitStates({ ...statesRef.current, [counter.id]: state });

    // 字幕：保持现有行为（文案取计数器字幕，为空取佛号名；时长全局 + 每项目覆盖）。
    captionToken.current += 1;
    setCaption({
      text: nextCaptionText(counter, statesRef.current[counter.id]?.today ?? 0),
      durationMs: effectiveCaptionMs(overridesRef.current, counter.id, settingsRef.current.captionMs),
      token: captionToken.current,
    });

    // playWoodFish / vibrateShort 内部 try/catch 静默，绝不阻塞计数。
    const globalOn = settingsRef.current.soundEnabled;
    const reduced = prefersReducedMotion();
    if (shouldPlaySound(globalOn)) playWoodFish();
    if (shouldVibrate(globalOn, reduced)) vibrateShort(reduced);

    // 每次点击立即一次 POST（delta=1）；顺带触发一次失败队列重试。
    void send(counter.id, request);
    if (retryRef.current.size > 0) drainRetry();
  }

  return { counters, states, caption, loading, error, handleTap, refreshCounts };
}
