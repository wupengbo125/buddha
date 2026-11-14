import type { PracticeSessionState } from './practice-types';
import { PendingQueue } from './storage';

export type PendingPracticeTap = { eventId: string; runId: string; itemIndex: number; date: string };

export async function sendPracticeTap(queue: PendingQueue<PendingPracticeTap>, event: PendingPracticeTap, timeZone: string, pendingEventIds?: string[]) {
  const response = await fetch(`/api/practice-session/taps?timeZone=${encodeURIComponent(timeZone)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...event, ...(pendingEventIds ? { pendingEventIds } : {}) }),
  });
  const result = await response.json() as PracticeSessionState & { error?: string };
  if (response.status === 410) queue.reject(event);
  return { response, result };
}