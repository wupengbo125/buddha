'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Plus, Volume2, VolumeX } from 'lucide-react';
import { createState } from '@/lib/counter-store';
import { siteName, storageNamespace } from '@/lib/brand';
import { loadSettings, saveSettings } from '@/lib/settings';
import { Caption } from './Caption';
import { WoodenFish } from './WoodenFish';
import { useChant } from './useChant';

export function ChantClient() {
  const { counters, states, caption, loading, error, handleTap } = useChant();
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
          {siteName}
        </span>
        <button type="button" className="icon-button" onClick={toggleSound}
          aria-label={soundEnabled ? '关闭全部音效' : '开启全局音效'}
          title={soundEnabled ? '关闭全部音效' : '开启全局音效'} aria-pressed={!soundEnabled}>
          {soundEnabled ? <Volume2 size={21} /> : <VolumeX size={21} />}
        </button>
      </header>

      {loading ? <div className="empty-state" role="status">正在载入佛号...</div> : !selected ? (
        <div className="empty-state">
          <div className="fish-stage"><WoodenFish disabled onTap={() => undefined} /></div>
          <h1 className="page-title text-ink">从一声佛号开始</h1>
          <Link className="primary-button" href="/counters"><Plus size={18} />添加佛号</Link>
        </div>
      ) : (
        <>
          <div className="chant-center">
            <h1 className="chant-title">{selected.name}</h1>
            <div className="chant-caption" aria-live="off">
              {caption && <Caption key={caption.token} data={caption} />}
            </div>
            <div className="fish-stage"><WoodenFish onTap={() => handleTap(selected)} /></div>
            <p className="count-label">今日念诵</p>
            <p className="daily-count" aria-label={`今日 ${state?.today ?? 0} 声`}>{(state?.today ?? 0).toLocaleString()}</p>
          </div>
          <div className="total-count"><span>累计念诵</span><strong>{(state?.total ?? 0).toLocaleString()}</strong><span>声</span></div>
        </>
      )}
      {error && <p className="error-message" role="alert">{error}</p>}
    </main>
  );
}