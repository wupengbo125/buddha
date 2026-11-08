// 本地 CounterState 的持久化与对齐。localStorage 是即时 UI 的主存，远端 D1 靠 flush 对齐。

import { sanitizeState, type CounterState } from './counter-store';
import { storageNamespace } from './brand';
import type { Counter } from './types';

const STATES_KEY = `${storageNamespace}:states`;

export function loadStates(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STATES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStates(states: Record<string, CounterState>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STATES_KEY, JSON.stringify(states));
  } catch {
    /* 忽略配额 / 隐私模式错误 */
  }
}

/**
 * 用服务端列表对齐本地状态：
 * - 本地 state 丢失 / 损坏 / 落后于服务端：以 GET /api/counters 的 total/today 为基准，
 *   叠加仍可恢复的本地 pending，不从 0 起算（R1 服务端对账恢复）。
 * - 本地 state 可信（total >= 服务端 total）：保留含按日期分组的 pending（R2 旧日期尾数不洗），
 *   仅日期变化时把当日归零、总数不变。
 * - 服务端已删除的计数器直接丢弃。
 */
export function reconcileStates(
  counters: Counter[],
  states: Record<string, unknown>,
  today: string,
): Record<string, CounterState> {
  const next: Record<string, CounterState> = {};
  for (const c of counters) {
    const local = sanitizeState(states[c.id]);
    const pending = local?.pending ?? [];
    const pendingSum = pending.reduce((n, b) => n + b.delta, 0);
    const pendingToday = pending
      .filter((b) => b.date === today)
      .reduce((n, b) => n + b.delta, 0);
    const serverTotal = c.total;
    const serverToday = c.today_date === today ? c.today : 0;

    if (local && local.total >= serverTotal) {
      next[c.id] = local.today_date === today ? local : { ...local, today: 0, today_date: today };
    } else {
      next[c.id] = {
        total: serverTotal + pendingSum,
        today: serverToday + pendingToday,
        pending,
        lastPushedTotal: serverTotal,
        today_date: today,
      };
    }
  }
  return next;
}
