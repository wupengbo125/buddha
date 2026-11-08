// 客户端计数器的纯状态逻辑。不依赖浏览器 / Cloudflare，便于单测。
// UI 即时读本地状态（localStorage 持久化），推送通过带随机 event_id 的幂等接口与服务端对齐。

import { ulid } from 'ulid';

export interface PendingBatch {
  eventId: string; // flush 事件唯一 id（幂等键）；重试沿用同一 id
  date: string; // 该批尾数所属日期（YYYY-MM-DD），跨零点不洗日期
  delta: number; // 该批未推送声数
}

export interface CounterState {
  total: number;
  today: number;
  pending: PendingBatch[]; // 未推送尾数，按日期分组
  lastPushedTotal: number; // 最近一次服务端确认的总数
  today_date: string;
}

/** 累计每达到 5 的倍数推一次远端。 */
export const PUSH_EVERY = 5;

/** 新批次 id：随机 ulid，保证与历史 flush 不撞车。 */
export function newEventId(): string {
  return ulid();
}

export function createState(date: string): CounterState {
  return { total: 0, today: 0, pending: [], lastPushedTotal: 0, today_date: date };
}

/** 是否到达推送边界（累计为 5 的倍数）。 */
export function shouldPush(total: number): boolean {
  return total > 0 && total % PUSH_EVERY === 0;
}

/** 点按一次：本地即时 +1；尾数按日期归入对应批次（新日期自动新建批次）。 */
export function tap(
  state: CounterState,
  date: string,
  makeEventId: () => string = newEventId,
): { state: CounterState; push: boolean } {
  const base = date === state.today_date ? state : { ...state, today: 0, today_date: date };
  const pending = base.pending.map((b) => ({ ...b }));
  let idx = -1;
  for (let i = pending.length - 1; i >= 0; i--) {
    if (pending[i].date === date) {
      idx = i;
      break;
    }
  }
  if (idx >= 0) pending[idx] = { ...pending[idx], delta: pending[idx].delta + 1 };
  else pending.push({ eventId: makeEventId(), date, delta: 1 });
  const total = base.total + 1;
  const next: CounterState = { ...base, total, today: base.today + 1, pending };
  return { state: next, push: shouldPush(total) };
}

/** 未推送尾数总和。 */
export function pendingTotal(state: CounterState): number {
  return state.pending.reduce((n, b) => n + b.delta, 0);
}

/** 是否有未推送的尾数需要兜底补推。 */
export function needsFlush(state: CounterState): boolean {
  return pendingTotal(state) > 0;
}

/** 待推送批次快照（按创建顺序，旧日期在前）。 */
export function flushPayloads(state: CounterState): PendingBatch[] {
  return state.pending.map((b) => ({ ...b }));
}

/**
 * 服务端确认一批次后：减去已确认的 delta；若期间又有新点按，余量换一个新 eventId 继续保留。
 * 只有显式确认（applied 或同 id 重发）才调用，绝不无条件清 pending。
 */
export function confirmFlushed(
  state: CounterState,
  sentBatches: PendingBatch[],
  makeEventId: () => string = newEventId,
  totalPushed: number = state.lastPushedTotal,
): CounterState {
  const pending = state.pending.map((b) => ({ ...b }));
  for (const sent of sentBatches) {
    const idx = pending.findIndex((b) => b.eventId === sent.eventId);
    if (idx < 0) continue;
    const remaining = pending[idx].delta - sent.delta;
    if (remaining <= 0) pending.splice(idx, 1);
    else pending[idx] = { ...pending[idx], delta: remaining, eventId: makeEventId() };
  }
  return { ...state, pending, lastPushedTotal: totalPushed };
}

/** 跨零点：当日归零、总数不变；pending 按日期原样保留（旧日期尾数记入旧日期）。 */
export function rollover(state: CounterState, newDate: string): CounterState {
  return { ...state, today: 0, today_date: newDate };
}

/** 解析 / 修复持久化的本地状态；损坏则返回 null，交由服务端对账恢复。 */
export function sanitizeState(value: unknown): CounterState | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const asCount = (x: unknown): number | null =>
    typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : null;
  const total = asCount(v.total);
  const today = asCount(v.today);
  if (total === null || today === null || typeof v.today_date !== 'string') return null;
  const pending: PendingBatch[] = [];
  if (Array.isArray(v.pending)) {
    for (const raw of v.pending) {
      if (!raw || typeof raw !== 'object') continue;
      const b = raw as Record<string, unknown>;
      const delta = asCount(b.delta);
      if (
        typeof b.eventId !== 'string' ||
        !b.eventId ||
        typeof b.date !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(b.date) ||
        delta === null ||
        delta <= 0
      ) {
        continue;
      }
      pending.push({ eventId: b.eventId, date: b.date, delta });
    }
  }
  return {
    total,
    today,
    pending,
    lastPushedTotal: asCount(v.lastPushedTotal) ?? total,
    today_date: v.today_date,
  };
}
