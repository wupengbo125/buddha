import { describe, expect, it } from 'vitest';
import { RetryQueue } from '@/lib/storage';

describe('RetryQueue · 失败重试沿用同一 event_id', () => {
  it('失败请求原样入队，drain 出来仍是同一个 eventId/date/counterId', () => {
    const q = new RetryQueue();
    q.add('c1', { eventId: 'E1', date: '2026-01-01' });
    expect(q.size).toBe(1);
    expect(q.drain()).toEqual([{ counterId: 'c1', eventId: 'E1', date: '2026-01-01' }]);
    expect(q.size).toBe(0);
  });

  it('drain 清空队列；重试再失败可再次入队，仍沿用原 event_id', () => {
    const q = new RetryQueue();
    q.add('c1', { eventId: 'E1', date: '2026-01-01' });
    const [first] = q.drain();
    expect(q.size).toBe(0);
    q.add(first.counterId, { eventId: first.eventId, date: first.date });
    expect(q.drain()[0].eventId).toBe('E1');
  });

  it('多个失败请求各自保留独立 event_id，不合并成批次', () => {
    const q = new RetryQueue();
    q.add('c1', { eventId: 'E1', date: '2026-01-01' });
    q.add('c1', { eventId: 'E2', date: '2026-01-01' });
    q.add('c2', { eventId: 'E3', date: '2026-01-01' });
    expect(q.size).toBe(3);
    expect(q.drain().map((i) => i.eventId)).toEqual(['E1', 'E2', 'E3']);
  });

  it('跨零点失败请求保留自己的 date，重发不洗日期', () => {
    const q = new RetryQueue();
    q.add('c1', { eventId: 'OLD', date: '2026-01-01' });
    q.add('c1', { eventId: 'NEW', date: '2026-01-02' });
    expect(q.drain().map((i) => [i.eventId, i.date])).toEqual([
      ['OLD', '2026-01-01'],
      ['NEW', '2026-01-02'],
    ]);
  });

  it('空队列 drain 返回空、size 为 0', () => {
    const q = new RetryQueue();
    expect(q.size).toBe(0);
    expect(q.drain()).toEqual([]);
  });
});
