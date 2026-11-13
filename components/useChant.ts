'use client';

// 念佛计数逻辑 v6：点一次即乐观 +1 并立即 POST 一次，服务端原子累加为唯一权威。
// 计数改每次上传：不再有攒批 / pending 批次 / localStorage 对账 / 兜底定时器整套状态机。
// 失败请求进内存重试队列，沿用同一 event_id 幂等重试；跨零点用轻量零点定时器重拉列表刷新显示。

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import {
  applyServerTotals,
  createState,
  stateFromCounter,
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
    setStates((prev) => {
      const cur = prev[counterId] ?? createState(res.today_date);
      const next = { ...prev, [counterId]: applyServerTotals(cur, res) };
      statesRef.current = next;
      return next;
    });
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
    const items = retryRef.current.drain();
    for (const it of items) void send(it.counterId, { eventId: it.eventId, date: it.date });
  }

  async function send(counterId: string, req: TapRequest): Promise<void> {
    try {
      const res = await api.reportTap(counterId, { event_id: req.eventId, date: req.date });
      reconcile(counterId, res);
    } catch {
      retryRef.current.add(counterId, req);
      scheduleRetry();
    }
  }

  // 轻量重拉列表：服务端为唯一权威。resetDisplay=true 时按服务端值重建计数显示
  // （初始化 / 跨零点归零），false 时只同步音效开关等元数据、不动计数显示。
  // 不引入 pending / localStorage 对账状态机。
  async function refreshFromServer(resetDisplay: boolean): Promise<void> {
    const { counters: list } = await api.listCounters();
    commitCounters(list);
    if (resetDisplay) {
      const next: Record<string, CounterState> = {};
      for (const c of list) next[c.id] = stateFromCounter(c);
      commitStates(next);
    }
  }

  // 初始化：设置 / 计数器列表（服务端权威）。不再有 localStorage 对账 / 补推遗留 pending。
  useEffect(() => {
    const s = loadSettings();
    settingsRef.current = s;
    overridesRef.current = loadCaptionOverrides();
    void refreshFromServer(true)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 重试时机：页面回前台（visibilitychange）+ 跨零点轻量刷新。
  // 重试只靠内存队列 + 短退避定时器，无任何本地持久化对账。
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void refreshFromServer(false).catch(() => undefined); // 同步各计数器音效开关
      drainRetry();
    };
    document.addEventListener('visibilitychange', onVisibility);

    let midnightTimer: ReturnType<typeof setTimeout>;
    const armMidnight = () => {
      midnightTimer = setTimeout(() => {
        void refreshFromServer(true).catch(() => undefined); // 跨零点当日归零显示
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
    settingsRef.current = loadSettings();
    const date = dateKey(new Date(), settingsRef.current.timeZone);

    // 乐观 +1 立即刷新 UI（不等待网络），每次点击生成一个全新 event_id 的上报请求。
    const cur = statesRef.current[counter.id] ?? createState(date);
    const { state, request } = tap(cur, date);
    commitStates({ ...statesRef.current, [counter.id]: state });

    // 字幕：保持现有行为（文案取计数器字幕，为空取佛号名；时长全局 + 每项目覆盖）。
    captionToken.current += 1;
    setCaption({
      text: counter.caption || counter.name,
      durationMs: effectiveCaptionMs(overridesRef.current, counter.id, settingsRef.current.captionMs),
      token: captionToken.current,
    });

    // playWoodFish / vibrateShort 内部 try/catch 静默，绝不阻塞计数。
    const globalOn = settingsRef.current.soundEnabled;
    const reduced = prefersReducedMotion();
    if (shouldPlaySound(globalOn && counter.sound_enabled === 1)) playWoodFish();
    if (shouldVibrate(globalOn, reduced)) vibrateShort(reduced);

    // 每次点击立即一次 POST（delta=1）；顺带触发一次失败队列重试。
    void send(counter.id, request);
    if (retryRef.current.size > 0) drainRetry();
  }

  return { counters, states, caption, loading, error, handleTap };
}
