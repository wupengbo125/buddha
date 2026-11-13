import { z } from 'zod';
import { ulid } from 'ulid';
import type { D1Database } from './db';
import type { Collection, PracticeSessionState, Run } from './practice-types';
import { PracticeError } from './practice-http';
import { atomic, ownedContent } from './practice-store';
import { dateKey } from './time';
import { DEFAULT_TIMEZONE } from './settings';

export const practiceDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

export function sessionDate(url: URL): string {
  const date = url.searchParams.get('date');
  return date ? practiceDate.parse(date) : dateKey(new Date(), url.searchParams.get('timeZone') ?? DEFAULT_TIMEZONE);
}

interface RunRow {
  id: string;
  collection_id: string;
  snapshot: string;
  item_index: number;
  completed: number;
}

export async function sessionState(db: D1Database, owner: string, date: string): Promise<PracticeSessionState> {
  const results = await atomic(db, [
    db.prepare('SELECT r.*, s.revision FROM practice_sessions s LEFT JOIN practice_runs r ON r.id = s.run_id AND r.owner_id = s.owner_id WHERE s.owner_id = ?').bind(owner),
    db.prepare('SELECT i.item_index, i.count FROM practice_run_items i JOIN practice_sessions s ON s.run_id = i.run_id WHERE s.owner_id = ? ORDER BY i.item_index').bind(owner),
    db.prepare(`SELECT COALESCE(SUM(total), 0) AS total, COALESCE(SUM(today), 0) AS today FROM (
      SELECT total, CASE WHEN today_date = ? THEN today ELSE 0 END AS today FROM counters WHERE device_id = ?
      UNION ALL
      SELECT count AS total, CASE WHEN date = ? THEN count ELSE 0 END AS today FROM practice_daily_counts WHERE owner_id = ?
    )`).bind(date, owner, date, owner),
  ]);
  const row = results[0].results?.[0] as (RunRow & { revision: number }) | undefined;
  const stats = results[2].results?.[0] as { today: number; total: number };
  let active: Run | null = null;
  if (row?.id) {
    const snapshot = JSON.parse(row.snapshot) as Collection;
    const counts = (results[1].results as { count: number }[]).map((item) => item.count);
    active = {
      id: row.id, collection_id: row.collection_id, collection_name: snapshot.name,
      index: row.item_index, completed: Boolean(row.completed), count: counts[row.item_index],
      items: snapshot.items, counts, total: counts.reduce((total, count) => total + count, 0),
    };
  }
  return { active, stats, revision: row?.revision ?? 0, date };
}

const sessionInput = z.object({ action: z.enum(['start', 'pause', 'restart']), collectionId: z.string().min(1).optional() });

export async function changeSession(db: D1Database, owner: string, body: unknown, date: string): Promise<PracticeSessionState> {
  const input = sessionInput.parse(body);
  if (input.action === 'pause') {
    await db.prepare('INSERT INTO practice_sessions(owner_id, run_id, revision) VALUES (?, NULL, 1) ON CONFLICT(owner_id) DO UPDATE SET run_id = NULL, revision = revision + 1').bind(owner).run();
    return sessionState(db, owner, date);
  }
  if (!input.collectionId) throw new PracticeError('请选择发愿集');
  const collection = await ownedContent(db, 'collections', input.collectionId, owner) as Collection;
  if (input.action === 'start') {
    const existing = await db.prepare('SELECT id FROM practice_runs WHERE owner_id = ? AND collection_id = ? AND is_current = 1').bind(owner, collection.id).first();
    if (existing) {
      await db.prepare('INSERT INTO practice_sessions(owner_id, run_id, revision) SELECT ?, id, 1 FROM practice_runs WHERE owner_id = ? AND collection_id = ? AND is_current = 1 ON CONFLICT(owner_id) DO UPDATE SET run_id = excluded.run_id, revision = revision + 1').bind(owner, owner, collection.id).run();
      return sessionState(db, owner, date);
    }
  }
  if (!collection.items.length) throw new PracticeError('发愿集不能为空', 409);
  const runId = ulid();
  const statements = [];
  if (input.action === 'restart') statements.push(db.prepare('UPDATE practice_runs SET is_current = 0 WHERE owner_id = ? AND collection_id = ? AND is_current = 1').bind(owner, collection.id));
  statements.push(db.prepare('INSERT OR IGNORE INTO practice_runs(id, owner_id, collection_id, snapshot, created_at) VALUES (?, ?, ?, ?, ?)').bind(runId, owner, collection.id, JSON.stringify(collection), new Date().toISOString()));
  statements.push(db.prepare("INSERT INTO practice_run_items(run_id, item_index, practice_id, target) SELECT ?, CAST(key AS INTEGER), json_extract(value, '$.id'), json_extract(value, '$.target') FROM json_each(?) WHERE EXISTS (SELECT 1 FROM practice_runs WHERE id = ?)").bind(runId, JSON.stringify(collection.items), runId));
  statements.push(db.prepare('INSERT INTO practice_sessions(owner_id, run_id, revision) SELECT ?, id, 1 FROM practice_runs WHERE owner_id = ? AND collection_id = ? AND is_current = 1 ON CONFLICT(owner_id) DO UPDATE SET run_id = excluded.run_id, revision = revision + 1').bind(owner, owner, collection.id));
  await atomic(db, statements);
  return sessionState(db, owner, date);
}

const tapInput = z.object({ eventId: z.string().min(1).max(128), runId: z.string().min(1).max(128), itemIndex: z.number().int().nonnegative(), date: practiceDate });

export async function practiceTap(db: D1Database, owner: string, body: unknown, date: string): Promise<PracticeSessionState> {
  const input = tapInput.parse(body);
  let committed: { run_id: string; item_index: number; date: string };
  try {
    const result = await atomic(db, [
      db.prepare('INSERT INTO practice_events(owner_id, event_id, run_id, item_index, date) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM practice_events WHERE owner_id = ? AND event_id = ?)')
        .bind(owner, input.eventId, input.runId, input.itemIndex, input.date, owner, input.eventId),
      db.prepare('SELECT run_id, item_index, date FROM practice_events WHERE owner_id = ? AND event_id = ?').bind(owner, input.eventId),
    ]);
    committed = result[1].results![0] as typeof committed;
  } catch (error) {
    if (error instanceof Error && error.message.includes('invalid practice event')) throw new PracticeError('发愿轮次或条目已变化', 409);
    throw error;
  }
  if (committed.run_id !== input.runId || committed.item_index !== input.itemIndex || committed.date !== input.date) throw new PracticeError('事件标识已用于其他敲击', 409);
  return sessionState(db, owner, date);
}