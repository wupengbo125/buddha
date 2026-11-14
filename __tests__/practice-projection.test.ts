import { describe, expect, it } from 'vitest';
import { projectPracticeTap } from '@/lib/practice-projection';
import type { PracticeSessionState } from '@/lib/practice-types';

const initial = {
  date: '2026-11-14', revision: 1, stats: { today: 10, total: 20 },
  active: {
    id: 'run', collection_id: 'collection', collection_name: 'collection',
    index: 0, completed: false, count: 0, counts: [0, 0], total: 0,
    items: [
      { id: 'first', target: 1, today_total: 2, personal_total: 5 },
      { id: 'second', target: 2, today_total: 3, personal_total: 7 },
    ],
  },
} as PracticeSessionState;

describe('practice tap projection', () => {
  it('moves to the next practice and counts a fast following tap there', () => {
    const first = projectPracticeTap(initial, { runId: 'run', itemIndex: 0, date: '2026-11-14' });
    const second = projectPracticeTap(first, { runId: 'run', itemIndex: 1, date: '2026-11-14' });
    expect(second).toMatchObject({
      stats: { today: 12, total: 22 },
      active: { index: 1, count: 1, counts: [1, 1], total: 2, completed: false,
        items: [{ today_total: 3, personal_total: 6 }, { today_total: 4, personal_total: 8 }] },
    });
  });

  it('does not count an old event in the current day', () => {
    const projected = projectPracticeTap(initial, { runId: 'run', itemIndex: 0, date: '2026-11-13' });
    expect(projected).toMatchObject({ stats: { today: 10, total: 21 }, active: {
      items: [{ today_total: 2, personal_total: 6 }, { today_total: 3, personal_total: 7 }],
    } });
  });

  it('starts a new day without losing accumulated counts', () => {
    const projected = projectPracticeTap(initial, { runId: 'run', itemIndex: 0, date: '2026-11-15' });
    expect(projected).toMatchObject({ date: '2026-11-15', stats: { today: 1, total: 21 }, active: {
      items: [{ today_total: 1, personal_total: 6 }, { today_total: 0, personal_total: 7 }],
    } });
  });
});