import { describe, expect, it } from 'vitest';
import {
  PUSH_EVERY,
  confirmFlushed,
  createState,
  flushPayloads,
  needsFlush,
  pendingTotal,
  rollover,
  sanitizeState,
  shouldPush,
  tap,
} from '@/lib/counter-store';

function idMaker() {
  let n = 0;
  return () => `E${++n}`;
}

describe('total % 5 推送判定', () => {
  it('只在累计为 5 的倍数时推送', () => {
    expect(PUSH_EVERY).toBe(5);
    expect(shouldPush(0)).toBe(false);
    for (const n of [1, 2, 3, 4, 6, 7, 9, 11, 14]) expect(shouldPush(n)).toBe(false);
    for (const n of [5, 10, 15, 20, 100]) expect(shouldPush(n)).toBe(true);
  });

  it('第 5 次点按触发 push', () => {
    let state = createState('2026-01-01');
    const make = idMaker();
    const pushes: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const r = tap(state, '2026-01-01', make);
      state = r.state;
      pushes.push(r.push);
    }
    expect(pushes).toEqual([false, false, false, false, true]);
  });
});

describe('点按与 pending 按日期分组', () => {
  it('即时 +1：total / today / pending 各加一，尾数归入同日期批次', () => {
    const make = idMaker();
    const s0 = createState('2026-01-01');
    const r1 = tap(s0, '2026-01-01', make);
    expect(r1.state.total).toBe(1);
    expect(r1.state.today).toBe(1);
    expect(pendingTotal(r1.state)).toBe(1);
    expect(r1.state.pending).toEqual([{ eventId: 'E1', date: '2026-01-01', delta: 1 }]);
    expect(r1.push).toBe(false);
    const r2 = tap(r1.state, '2026-01-01', make);
    expect(r2.state.total).toBe(2);
    expect(pendingTotal(r2.state)).toBe(2);
    expect(r2.state.pending).toEqual([{ eventId: 'E1', date: '2026-01-01', delta: 2 }]);
  });

  it('连续 5 次 pending 累加到 5', () => {
    const make = idMaker();
    let state = createState('2026-01-01');
    for (let i = 0; i < 5; i++) state = tap(state, '2026-01-01', make).state;
    expect(pendingTotal(state)).toBe(5);
    expect(state.total).toBe(5);
  });
});

describe('R1 · 随机 event_id 幂等', () => {
  it('event_id 随 pending 持久化，重试沿用同一 id', () => {
    const make = idMaker();
    let state = createState('2026-01-01');
    for (let i = 0; i < 5; i++) state = tap(state, '2026-01-01', make).state;
    const first = flushPayloads(state);
    const retry = flushPayloads(state);
    expect(first).toEqual(retry);
    expect(first[0].eventId).toBe('E1');
    expect(needsFlush(state)).toBe(true);
  });

  it('服务端确认本批次后才清 pending；确认后新点按生成全新 event_id（不撞历史）', () => {
    const make = idMaker();
    let state = createState('2026-01-01');
    for (let i = 0; i < 5; i++) state = tap(state, '2026-01-01', make).state;
    const batch = flushPayloads(state)[0];
    state = confirmFlushed(state, [batch], make, 5);
    expect(needsFlush(state)).toBe(false);
    expect(state.total).toBe(5);
    const r = tap(state, '2026-01-01', make);
    expect(r.state.pending[0].eventId).not.toBe('E1');
    expect(r.state.pending[0].eventId).toBe('E2');
    expect(r.state.total).toBe(6);
  });

  it('确认时期间的新点按保留：余量换新 event_id，不吞计数', () => {
    const make = idMaker();
    let state = createState('2026-01-01');
    for (let i = 0; i < 5; i++) state = tap(state, '2026-01-01', make).state;
    const batch = flushPayloads(state)[0];
    let during = tap(state, '2026-01-01', make).state;
    during = tap(during, '2026-01-01', make).state;
    const confirmed = confirmFlushed(during, [batch], make, 5);
    expect(confirmed.total).toBe(7);
    expect(pendingTotal(confirmed)).toBe(2);
    expect(confirmed.pending[0].eventId).not.toBe('E1');
    expect(confirmed.pending[0].delta).toBe(2);
  });

  it('响应非本批次时不确认（不得无条件清 pending）', () => {
    const make = idMaker();
    let state = createState('2026-01-01');
    for (let i = 0; i < 5; i++) state = tap(state, '2026-01-01', make).state;
    const other = { eventId: 'NOT-THIS', date: '2026-01-01', delta: 5 };
    const after = confirmFlushed(state, [other], make, 5);
    expect(pendingTotal(after)).toBe(5);
    expect(after.pending[0].eventId).toBe('E1');
  });

  it('损坏 / 非法本地 state 返回 null，交由服务端对账恢复', () => {
    expect(sanitizeState(null)).toBeNull();
    expect(sanitizeState({ total: 'x' })).toBeNull();
    expect(sanitizeState({ total: 5, today: 2, today_date: '2026-01-01', pending: 'bad' })).toMatchObject({
      total: 5,
      pending: [],
    });
    expect(sanitizeState({ total: 5, today: 2, today_date: '2026-01-01', pending: [{ eventId: 'E', date: 'bad', delta: 3 }] })).toMatchObject({
      total: 5,
      pending: [],
    });
  });
});

describe('R2 · 跨零点 pending 按日期分组', () => {
  it('rollover 保留旧日期 pending、总数不变、当日归零', () => {
    const make = idMaker();
    let state = createState('2026-01-01');
    for (let i = 0; i < 7; i++) state = tap(state, '2026-01-01', make).state;
    const before = state.total;
    const next = rollover(state, '2026-01-02');
    expect(next.today).toBe(0);
    expect(next.total).toBe(before);
    expect(next.today_date).toBe('2026-01-02');
    expect(next.pending).toEqual([{ eventId: 'E1', date: '2026-01-01', delta: 7 }]);
  });

  it('旧日期尾数与新日期尾数分成两个批次，各自带自己的 date 上报', () => {
    const make = idMaker();
    let state = createState('2026-01-01');
    for (let i = 0; i < 3; i++) state = tap(state, '2026-01-01', make).state;
    let next = rollover(state, '2026-01-02');
    for (let i = 0; i < 2; i++) next = tap(next, '2026-01-02', make).state;
    expect(next.pending).toEqual([
      { eventId: 'E1', date: '2026-01-01', delta: 3 },
      { eventId: 'E2', date: '2026-01-02', delta: 2 },
    ]);
    expect(next.total).toBe(5);
    expect(next.today).toBe(2);
    // 禁止把整笔 delta 全记当前日：每批带自己的 date
    expect(flushPayloads(next).map((p) => [p.date, p.delta])).toEqual([
      ['2026-01-01', 3],
      ['2026-01-02', 2],
    ]);
  });

  it('点按遇日期变化：当日重新计、总数继续累加', () => {
    const make = idMaker();
    let state = createState('2026-01-01');
    for (let i = 0; i < 7; i++) state = tap(state, '2026-01-01', make).state;
    const r = tap(state, '2026-01-02', make);
    expect(r.state.total).toBe(8);
    expect(r.state.today).toBe(1);
    expect(r.state.today_date).toBe('2026-01-02');
  });
});
