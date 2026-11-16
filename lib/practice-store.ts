import { z } from 'zod';
import { ulid } from 'ulid';
import type { D1Database, D1PreparedStatement, R2BucketLike } from './db';
import type { Practice, PracticeVisibility, PracticeReview } from './practice-types';
import { PracticeError } from './practice-http';
import { interactionState } from './practice-interactions';

export const practiceInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2000).default(''),
  prompts: z.array(z.string().max(1000)).max(100),
  target: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  targetKind: z.enum(['count', 'time']).default('count'),
  targetSeconds: z.number().int().min(0).max(604800).default(3600),
  idleSeconds: z.number().int().min(1).max(60).default(10),
  // 时长模式单位是秒、次数模式单位是声，所以下限只到 1；时长模式的最小 60 秒由编辑页保证。
  minSeconds: z.number().int().min(1).max(36000).default(300),
});

// 只剩发愿一种内容，但数据库里的 kind 列（reviews / likes / favorites）仍写 'practices'。
export type ContentKind = 'practices';
export type Content = Practice;
export const contentTable = () => 'practices';
export interface ContentRow {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  visibility: PracticeVisibility;
  source_id: string | null;
  source_name: string | null;
  source_owner_id: string | null;
  revision: number;
  review_id: string | null;
  publication_epoch: number;
  approved_snapshot: string | null;
  published_at: string | null;
}
type PracticeRow = ContentRow & { prompts: string; target: number; target_kind?: string; target_seconds?: number; idle_seconds?: number; min_seconds?: number; round_done?: number; personal_total?: number; today_total?: number; };
const personalTotalSql = 'COALESCE((SELECT total FROM counters WHERE id = practices.id), 0) AS personal_total';
const todayTotalSql = 'COALESCE((SELECT CASE WHEN today_date = ? THEN today ELSE 0 END FROM counters WHERE id = practices.id), 0) AS today_total';

export async function atomic(db: D1Database, statements: D1PreparedStatement[]) {
  if (!db.batch) throw new Error('D1 batch is required');
  return db.batch(statements);
}

function common(row: ContentRow) {
  return {
    id: row.id, owner_id: row.owner_id, name: row.name, description: row.description,
    visibility: row.visibility, source_id: row.source_id, source_name: row.source_name,
    source_owner_id: row.source_owner_id, likes: 0, liked: false, favorited: false,
  };
}

function parsePrompts(value: unknown): string[] {
  if (Array.isArray(value)) return (value as string[]).filter((item) => typeof item === 'string');
  if (typeof value !== 'string' || value.trim() === '') return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? (parsed as string[]).filter((item) => typeof item === 'string') : []; }
  catch { return []; }
}

export function practiceFromRow(row: PracticeRow): Practice {
  return {
    ...common(row), target: row.target, prompts: parsePrompts(row.prompts),
    targetKind: (row.target_kind === 'time' ? 'time' : 'count') as 'count' | 'time',
    targetSeconds: row.target_seconds ?? 0, idleSeconds: row.idle_seconds ?? 10,
    minSeconds: row.min_seconds ?? 300,
    roundDone: Boolean(row.round_done),
    personal_total: row.personal_total ?? 0,
    today_total: row.today_total ?? 0,
  };
}

export async function ownedRow(db: D1Database, id: string, owner: string): Promise<ContentRow> {
  const row = await db.prepare(`SELECT *, ${personalTotalSql} FROM practices WHERE id = ? AND owner_id = ?`).bind(id, owner).first<ContentRow>();
  if (!row) throw new PracticeError('内容不存在', 404);
  return row;
}

export async function ownedContent(db: D1Database, id: string, owner: string, date = ''): Promise<Practice> {
  const row = await ownedRow(db, id, owner);
  const reviews = (await db.prepare('SELECT id, revision, status, reason FROM practice_reviews WHERE kind = ? AND content_id = ? AND owner_id = ? ORDER BY created_at, id').bind('practices', id, owner).all<PracticeReview>()).results ?? [];
  const interactions = await interactionState(db, 'practices', id, owner);
  void date;
  return { ...practiceFromRow(row as PracticeRow), ...interactions, reviews };
}

