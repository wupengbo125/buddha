'use client';

// 从 v1 HomeClient 抽出的念佛计数逻辑（原样保留）：
// 即时 +1、满 5 推远端、随机 event_id 幂等、尾数 30s / 离开页面兜底补推、跨零点当日归零总数不变。
// 去掉了 device_id、增删改、设置写入（这些归其它页面）；念佛页只读设置。

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import {
  confirmFlushed,
  flushPayloads,
  needsFlush,
  newEventId,
  rollover,
  tap,
  type CounterState,
} from '@/lib/counter-store';
import { dateKey, msUntilNextDay } from '@/lib/time';
import {
  defaultSettings,
  effectiveCaptionMs,
  FLUSH_INTERVAL_MS,
  loadCaptionOverrides,
  loadSettings,
  type Settings,
} from '@/lib/settings';
import { loadStates, reconcileStates, saveStates } from '@/lib/storage';
import type { Counter } from '@/lib/types';
import type { CaptionData } from './Caption';

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
  const todayRef = useRef('');
  const inFlight = useRef<Record<string, boolean>>({});
  const captionToken = useRef(0);

  const commitCounters = useCallback((next: Counter[]) => {
    countersRef.current = next;
    setCounters(next);
  }, []);

  const commitStates = useCallback((next: Record<string, CounterState>) => {
    statesRef.current = next;
    setStates(next);
    saveStates(next);
  }, []);

  // 推送单个计数器的所有 pending 批次：每批带自己的 date 与随机 event_id。
  // 重试沿用同一 event_id（服务端按 event_id 幂等），只有服务端明确确认本批次才清对应 pending。
  const flush = useCallback(
    async (counterId: string) => {
      const state = statesRef.current[counterId];
      if (!state || !needsFlush(state) || inFlight.current[counterId]) return;
      inFlight.current[counterId] = true;
      const batches = flushPayloads(state);
      try {
        for (const batch of batches) {
          const res = await api.reportTap(counterId, {
            event_id: batch.eventId,
            delta: batch.delta,
            date: batch.date,
          });
          // 仅当响应确系本批次（新应用 applied=true，或同 id 重发 applied=false）才清 pending；
          // 否则保守保留，绝不无条件清，避免吞计数。
          if (res.event_id !== batch.eventId) continue;
          const current = statesRef.current[counterId];
          if (!current) break;
          commitStates({
            ...statesRef.current,
            [counterId]: confirmFlushed(current, [batch], newEventId, res.total),
          });
        }
      } catch {
        // 失败：pending 与原 event_id 原样保留，交给兜底定时器 / 下次进入页面重试（同 id 重发幂等）
      } finally {
        inFlight.current[counterId] = false;
      }
    },
    [commitStates],
  );

  // 初始化：设置 / 计数器列表；对齐本地状态；补推上次遗留的 pending
  useEffect(() => {
    const s = loadSettings();
    settingsRef.current = s;
    overridesRef.current = loadCaptionOverrides();
    const today = dateKey(new Date(), s.timeZone);
    todayRef.current = today;

    (async () => {
      try {
        const { counters: list } = await api.listCounters();
        const merged = reconcileStates(list, loadStates(), today);
        commitCounters(list);
        commitStates(merged);
        for (const id of Object.keys(merged)) {
          if (needsFlush(merged[id])) void flush(id);
        }
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [commitCounters, commitStates, flush]);

  // 兜底：30s 补推 + 复核跨零点、零点 setTimeout、离开页面补推（localStorage 兜底不丢）
  useEffect(() => {
    const flushAll = () => {
      for (const id of Object.keys(statesRef.current)) void flush(id);
    };
    const rolloverIfNeeded = () => {
      const d = dateKey(new Date(), settingsRef.current.timeZone);
      if (d === todayRef.current) return;
      todayRef.current = d;
      const next: Record<string, CounterState> = {};
      for (const [id, st] of Object.entries(statesRef.current)) next[id] = rollover(st, d);
      commitStates(next);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushAll();
    };
    const onBeforeUnload = () => flushAll();

    const interval = setInterval(() => {
      rolloverIfNeeded();
      flushAll();
    }, FLUSH_INTERVAL_MS);

    let midnightTimer: ReturnType<typeof setTimeout>;
    const armMidnight = () => {
      midnightTimer = setTimeout(() => {
        rolloverIfNeeded();
        armMidnight();
      }, msUntilNextDay(new Date(), settingsRef.current.timeZone));
    };
    armMidnight();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      clearInterval(interval);
      clearTimeout(midnightTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [flush, commitStates]);

  const handleTap = useCallback(
    (counter: Counter) => {
      const state = statesRef.current[counter.id];
      if (!state) return;
      const date = dateKey(new Date(), settingsRef.current.timeZone);
      todayRef.current = date;
      const result = tap(state, date);
      commitStates({ ...statesRef.current, [counter.id]: result.state });
      captionToken.current += 1;
      setCaption({
        text: counter.caption || counter.name,
        durationMs: effectiveCaptionMs(overridesRef.current, counter.id, settingsRef.current.captionMs),
        token: captionToken.current,
      });
      if (result.push) void flush(counter.id);
    },
    [commitStates, flush],
  );

  return { counters, states, caption, loading, error, handleTap };
}
