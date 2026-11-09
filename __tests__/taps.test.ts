import { describe, expect, it } from 'vitest';
import { accumulateTotals, TapLedger } from '@/lib/taps';

describe('accumulateTotals · 与服务端原子 UPDATE 语义一致', () => {
  it('同日：total / today 一起累加', () => {
    const r = accumulateTotals({ total: 10, today: 4, today_date: '2026-01-01' }, 1, '2026-01-01');
    expect(r).toEqual({ total: 11, today: 5, today_date: '2026-01-01' });
  });

  it('跨日：当日归到本次 delta，today_date 无条件设为本次 date，总数累加', () => {
    const r = accumulateTotals({ total: 10, today: 4, today_date: '2026-01-01' }, 1, '2026-01-02');
    expect(r).toEqual({ total: 11, today: 1, today_date: '2026-01-02' });
  });

  it('连续多次 +1 累加不丢（模拟服务端原子累加）', () => {
    let t = { total: 0, today: 0, today_date: '2026-01-01' };
    for (let i = 0; i < 37; i++) t = accumulateTotals(t, 1, '2026-01-01');
    expect(t).toEqual({ total: 37, today: 37, today_date: '2026-01-01' });
  });
});

describe('TapLedger · 单点击 event_id 幂等与原子累加', () => {
  it('每次点击独立 event_id 各自累加，并发快速点击不丢数', () => {
    const ledger = new TapLedger();
    for (let i = 0; i < 20; i++) {
      const r = ledger.apply('c1', 'd1', `EVT-${i}`, 1, '2026-01-01');
      expect(r.applied).toBe(true);
    }
    expect(ledger.get('c1')).toEqual({ total: 20, today: 20, today_date: '2026-01-01' });
  });

  it('同 event_id 重发（失败重试）不重复累加，返回 applied=false', () => {
    const ledger = new TapLedger();
    const first = ledger.apply('c1', 'd1', 'EVT-A', 1, '2026-01-01');
    expect(first.applied).toBe(true);
    expect(first.totals.total).toBe(1);

    const dup = ledger.apply('c1', 'd1', 'EVT-A', 1, '2026-01-01');
    expect(dup.applied).toBe(false);
    expect(dup.totals.total).toBe(1);
    expect(dup.totals.today).toBe(1);
  });

  it('失败重试沿用同一 event_id：成功一次后重发仍只算一次', () => {
    const ledger = new TapLedger();
    const req = { eventId: 'RETRY-1', date: '2026-01-01' };
    // 首次尝试失败（模拟网络错，未到服务端）；重试带同一 event_id 成功
    ledger.apply('c1', 'd1', req.eventId, 1, req.date);
    const retry = ledger.apply('c1', 'd1', req.eventId, 1, req.date);
    expect(retry.applied).toBe(false);
    expect(ledger.get('c1').total).toBe(1);
  });

  it('跨零点当日归零、总数不变', () => {
    const ledger = new TapLedger();
    ledger.apply('c1', 'd1', 'OLD-1', 1, '2026-01-01');
    ledger.apply('c1', 'd1', 'OLD-2', 1, '2026-01-01');
    const r = ledger.apply('c1', 'd1', 'NEW-1', 1, '2026-01-02');
    expect(r.totals).toEqual({ total: 3, today: 1, today_date: '2026-01-02' });
  });

  it('同 event_id 但计数器 / 设备不同不算重复', () => {
    const ledger = new TapLedger();
    const a = ledger.apply('c1', 'd1', 'SAME', 1, '2026-01-01');
    const b = ledger.apply('c1', 'd2', 'SAME', 1, '2026-01-01');
    const c = ledger.apply('c2', 'd1', 'SAME', 1, '2026-01-01');
    expect(a.applied && b.applied && c.applied).toBe(true);
    expect(ledger.get('c1').total).toBe(2);
    expect(ledger.get('c2').total).toBe(1);
  });
});