export async function listPractices(db: D1Database, owner: string, date: string): Promise<Practice[]> {
  const rows = await db.prepare(`SELECT *, ${personalTotalSql}, ${todayTotalSql} FROM practices WHERE owner_id = ? ORDER BY created_at, id`).bind(date, owner).all<PracticeRow>();
  return Promise.all((rows.results ?? []).map(async (row) => ({ ...practiceFromRow(row), ...await interactionState(db, 'practices', row.id, owner) })));
}

export async function createPractice(db: D1Database, owner: string, body: unknown): Promise<Practice> {
  const input = practiceInput.parse(body);
  const id = ulid();
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO practices (id, owner_id, name, description, prompts, target, target_kind, target_seconds, idle_seconds, min_seconds, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, owner, input.name, input.description, JSON.stringify(input.prompts), input.target, input.targetKind, input.targetSeconds, input.idleSeconds, input.minSeconds, now, now).run();
  const row = await db.prepare('SELECT * FROM practices WHERE id = ? AND owner_id = ?').bind(id, owner).first<PracticeRow>();
  return practiceFromRow(row!);
}

export async function editContent(db: D1Database, id: string, owner: string, body: unknown): Promise<Practice> {
  await ownedRow(db, id, owner);
  const current = await ownedContent(db, id, owner);
  const patch = practiceInput.partial().parse(body);
  const input = practiceInput.parse({ ...current, ...patch });
  await db.prepare("UPDATE practices SET name = ?, description = ?, prompts = ?, target = ?, target_kind = ?, target_seconds = ?, idle_seconds = ?, min_seconds = ?, visibility = CASE WHEN approved_snapshot IS NOT NULL OR visibility = 'pending' THEN 'pending' ELSE visibility END, revision = revision + 1, updated_at = ? WHERE id = ? AND owner_id = ?")
    .bind(input.name, input.description, JSON.stringify(input.prompts), input.target, input.targetKind, input.targetSeconds, input.idleSeconds, input.minSeconds, new Date().toISOString(), id, owner).run();
  return ownedContent(db, id, owner);
}

export function withdrawalStatements(db: D1Database, id: string): D1PreparedStatement[] {
  return [db.prepare("UPDATE practices SET visibility = 'private', approved_snapshot = NULL, published_at = NULL, review_id = NULL, revision = revision + 1, publication_epoch = publication_epoch + 1 WHERE id = ?").bind(id)];
}

export async function withdrawContent(db: D1Database, id: string, owner: string): Promise<Practice> {
  await ownedRow(db, id, owner);
  await atomic(db, withdrawalStatements(db, id));
  return ownedContent(db, id, owner);
}

export async function deleteContent(db: D1Database, id: string, owner: string, images: R2BucketLike): Promise<void> {
  await ownedRow(db, id, owner);
  const imageRows = (await db.prepare('SELECT r2_key FROM images WHERE counter_id = ?').bind(id).all<{ r2_key: string }>()).results ?? [];
  const statements = withdrawalStatements(db, id);
  statements.push(
    db.prepare('DELETE FROM practice_reviews WHERE kind = ? AND content_id = ?').bind('practices', id),
    db.prepare('DELETE FROM practice_likes WHERE kind = ? AND content_id = ?').bind('practices', id),
    db.prepare('DELETE FROM practice_favorites WHERE kind = ? AND content_id = ?').bind('practices', id),
    db.prepare('DELETE FROM practices WHERE id = ? AND owner_id = ?').bind(id, owner),
  );
  await atomic(db, statements);
  for (const image of imageRows) await images.delete(image.r2_key).catch(() => {});
}
