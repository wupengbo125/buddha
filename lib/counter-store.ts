// 客户端计数显示的纯逻辑。不依赖浏览器 / Cloudflare，便于单测。
// v6：服务端为唯一权威，本地只做乐观 +1 与服务端响应校正；不再有攒批 / pending / localStorage 对账。
// 点一次即生成一个独立 event_id 的上报请求；失败重试沿用同一 event_id（服务端按它幂等）。

import { ulid } from 'ulid';

export interface CounterState {
  total: number;
  today: number;
  today_date: string;
}

/** 一次点击的上报请求：重试沿用同一 eventId，date 为该次点击的日期键。 */
export interface TapRequest {
  eventId: string;
  date: string;
}

/** 新点击的幂等键：随机 ulid，保证与历史点击不撞车。 */
export function newEventId(): string {
  return ulid();
}

export function createState(date: string): CounterState {
  return { total: 0, today: 0, today_date: date };
}

/** 用服务端计数器初始化显示状态（服务端唯一权威）。 */
export function stateFromCounter(c: { total: number; today: number; today_date: string }, date: string): CounterState {
  return { total: c.total, today: c.today_date === date ? c.today : 0, today_date: date };
}

export function applyServerSnapshot(
  state: CounterState | undefined,
  counter: { total: number; today: number; today_date: string },
  date: string,
  current: boolean,
  pending: boolean,
): CounterState | undefined {
  if (!current || (pending && state)) return state;
  return stateFromCounter(counter, date);
}

/**
 * 点按一次：乐观 +1 立即刷新 UI，同时生成本次点击独立的上报请求。
 * 跨零点当日归零、总数累加（与服务端原子 SQL 语义一致）。
 */
export function tap(
  state: CounterState,
  date: string,
  makeEventId: () => string = newEventId,
): { state: CounterState; request: TapRequest } {
  const sameDay = date === state.today_date;
  return {
    state: {
      total: state.total + 1,
      today: sameDay ? state.today + 1 : 1,
      today_date: date,
    },
    request: { eventId: makeEventId(), date },
  };
}

/**
 * 用服务端响应校正显示（服务端唯一权威）。
 * total 取较大值：并发快速点击的响应可能乱序返回，避免旧响应把显示拉回倒退。
 */
export function applyServerTotals(
  state: CounterState,
  res: { total: number; today: number; today_date: string },
): CounterState {
  const sameDay = res.today_date === state.today_date;
  const olderDay = res.today_date < state.today_date;
  return {
    total: Math.max(state.total, res.total),
    today: sameDay ? Math.max(state.today, res.today) : olderDay ? state.today : res.today,
    today_date: olderDay ? state.today_date : res.today_date,
  };
}
