import { describe, expect, it } from 'vitest';
import { applyServerTotals, createState, newEventId, stateFromCounter, tap } from '@/lib/counter-store';

function idMaker() {
  let n = 0;
  return () => `E${++n}`;
}

describe('显示状态初始化', () => {
  it('createState 从 0 起算', () => {
    expect(createState('2026-01-01')).toEqual({ total: 0, today: 0, today_date: '2026-01-01' });
  });

  it('stateFromCounter 用服务端值初始化（服务端唯一权威）', () => {
    expect(stateFromCounter({ total: 12, today: 4, today_date: '2026-01-01' })).toEqual({
      total: 12,
      today: 4,
      today_date: '2026-01-01',
    });
  });
});

describe('v6 · 点一次即上报一次', () => {
  it('点一次乐观 +1，并生成本次点击独立的上报请求', () => {
    const make = idMaker();
    const r1 = tap(createState('2026-01-01'), '2026-01-01', make);
    expect(r1.state).toEqual({ total: 1, today: 1, today_date: '2026-01-01' });
    expect(r1.request).toEqual({ eventId: 'E1', date: '2026-01-01' });
    const r2 = tap(r1.state, '2026-01-01', make);
    expect(r2.state.total).toBe(2);
    expect(r2.request).toEqual({ eventId: 'E2', date: '2026-01-01' });
  });

  it('连续 5 次点击 = 5 个请求，event_id 各不相同（不再攒 5 次）', () => {
    const make = idMaker();
    let state = createState('2026-01-01');
    const reqs = [];
    for (let i = 0; i < 5; i++) {
      const r = tap(state, '2026-01-01', make);
      state = r.state;
      reqs.push(r.request);
    }
    expect(reqs).toHaveLength(5); // 一次点击一次请求
    expect(new Set(reqs.map((r) => r.eventId)).size).toBe(5); // 每次点击独立 event_id
    expect(state.total).toBe(5);
  });

  it('newEventId 为互不相同的 ulid，符合服务端 zod 校验格式', () => {
    const ids = Array.from({ length: 50 }, () => newEventId());
    expect(new Set(ids).size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('跨零点：当日归零、总数继续累加，请求带新日期', () => {
    const make = idMaker();
    let state = createState('2026-01-01');
    for (let i = 0; i < 3; i++) state = tap(state, '2026-01-01', make).state;
    const r = tap(state, '2026-01-02', make);
    expect(r.state).toEqual({ total: 4, today: 1, today_date: '2026-01-02' });
    expect(r.request.date).toBe('2026-01-02');
  });
});

describe('applyServerTotals · 服务端响应校正', () => {
  it('用服务端值校正显示', () => {
    const s = { total: 1, today: 1, today_date: '2026-01-01' };
    expect(applyServerTotals(s, { total: 3, today: 3, today_date: '2026-01-01' })).toEqual({
      total: 3,
      today: 3,
      today_date: '2026-01-01',
    });
  });

  it('并发响应乱序：旧响应不把显示拉回倒退', () => {
    const afterB = { total: 12, today: 12, today_date: '2026-01-01' };
    const lateA = applyServerTotals(afterB, { total: 11, today: 11, today_date: '2026-01-01' });
    expect(lateA.total).toBe(12);
    expect(lateA.today).toBe(12);
  });

  it('跨零点响应：当日按服务端归零后值、总数不倒退', () => {
    const s = { total: 20, today: 8, today_date: '2026-01-01' };
    expect(applyServerTotals(s, { total: 21, today: 1, today_date: '2026-01-02' })).toEqual({
      total: 21,
      today: 1,
      today_date: '2026-01-02',
    });
  });
});
