import { describe, expect, it } from 'vitest';
import { reconcileStates } from '@/lib/storage';
import { TapLedger } from '@/lib/taps';
import type { Counter } from '@/lib/types';

function counter(overrides: Partial<Counter> = {}): Counter {
  return {
    id: 'c1',
    device_id: 'd1',
    name: '佛号',
    caption: '',
    total: 0,
    today: 0,
    today_date: '',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('R1 · 本地 state 丢失 / 损坏时服务端对账恢复', () => {
  it('本地 state 完全丢失：以 GET /api/counters 的 total/today 为基准，不从 0 起算', () => {
    const c = counter({ total: 12, today: 4, today_date: '2026-01-01' });
    const r = reconcileStates([c], {}, '2026-01-01');
    expect(r.c1.total).toBe(12);
    expect(r.c1.today).toBe(4);
    expect(r.c1.pending).toEqual([]);
    expect(r.c1.today_date).toBe('2026-01-01');
  });

  it('本地 state 损坏（total 落后于服务端）：服务端为基准叠加可恢复 pending，总数不倒退', () => {
    const c = counter({ total: 12, today: 4, today_date: '2026-01-01' });
    const corrupt = {
      c1: {
        total: 0,
        today: 0,
        pending: [{ eventId: 'E1', date: '2026-01-01', delta: 3 }],
        lastPushedTotal: 0,
        today_date: '2026-01-01',
      },
    };
    const r = reconcileStates([c], corrupt, '2026-01-01');
    expect(r.c1.total).toBe(15); // 12 + 3
    expect(r.c1.today).toBe(7); // 4 + 3
    expect(r.c1.pending).toEqual([{ eventId: 'E1', date: '2026-01-01', delta: 3 }]);
    expect(r.c1.total).toBeGreaterThanOrEqual(c.total);
  });

  it('本地 state 可信（total >= 服务端）：保留按日期分组的 pending 与旧日期尾数', () => {
    const c = counter({ total: 10, today: 2, today_date: '2026-01-02' });
    const local = {
      c1: {
        total: 13,
        today: 5,
        pending: [
          { eventId: 'OLD', date: '2026-01-01', delta: 2 },
          { eventId: 'NEW', date: '2026-01-02', delta: 3 },
        ],
        lastPushedTotal: 10,
        today_date: '2026-01-02',
      },
    };
    const r = reconcileStates([c], local, '2026-01-02');
    expect(r.c1.total).toBe(13);
    expect(r.c1.pending.map((b) => b.date)).toEqual(['2026-01-01', '2026-01-02']);

    // 跨到次日：只把当日归零、总数不变，旧日期 pending 不洗
    const r2 = reconcileStates([counter({ total: 13, today: 0, today_date: '2026-01-03' })], local, '2026-01-03');
    expect(r2.c1.today).toBe(0);
    expect(r2.c1.total).toBe(13);
    expect(r2.c1.pending.map((b) => b.date)).toEqual(['2026-01-01', '2026-01-02']);
  });

  it('服务端已删除的计数器从本地丢弃', () => {
    const r = reconcileStates(
      [],
      { ghost: { total: 5, today: 1, pending: [], lastPushedTotal: 0, today_date: '2026-01-01' } },
      '2026-01-01',
    );
    expect(r.ghost).toBeUndefined();
  });

  it('本地 state 丢失后新 flush 不撞历史、不吞计数、总数不倒退（端到端）', () => {
    const ledger = new TapLedger();
    ledger.apply('c1', 'd1', 'HIST-1', 5, '2026-01-01');
    ledger.apply('c1', 'd1', 'HIST-2', 5, '2026-01-01');
    const server = ledger.get('c1');
    expect(server.total).toBe(10);

    // 本地 state 丢失，用户又念 3 声，生成全新随机 event_id
    const pending = [{ eventId: 'FRESH-RANDOM', date: '2026-01-01', delta: 3 }];
    const c = counter({ total: server.total, today: server.today, today_date: server.today_date });
    const r = reconcileStates(
      [c],
      { c1: { total: 0, today: 0, pending, lastPushedTotal: 0, today_date: '2026-01-01' } },
      '2026-01-01',
    );
    expect(r.c1.total).toBe(13); // 服务端 10 + 本地 3，不从 0 起算
    expect(r.c1.pending[0].eventId).toBe('FRESH-RANDOM');

    const res = ledger.apply('c1', 'd1', r.c1.pending[0].eventId, r.c1.pending[0].delta, '2026-01-01');
    expect(res.applied).toBe(true); // 随机 event_id 不撞历史
    expect(res.totals.total).toBe(13); // 不吞计数
    expect(res.totals.total).toBeGreaterThanOrEqual(server.total); // 不倒退
  });
});
