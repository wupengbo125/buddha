'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Plus, Volume2, VolumeX } from 'lucide-react';
import { createState } from '@/lib/counter-store';
import { siteName, storageNamespace } from '@/lib/brand';
import { loadSettings, saveSettings } from '@/lib/settings';
import { Caption } from './Caption';
import { WoodenFish } from './WoodenFish';
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
  // 次数模式：同一套会话骨架，攒满 100 声上报一批，零头作废。
  const isTime = selected?.target_kind === 'time';
  const idleSeconds = Math.min(60, Math.max(1, selected?.idle_seconds ?? 10));
  const baseToday = state?.today ?? 0;
  const baseTotal = state?.total ?? 0;
  // 先本地加上、立刻显示，再慢慢传给服务端：上报成功刷新后清掉本地增量，观感无延迟。
  const [pending, setPending] = useState({ today: 0, total: 0 });
  const shownToday = baseToday + pending.today;
  const shownTotal = baseTotal + pending.total;
  useEffect(() => { setPending({ today: 0, total: 0 }); }, [selected?.id]);
  // 阈值与时长模式同一个参数：时长=最少坚持秒数，次数=最少坚持声数。
  const minSeconds = Math.max(60, selected?.min_seconds ?? 300);
  const tapBatch = Math.max(1, selected?.min_seconds ?? 100);

  const dateNow = () => {
    const local = new Date();
    return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
  };

  const reportMinutes = (minutes: number) => {
    if (!selected || minutes <= 0) return;
    setPending((value) => ({ today: value.today + minutes * 60, total: value.total + minutes * 60 }));
    void fetch(`/api/counters/${selected.id}/minutes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: `min-${selected.id}-${Date.now()}-${minutes}`, minutes, date: dateNow() }),
    })
      .then((res) => (res.ok ? refreshCounts().then(() => setPending({ today: 0, total: 0 })) : setPending({ today: 0, total: 0 })))
      .catch(() => setPending({ today: 0, total: 0 }));
  };

  const reportTaps = (taps: number) => {
    if (!selected || taps <= 0) return;
    setPending((value) => ({ today: value.today + taps, total: value.total + taps }));
    void fetch(`/api/counters/${selected.id}/taps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: `taps-${selected.id}-${Date.now()}-${taps}`, delta: taps, date: dateNow() }),
    })
      .then((res) => (res.ok ? refreshCounts().then(() => setPending({ today: 0, total: 0 })) : setPending({ today: 0, total: 0 })))
      .catch(() => setPending({ today: 0, total: 0 }));
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
                feedbackTap(selected, isTime ? 0 : chant.taps);
                chant.evaluate(chant.seconds());
              }} />
            </div>
            {isTime ? (
              <div className={`count-row ${chant.paused ? 'count-row-paused' : ''}`} aria-label={`本次 ${mins(sessionSeconds)}，今日 ${hm(shownToday)}，累计 ${hm(shownTotal)}`}>
                <span className="count-row-label">本次</span>
                <span className="count-row-num count-row-today">{mins(sessionSeconds)}</span>
                <span className="count-row-sub">今日 {hm(shownToday)} · 累计 {hm(shownTotal)}</span>
              </div>
            ) : (
              <div className={`count-row ${chant.paused ? 'count-row-paused' : ''}`} aria-label={`本次 ${chant.taps} 声，今日 ${shownToday} 声，累计 ${shownTotal} 声`}>
                <span className="count-row-label">本次</span>
                <span className="count-row-num count-row-today">{chant.taps.toLocaleString()}</span>
                <span className="count-row-sub">今日 {shownToday.toLocaleString()} · 累计 {shownTotal.toLocaleString()} 声</span>
              </div>
            )}
            {isTime && (selected.target_seconds ?? 0) > 0 ? <div className="count-progress" aria-label={`累计 ${hm(shownTotal)} / 目标 ${hm(selected.target_seconds ?? 0)}`}><div className="count-progress-track"><i style={{ width: `${Math.min(100, (shownTotal / (selected.target_seconds ?? 1)) * 100)}%` }} /></div></div>
            : !isTime && selected.target ? <div className="count-progress" aria-label={`累计 ${shownTotal} / 目标 ${selected.target}`}><div className="count-progress-track"><i style={{ width: `${Math.min(100, (shownTotal / selected.target) * 100)}%` }} /></div></div> : null}
          </div>
        </>
      )}
      {error && <p className="error-message" role="alert">{error}</p>}
    </main>
  );
}