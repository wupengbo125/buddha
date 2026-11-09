// 服务端计数累加的纯逻辑镜像：与 taps/route.ts 的原子 UPDATE 语义保持一致。
// 生产用单条原子 SQL 累加（避免读-改-写并发丢更新）；此处 accumulateTotals + TapLedger
// 用同样的语义，在不依赖 Cloudflare 的纯逻辑单测里覆盖「原子累加 / 跨零点 / event_id 幂等」。

export interface CounterTotals {
  total: number;
  today: number;
  today_date: string;
}

/**
 * 与原子 SQL 等价：
 *   total = total + delta
 *   today = CASE WHEN today_date = ? THEN today + delta ELSE delta END
 *   today_date = ?   （无条件设为本次请求的 date）
 * 生产 delta 恒为 1；测试可用任意正数验证累加。
 */
export function accumulateTotals(prev: CounterTotals, delta: number, date: string): CounterTotals {
  const sameDay = date === prev.today_date;
  return {
    total: prev.total + delta,
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
