'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { siteName, siteSubtitle } from '@/lib/brand';
import { api } from '@/lib/api';
import { getDeviceId } from '@/lib/device';
import {
  confirmFlushed,
  createState,
  flushPayloads,
  needsFlush,
  newEventId,
  rollover,
  tap,
  type CounterState,
} from '@/lib/counter-store';
import { dateKey, msUntilNextDay } from '@/lib/time';
import {
  clampCaptionMs,
  defaultSettings,
  effectiveCaptionMs,
  FLUSH_INTERVAL_MS,
  loadCaptionOverrides,
  loadSettings,
  saveSettings,
  type Settings,
} from '@/lib/settings';
import { loadStates, reconcileStates, saveStates } from '@/lib/storage';
import type { Counter } from '@/lib/types';
import { Caption, type CaptionData } from './Caption';
import { CounterCard } from './CounterCard';
import { SettingsPanel } from './SettingsPanel';

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : '操作失败';
}

export function HomeClient() {
  const [counters, setCounters] = useState<Counter[]>([]);
  const [states, setStates] = useState<Record<string, CounterState>>({});
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [caption, setCaption] = useState<CaptionData | null>(null);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const countersRef = useRef<Counter[]>([]);
  const statesRef = useRef<Record<string, CounterState>>({});
  const settingsRef = useRef<Settings>(defaultSettings());
  const overridesRef = useRef<Record<string, number>>({});
  const deviceIdRef = useRef('');
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
            device_id: deviceIdRef.current,
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

  // 初始化：设备 id / 设置 / 计数器列表；对齐本地状态；补推上次遗留的 pending
  useEffect(() => {
    const deviceId = getDeviceId();
    deviceIdRef.current = deviceId;
    const s = loadSettings();
    settingsRef.current = s;
    setSettings(s);
    overridesRef.current = loadCaptionOverrides();
    const today = dateKey(new Date(), s.timeZone);
    todayRef.current = today;

    (async () => {
      try {
        const { counters: list } = await api.listCounters(deviceId);
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

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      const next: Settings = {
        captionMs: patch.captionMs !== undefined ? clampCaptionMs(patch.captionMs) : settingsRef.current.captionMs,
        timeZone: patch.timeZone !== undefined ? patch.timeZone : settingsRef.current.timeZone,
      };
      settingsRef.current = next;
      setSettings(next);
      saveSettings(next);
      const d = dateKey(new Date(), next.timeZone);
      if (d !== todayRef.current) {
        todayRef.current = d;
        const st: Record<string, CounterState> = {};
        for (const [id, s] of Object.entries(statesRef.current)) st[id] = rollover(s, d);
        commitStates(st);
      }
    },
    [commitStates],
  );

  const addCounter = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError('');
    try {
      const { counter } = await api.createCounter(deviceIdRef.current, name);
      commitCounters([...countersRef.current, counter]);
      commitStates({ ...statesRef.current, [counter.id]: { ...createState(todayRef.current) } });
      setNewName('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const renameCounter = async (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const { counter } = await api.updateCounter(id, { name: trimmed });
      commitCounters(countersRef.current.map((c) => (c.id === id ? counter : c)));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const deleteCounter = async (id: string) => {
    try {
      await api.deleteCounter(id);
      commitCounters(countersRef.current.filter((c) => c.id !== id));
      const st = { ...statesRef.current };
      delete st[id];
      commitStates(st);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
      <header className="mb-5 text-center">
        <h1 className="text-3xl font-bold tracking-wide text-ink">{siteName}</h1>
        <p className="mt-1 text-sm text-muted">{siteSubtitle}</p>
      </header>

      <SettingsPanel settings={settings} onChange={updateSettings} />

      <div className="mt-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void addCounter();
          }}
          placeholder="输入佛号，如 南无阿弥陀佛"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none focus:border-accent"
        />
        <button
          onClick={() => void addCounter()}
          disabled={busy}
          className="tap-press flex items-center gap-1 rounded-xl bg-accent px-5 py-3 font-semibold text-white disabled:opacity-50"
        >
          <Plus size={18} /> 添加
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="mt-10 text-center text-muted">加载中…</p>
      ) : counters.length === 0 ? (
        <p className="mt-10 text-center text-muted">还没有佛号，添加一个开始念佛吧</p>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {counters.map((counter) => (
            <CounterCard
              key={counter.id}
              counter={counter}
              state={states[counter.id] ?? createState(todayRef.current)}
              onTap={() => handleTap(counter)}
              onRename={(name) => void renameCounter(counter.id, name)}
              onDelete={() => void deleteCounter(counter.id)}
            />
          ))}
        </div>
      )}

      {caption && <Caption key={caption.token} data={caption} />}
    </main>
  );
}
