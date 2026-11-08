// 服务端计数累加的纯逻辑。API route 复用 accumulateTotals，TapLedger 用于幂等语义单测。

export interface CounterTotals {
  total: number;
  today: number;
  today_date: string;
}

/** 把一个 tap 事件累加进计数器：date 变化则当日归零，总数始终累加。 */
export function accumulateTotals(prev: CounterTotals, delta: number, date: string): CounterTotals {
  const total = prev.total + delta;
  if (date < prev.today_date) {
    // 迟到事件（日期早于当前记录）：只累加总数，不改写「当日」，避免旧日期尾数污染今日
    return { total, today: prev.today, today_date: prev.today_date };
  }
  const sameDay = date === prev.today_date;
  return {
    total,
    today: sameDay ? prev.today + delta : delta,
    today_date: date,
  };
}

/**
 * 内存版 tap_events 账本，模拟 D1 的 UNIQUE(counter_id, device_id, event_id) 幂等约束。
 * 生产路径用 INSERT OR IGNORE 实现同样语义；此类供不依赖 Cloudflare 的纯逻辑单测使用。
 */
export class TapLedger {
  private seen = new Set<string>();
  private totals = new Map<string, CounterTotals>();

  constructor(initial?: Record<string, CounterTotals>) {
    if (initial) {
      for (const [key, value] of Object.entries(initial)) this.totals.set(key, { ...value });
    }
  }

  get(counterId: string): CounterTotals {
    return this.totals.get(counterId) ?? { total: 0, today: 0, today_date: '' };
  }

  /** applied=false 表示同 event_id 重发，被幂等忽略，不重复累加。 */
  apply(
    counterId: string,
    deviceId: string,
    eventId: string,
    delta: number,
    date: string,
  ): { totals: CounterTotals; applied: boolean } {
    const key = `${counterId}|${deviceId}|${eventId}`;
    if (this.seen.has(key)) return { totals: this.get(counterId), applied: false };
    this.seen.add(key);
    const next = accumulateTotals(this.get(counterId), delta, date);
    this.totals.set(counterId, next);
    return { totals: next, applied: true };
  }
}
