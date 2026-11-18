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
import { ChantReporter, reportDisplayAmount, type PendingChantReport } from '@/lib/chant-report';
import { attentionDelay } from '@/lib/attention';

// 莲花只出现在木鱼周围的空白处，每次随机，防止肌肉记忆直接点掉。
const ATTENTION_SPOTS = [
  { top: '8%', left: '10%' }, { top: '6%', left: '50%' }, { top: '10%', left: '82%' },
  { top: '46%', left: '5%' }, { top: '46%', left: '88%' },
  { top: '78%', left: '12%' }, { top: '82%', left: '48%' }, { top: '76%', left: '80%' },
];
import { playAttentionChime } from '@/lib/sound';
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
  const attentionLevel = loadSettings().attentionLevel;
  const isTime = selected?.target_kind === 'time';
  const idleSeconds = Math.min(60, Math.max(1, selected?.idle_seconds ?? 10));
  const baseToday = state?.today ?? 0;
  const baseTotal = state?.total ?? 0;
  // 待上报批次按 eventId 聚合（声/秒），先本地加上立刻显示；只有服务端确认后才清掉对应增量，失败重试期间一直显示。
  const [pending, setPending] = useState<Record<string, PendingChantReport>>({});
  const reporterRef = useRef<ChantReporter | null>(null);
  const [syncError, setSyncError] = useState('');
  // 专注提醒：随机 3–5 分钟出现一个点，点掉才继续；出现期间时间/次数冻结。
  const [attention, setAttention] = useState(false);
  const [attentionSpot, setAttentionSpot] = useState(0);
  const nextCheckRef = useRef<number | null>(null);
  const lastChimeRef = useRef(0);
  // 次数模式按每次 2 秒折算，时长模式按分钟×60；否则界面上只加了几秒，看起来没动。
  const pendingFor = (counterId: string) => Object.values(pending)
    .filter((report) => report.counterId === counterId)
    .reduce((sum, report) => sum + reportDisplayAmount(report), 0);
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
        // 先刷新服务端数值再撤掉本地增量，避免中间一帧回退。
        void refreshCounts().then(() => drop(event.report.eventId));
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

  // 专注提醒调度：只在正在念诵时计时；超时停表或提醒未点掉时都不推进。
  useEffect(() => {
    if (!attentionLevel) { nextCheckRef.current = null; if (attention) setAttention(false); return; }
    if (chant.paused) { nextCheckRef.current = null; if (attention) setAttention(false); return; }
    if (attention) return;
    if (nextCheckRef.current === null) {
      const delay = attentionDelay(attentionLevel);
      if (delay === null) return;
      nextCheckRef.current = Date.now() + delay;
    }
    const timer = setInterval(() => {
      if (nextCheckRef.current !== null && Date.now() >= nextCheckRef.current) {
        nextCheckRef.current = null;
        // 莲花出现不再冻结时间：秒表照走，只是不计数、响钵音，防止借机离开。
        setAttentionSpot(Math.floor(Math.random() * ATTENTION_SPOTS.length));
        setAttention(true);
      }
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chant.paused, attention, attentionLevel, selected?.id]);

  const dismissAttention = () => {
    const delay = attentionDelay(attentionLevel);
    nextCheckRef.current = delay === null ? null : Date.now() + delay;
    setAttention(false);
  };

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
              {attention && <button type="button" className="attention-dot" style={ATTENTION_SPOTS[attentionSpot]} aria-label="点一下继续念诵" onClick={dismissAttention}><img src="/lotus.png" width={26} height={26} alt="" draggable={false} /></button>}
              <WoodenFish onTap={() => {
                // 提醒点没点掉：只响一声磬，不计数、不加时，让人立刻发现要回来点。
                if (attention) { if (soundEnabled && Date.now() - lastChimeRef.current > 1200) { lastChimeRef.current = Date.now(); playAttentionChime(); } return; }
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