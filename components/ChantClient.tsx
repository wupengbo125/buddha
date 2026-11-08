'use client';

import { useMemo, useState } from 'react';
import { createState } from '@/lib/counter-store';
import type { Counter } from '@/lib/types';
import { Caption } from './Caption';
import { WoodenFish } from './WoodenFish';
import { useChant } from './useChant';

/** 念佛页：佛号主视觉 + 大木鱼点按 + 当日/总数 + 字幕。无任何设置 / 添加 / 卡片网格。 */
export function ChantClient() {
  const { counters, states, caption, loading, error, handleTap } = useChant();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected: Counter | null = useMemo(() => {
    if (counters.length === 0) return null;
    return counters.find((c) => c.id === selectedId) ?? counters[0];
  }, [counters, selectedId]);

  const state = selected ? states[selected.id] ?? createState('') : null;

  return (
    <main className="relative flex flex-1 flex-col items-center px-5 pb-24 pt-4 md:pb-10">
      {/* 佛号切换：顶部横向 chip，选中态檀木色细边，不是卡片网格 */}
      {counters.length > 1 && (
        <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 md:justify-center">
          {counters.map((c) => {
            const on = selected?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={`tap-press shrink-0 rounded-full border px-4 py-2 text-sm tracking-wide transition-colors ${
                  on ? 'border-accent text-accent' : 'border-line text-muted'
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted">加载中…</div>
      ) : !selected ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-8">
          <p className="text-center text-muted">还没有佛号，请到「添加」页添加一个</p>
          <WoodenFish onTap={() => undefined} disabled />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-10">
          {/* 佛号主视觉：大字、墨色、字距舒展、权重 600 */}
          <h1 className="text-center text-[30px] font-semibold leading-snug tracking-[0.3em] text-ink sm:text-[40px]">
            {selected.name}
          </h1>

          {/* 大木鱼点按主体 */}
          <WoodenFish onTap={() => handleTap(selected)} />

          {/* 计数：字号次之，不抢主体 */}
          <p className="text-base tracking-wide text-ink-soft">
            今日 <span className="text-2xl font-semibold tabular-nums text-accent">{state?.today ?? 0}</span> 声
            <span className="mx-3 text-muted">/</span>
            累计 <span className="text-2xl font-semibold tabular-nums text-ink">{state?.total ?? 0}</span> 声
          </p>
        </div>
      )}

      {error && <p className="mt-4 text-center text-sm text-danger">{error}</p>}

      {caption && <Caption key={caption.token} data={caption} />}
    </main>
  );
}
