import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendPracticeTap } from '@/lib/practice-sync';
import { PendingQueue } from '@/lib/storage';

describe('practice tap synchronization', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('preserves a deleted practice tap without blocking the next tap', async () => {
    const queue = new PendingQueue<{ eventId: string; runId: string; itemIndex: number; date: string }>();
    const first = { eventId: 'first', runId: 'deleted', itemIndex: 0, date: '2026-11-14' };
    const second = { ...first, eventId: 'second', runId: 'current' };
    queue.add(first);
    queue.add(second);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ error: 'deleted' }, { status: 410 })).mockResolvedValueOnce(Response.json({ active: null })));
    expect((await sendPracticeTap(queue, first, 'Asia/Shanghai')).response.status).toBe(410);
    expect(queue.rejectedSize).toBe(1);
    expect(queue.values()).toEqual([second]);
    expect((await sendPracticeTap(queue, second, 'Asia/Shanghai')).response.ok).toBe(true);
  });

  it('leaves temporary conflicts in the queue', async () => {
    const queue = new PendingQueue<{ eventId: string; runId: string; itemIndex: number; date: string }>();
    const event = { eventId: 'first', runId: 'current', itemIndex: 0, date: '2026-11-14' };
    queue.add(event);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'conflict' }, { status: 409 })));
    await sendPracticeTap(queue, event, 'Asia/Shanghai');
    expect(queue.values()).toEqual([event]);
    expect(queue.rejectedSize).toBe(0);
  });
});