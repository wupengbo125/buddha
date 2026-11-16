'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Plus, Volume2, VolumeX } from 'lucide-react';
import { createState } from '@/lib/counter-store';
import { storageNamespace } from '@/lib/brand';
import { loadSettings, saveSettings } from '@/lib/settings';
import { dateKey } from '@/lib/time';
import { Caption } from './Caption';
import { WoodenFish } from './WoodenFish';
import { ChantCounts } from './ChantCounts';
import { ChantReporter, type PendingChantReport } from '@/lib/chant-report';
import { useChant } from './useChant';
import { useChantSession } from './useChantSession';

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
  const { counters, states, caption, loading, error, feedbackTap, refreshCounts } = useChant();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

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
  // 次数模式：同一套会话骨架，攒满「最少坚持」声上报一批，零头作废。
  const isTime = selected?.target_kind === 'time';
  const idleSeconds = Math.min(60, Math.max(1, selected?.idle_seconds ?? 10));
  const baseToday = state?.today ?? 0;
  const baseTotal = state?.total ?? 0;
  // 待上报批次按 eventId 聚合（声/秒），先本地加上立刻显示；只有服务端确认后才清掉对应增量，失败重试期间一直显示。
  const [pending, setPending] = useState<Record<string, PendingChantReport>>({});
  const reporterRef = useRef<ChantReporter | null>(null);
  const [syncError, setSyncError] = useState('');
  const pendingFor = (counterId: string) => Object.values(pending)
    .filter((report) => report.counterId === counterId)
    .reduce((sum, report) => sum + report.amount, 0);
  const shownToday = baseToday + pendingFor(selected?.id ?? '');
  const shownTotal = baseTotal + pendingFor(selected?.id ?? '');

  // 可靠上报：待报队列持久化 + 失败按同一 event_id 重试 + 关闭/隐藏页面拦截未同步数据。
  useEffect(() => {
    let reporter: ChantReporter;
    try {
      reporter = new ChantReporter(window.localStorage, `${storageNamespace}:pending-chant-reports`);
      reporterRef.current = reporter;
    } catch {
      setSyncError('无法读取待同步记录，请检查浏览器存储设置');
      return;
    }
    const drop = (eventId: string) => setPending((value) => {
      if (!(eventId in value)) return value;
      const next = { ...value };
      delete next[eventId];
      return next;
    });
    const unsubscribe = reporter.subscribe((event) => {
      if (event.type === 'confirmed') {
        drop(event.report.eventId);
        void refreshCounts();
        setSyncError('');
      } else if (event.type === 'rejected') {
        drop(event.report.eventId);
        setSyncError('部分记录因无效被丢弃');
      } else if (event.type === 'retry') {
        setSyncError('部分念诵尚未同步，正在重试…');
      } else {
        setSyncError('');
      }
    });
    void reporter.flush();
    const leaving = (event: BeforeUnloadEvent) => {
      if (reporter.size) { event.preventDefault(); event.returnValue = ''; }
    };
    const resume = () => { if (document.visibilityState === 'visible') void reporter.flush(); };
    window.addEventListener('beforeunload', leaving);
    document.addEventListener('visibilitychange', resume);
    return () => {
      unsubscribe();
      reporter.stop();
      reporterRef.current = null;
      window.removeEventListener('beforeunload', leaving);
      document.removeEventListener('visibilitychange', resume);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 阈值与时长模式同一个参数：时长=最少坚持秒数，次数=最少坚持声数。
  const minSeconds = Math.max(60, selected?.min_seconds ?? 300);
  const tapBatch = Math.max(1, selected?.min_seconds ?? 100);

  const timeZone = loadSettings().timeZone;
  const enqueue = (counterId: string, path: 'minutes' | 'taps', amount: number) => {
    const reportId = `${path}-${counterId}-${Date.now()}-${amount}`;
    const report: PendingChantReport = {
      eventId: reportId,
      counterId,
      path,
      amount,
      date: dateKey(new Date(), timeZone),
    };
    setPending((value) => ({ ...value, [reportId]: report }));
    reporterRef.current?.add(report);
  };
  const reportMinutes = (minutes: number) => {
    if (!selected || minutes <= 0) return;
    enqueue(selected.id, 'minutes', minutes);
  };
  const reportTaps = (taps: number) => {
    if (!selected || taps <= 0) return;
    enqueue(selected.id, 'taps', taps);
  };

  const chant = useChantSession({
    idleSeconds,
    threshold: isTime ? minSeconds : tapBatch,
    counted: !isTime,
    onBatch: (batch) => (isTime ? reportMinutes(batch) : reportTaps(batch)),
  });

  // 时长模式：秒针走动每秒刷新 + 判断分钟上报。
  const [, setClock] = useState(0);
  useEffect(() => {
    chant.discard();
    setClock((value) => value + 1);
    if (!isTime) return;
    const clock = setInterval(() => {
      setClock((value) => value + 1);
      chant.evaluate(chant.seconds());
    }, 500);
    return () => clearInterval(clock);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTime, idleSeconds, minSeconds, selected?.id]);

  // 本次：时间模式=真实流动的秒数；次数模式=本次已敲的声数。
  const sessionSeconds = chant.paused ? 0 : chant.seconds();

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
          {selected?.title || ''}
        </span>
        <button type="button" className="icon-button" onClick={toggleSound}
          aria-label={soundEnabled ? '关闭全部音效' : '开启全局音效'}
          title={soundEnabled ? '关闭全部音效' : '开启全局音效'} aria-pressed={!soundEnabled}>
          {soundEnabled ? <Volume2 size={21} /> : <VolumeX size={21} />}
        </button>
      </header>

      {loading ? <div className="empty-state" role="status">正在载入...</div> : !selected ? (
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
                chant.tap();
                feedbackTap(selected, chant.taps);
                chant.evaluate(chant.seconds());
              }} />
            </div>
            {isTime ? (
              <ChantCounts
                main={mins(sessionSeconds)}
                today={hm(shownToday)}
                total={hm(shownTotal)}
                paused={chant.paused}
                progress={(selected.target_seconds ?? 0) > 0 ? (shownTotal / (selected.target_seconds ?? 1)) * 100 : null}
              />
            ) : (
              <ChantCounts
                main={chant.taps.toLocaleString()}
                today={shownToday.toLocaleString()}
                total={shownTotal.toLocaleString()}
                unit=" 声"
                paused={chant.paused}
                progress={selected.target ? (shownTotal / selected.target) * 100 : null}
              />
            )}
          </div>
        </>
      )}
      {(error || syncError) && <p className="error-message" role="alert">{error || syncError}</p>}
    </main>
  );
}