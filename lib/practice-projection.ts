import type { PracticeSessionState } from './practice-types';

export function projectPracticeTap(state: PracticeSessionState, event: { runId: string; itemIndex: number; date: string }): PracticeSessionState {
  const active = state.active;
  if (!active || active.completed || active.id !== event.runId || active.index !== event.itemIndex) return state;
  const date = event.date > state.date ? event.date : state.date;
  const newDay = date !== state.date;
  const sameDay = event.date === date;
  const practice = active.items[active.index];
  const items = active.items.map((item) => ({
    ...item,
    today_total: (newDay ? 0 : item.today_total ?? 0) + (item.id === practice.id && sameDay ? 1 : 0),
    personal_total: (item.personal_total ?? 0) + (item.id === practice.id ? 1 : 0),
  }));
  const counts = items.map((item) => Math.min(item.personal_total ?? 0, item.target));
  const nextIndex = counts.findIndex((count, itemIndex) => count < items[itemIndex].target);
  const completed = nextIndex < 0;
  const index = completed ? items.length - 1 : nextIndex;
  return {
    ...state, date,
    stats: { today: (newDay ? 0 : state.stats.today) + (sameDay ? 1 : 0), total: state.stats.total + 1 },
    active: { ...active, items, counts, index, completed, count: counts[index], total: counts.reduce((total, count) => total + count, 0) },
  };
}