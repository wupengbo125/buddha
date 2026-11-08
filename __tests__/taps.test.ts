import { describe, expect, it } from 'vitest';
import { accumulateTotals, TapLedger } from '@/lib/taps';

describe('accumulateTotals 服务端累加', () => {
  it('同日：today 与 total 一起累加', () => {
    const r = accumulateTotals({ total: 10, today: 4, today_date: '2026-01-01' }, 5, '2026-01-01');
    expect(r).toEqual({ total: 15, today: 9, today_date: '2026-01-01' });
  });

  it('跨日：today 归到本次 delta，total 保留并累加', () => {
    const r = accumulateTotals({ total: 10, today: 4, today_date: '2026-01-01' }, 5, '2026-01-02');
    expect(r).toEqual({ total: 15, today: 5, today_date: '2026-01-02' });
  });

  it('迟到事件（早于当前记录日期）只加总数、不改写当日', () => {
    const r = accumulateTotals({ total: 10, today: 5, today_date: '2026-01-03' }, 3, '2026-01-01');
    expect(r).toEqual({ total: 13, today: 5, today_date: '2026-01-03' });
  });
});

describe('R1 · 随机 event_id 幂等（UNIQUE(counter_id, device_id, event_id)）', () => {
  it('同 event_id 重发不重复累加', () => {
    const ledger = new TapLedger();
    const first = ledger.apply('c1', 'd1', 'EVT-A', 5, '2026-01-01');
    expect(first.applied).toBe(true);
    expect(first.totals.total).toBe(5);
    expect(first.totals.today).toBe(5);

    const dup = ledger.apply('c1', 'd1', 'EVT-A', 5, '2026-01-01');
    expect(dup.applied).toBe(false);
    expect(dup.totals.total).toBe(5);
    expect(dup.totals.today).toBe(5);
  });

  it('本地 state 丢失后，新随机 event_id 不撞历史、不吞计数、总数不倒退', () => {
    const ledger = new TapLedger();
    // 历史 flush：设备已确认过的若干 event_id
    ledger.apply('c1', 'd1', 'HIST-1', 5, '2026-01-01');
    ledger.apply('c1', 'd1', 'HIST-2', 5, '2026-01-01');
    const before = ledger.get('c1');
    expect(before.total).toBe(10);

    // 本地 state 清空后重新对账，新点按生成全新随机 event_id
    const r = ledger.apply('c1', 'd1', 'FRESH-RANDOM', 3, '2026-01-01');
    expect(r.applied).toBe(true); // 不撞历史（旧实现 seq 归零会撞）
    expect(r.totals.total).toBe(13); // 不吞计数
    expect(r.totals.total).toBeGreaterThanOrEqual(before.total); // 总数不倒退

    // 同 id 重发仍幂等
    const retry = ledger.apply('c1', 'd1', 'FRESH-RANDOM', 3, '2026-01-01');
    expect(retry.applied).toBe(false);
    expect(retry.totals.total).toBe(13);
  });

  it('同 event_id 但设备 / 计数器不同不算重复', () => {
    const ledger = new TapLedger();
    const a = ledger.apply('c1', 'd1', 'SAME', 3, '2026-01-01');
    const b = ledger.apply('c1', 'd2', 'SAME', 4, '2026-01-01');
    const c = ledger.apply('c2', 'd1', 'SAME', 7, '2026-01-01');
    expect(a.applied && b.applied && c.applied).toBe(true);
    expect(ledger.get('c1').total).toBe(7);
    expect(ledger.get('c2').total).toBe(7);
  });
});

describe('R2 · 跨零点 pending 按日期', () => {
  it('旧日期批次与新日期批次各记各日，禁止整笔 delta 全记当前日', () => {
    const ledger = new TapLedger();
    ledger.apply('c1', 'd1', 'E-OLD', 3, '2026-01-01');
    const r = ledger.apply('c1', 'd1', 'E-NEW', 2, '2026-01-02');
    expect(r.totals).toEqual({ total: 5, today: 2, today_date: '2026-01-02' });
    // 旧日期的 3 声没有混进次日「当日」
  });

  it('迟到旧日期批次只加总数、不污染已推进的当日', () => {
    const ledger = new TapLedger();
    ledger.apply('c1', 'd1', 'E-NEW', 2, '2026-01-02');
    const late = ledger.apply('c1', 'd1', 'E-OLD', 3, '2026-01-01');
    expect(late.totals).toEqual({ total: 5, today: 2, today_date: '2026-01-02' });
  });
});
