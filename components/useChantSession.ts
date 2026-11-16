'use client';

// 「本次会话」骨架：时长模式与次数模式共用。
// 规则（两种模式同构，只是计量单位不同：时间=秒、次数=声）：
// - 敲击只判一件事：距上一次敲击超过 idleSeconds → 本次整段清零重开（今日/累计不动）；
// - 本次数值达到阈值后按单位上报（时间=每满 1 分钟，次数=每满 threshold 声），已上报的不重复；
// - 到点没有再敲击：停表（本次清零、置灰），用 paused 渲染；
// - 页面隐藏 / 关闭：未上报的本地数值作废。
import { useEffect, useRef, useState } from 'react';

export type ChantSession = {
  /** 敲击：判超时清零 / 续上，返回本次是否重开。 */
  tap: () => void;
  /** 本次已敲的声数（两种模式都记；次数模式还用于计量，时间模式只用于弹幕轮动）。 */
  taps: number;
  /** true = 停表（超时或作废后），渲染置灰。 */
  paused: boolean;
  /** 时间模式：时钟每秒把当前秒数喂进来做上报判断；次数模式在 tap 内部判断。 */
  evaluate: (seconds: number) => void;
  /** 时间模式：本次已流动的真实秒数（停表为 0）。 */
  seconds: () => number;
  /** 丢弃本地零头（切走/关闭时）。 */
  discard: () => void;
};

export function useChantSession(options: {
  idleSeconds: number;
  /** 时间模式=最少坚持秒数；次数模式=每批声数。 */
  threshold: number;
  /** 每满一批回调（时间=分钟数，次数=声数）。 */
  onBatch: (batch: number) => void;
  /** true=次数模式（每敲一下 +1，按 threshold 声上报）。 */
  counted?: boolean;
}): ChantSession {
  const { idleSeconds, threshold, onBatch, counted } = options;
  const ref = useRef({ startAt: null as number | null, lastTapAt: null as number | null, taps: 0, reported: 0 });
  const [paused, setPaused] = useState(true);
  const [, bump] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = () => {
    ref.current = { startAt: null, lastTapAt: null, taps: 0, reported: 0 };
    setPaused(true);
    bump((value) => value + 1);
  };

  const evaluate = (seconds: number) => {
    if (counted) {
      const whole = Math.floor(ref.current.taps / threshold);
      if (whole > ref.current.reported) {
        const batch = (whole - ref.current.reported) * threshold;
        ref.current.reported = whole;
        onBatch(batch);
      }
    } else if (seconds >= threshold) {
      const whole = Math.floor(seconds / 60);
      if (whole > ref.current.reported) {
        const batch = whole - ref.current.reported;
        ref.current.reported = whole;
        onBatch(batch);
      }
    }
  };

  const tap = () => {
    const now = Date.now();
    if (timerRef.current) clearTimeout(timerRef.current);
    const gap = ref.current.lastTapAt === null ? Infinity : now - ref.current.lastTapAt;
    if (ref.current.startAt === null || gap > idleSeconds * 1000) {
      // 本次还没开始，或隔太久才敲：本次整段作废，从现在重新开始。
      ref.current = { startAt: now, lastTapAt: now, taps: 0, reported: 0 };
      setPaused(false);
    } else {
      ref.current.lastTapAt = now;
    }
    // 两种模式都记敲击数：次数模式用于计量/上报，时长模式只用于弹幕按「每一下」轮动。
    ref.current.taps += 1;
    if (counted) evaluate(0);
    bump((value) => value + 1);
    // 到点没有敲击：停表、本次清零。
    timerRef.current = setTimeout(stop, idleSeconds * 1000);
  };

  const discard = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    stop();
  };

  const seconds = () => (ref.current.startAt === null ? 0 : (Date.now() - ref.current.startAt) / 1000);

  // 页面被隐藏 / 关闭：未上报的本地累计直接作废。
  useEffect(() => {
    const onHidden = () => { if (document.visibilityState === 'hidden') discard(); };
    window.addEventListener('pagehide', discard);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', discard);
      document.removeEventListener('visibilitychange', onHidden);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idleSeconds]);

  return { tap, taps: ref.current.taps, paused, evaluate, discard, seconds };
}
