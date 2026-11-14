import { z } from 'zod';
import { ulid } from 'ulid';
import type { D1Database, D1PreparedStatement, R2BucketLike } from './db';
import type { Practice, Collection, PracticeVisibility, PracticeReview } from './practice-types';
import { PracticeError } from './practice-http';
import { interactionState } from './practice-interactions';

export const practiceInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2000).default(''),
  prompts: z.array(z.string().max(1000)).max(100),
  target: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export type ContentKind = 'practices' | 'collections';
export type Content = Practice | Collection;
export const contentTable = (kind: ContentKind) => kind === 'practices' ? 'practices' : 'practice_collections';
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
type PracticeRow = ContentRow & { prompts: string; target: number; item_id?: string; personal_total?: number; today_total?: number };
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
    ...(row.item_id ? { item_id: row.item_id } : {}), personal_total: row.personal_total ?? 0,
  };
}

export async function ownedRow(db: D1Database, kind: ContentKind, id: string, owner: string): Promise<ContentRow> {
  const personal = kind === 'practices' ? `, ${personalTotalSql}` : '';
  const row = await db.prepare(`SELECT *${personal} FROM ${contentTable(kind)} WHERE id = ? AND owner_id = ?`).bind(id, owner).first<ContentRow>();
  if (!row) throw new PracticeError('内容不存在', 404);
  return row;
}

export async function ownedContent(db: D1Database, kind: ContentKind, id: string, owner: string): Promise<Content> {
  const row = await ownedRow(db, kind, id, owner);
  const reviews = (await db.prepare('SELECT id, revision, status, reason FROM practice_reviews WHERE kind = ? AND content_id = ? AND owner_id = ? ORDER BY created_at, id').bind(kind, id, owner).all<PracticeReview>()).results ?? [];
  const interactions = await interactionState(db, kind, id, owner);
  if (kind === 'practices') return { ...practiceFromRow(row as PracticeRow), ...interactions, reviews };
  const result = await db.prepare(`SELECT practices.*, i.id AS item_id, ${personalTotalSql} FROM practice_collection_items i JOIN practices ON practices.id = i.practice_id WHERE i.collection_id = ? ORDER BY i.position`).bind(id).all<PracticeRow>();
  const items = (result.results ?? []).map(practiceFromRow);
  const saved = await db.prepare('SELECT r.id, i.target, COALESCE(c.total, 0) AS total FROM practice_runs r JOIN practice_run_items i ON i.run_id = r.id LEFT JOIN counters c ON c.id = i.practice_id AND c.device_id = r.owner_id WHERE r.owner_id = ? AND r.collection_id = ? AND r.is_current = 1 ORDER BY i.item_index')
    .bind(owner, id).all<{ id: string; target: number; total: number }>();
  const savedItems = saved.results ?? [];
  const counts = savedItems.map((item) => Math.min(item.total, item.target));
  const nextIndex = savedItems.findIndex((item) => item.total < item.target);
  const progress = savedItems.length ? {
    id: savedItems[0].id, index: nextIndex < 0 ? savedItems.length - 1 : nextIndex, completed: nextIndex < 0,
    counts, total: counts.reduce((total, count) => total + count, 0),
  } : null;
  return { ...common(row), ...interactions, items, total_target: items.reduce((total, item) => total + item.target, 0), reviews, progress };
}

export async function listPractices(db: D1Database, owner: string, date: string): Promise<Practice[]> {
  const rows = await db.prepare(`SELECT *, ${personalTotalSql}, ${todayTotalSql} FROM practices WHERE owner_id = ? ORDER BY created_at, id`).bind(date, owner).all<PracticeRow>();
  return Promise.all((rows.results ?? []).map(async (row) => ({ ...practiceFromRow(row), ...await interactionState(db, 'practices', row.id, owner) })));
}

export async function createPractice(db: D1Database, owner: string, body: unknown): Promise<Practice> {
  const input = practiceInput.parse(body);
  const id = ulid();
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO practices (id, owner_id, name, description, prompts, target, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, owner, input.name, input.description, JSON.stringify(input.prompts), input.target, now, now).run();
  const row = await db.prepare('SELECT * FROM practices WHERE id = ? AND owner_id = ?').bind(id, owner).first<PracticeRow>();
  return practiceFromRow(row!);
}

export const collectionInput = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(2000).default(''),
  practiceIds: z.array(z.string().min(1)).max(500),
});

async function itemStatements(db: D1Database, owner: string, id: string, ids: string[]) {
  const distinct = [...new Set(ids)];
  const found = await db.prepare('SELECT COUNT(*) AS count FROM practices WHERE owner_id = ? AND id IN (SELECT value FROM json_each(?))').bind(owner, JSON.stringify(distinct)).first<{ count: number }>();
  if (found!.count !== distinct.length) throw new PracticeError('内容不存在', 404);
  const items = ids.map((practiceId, position) => ({ id: ulid(), practiceId, position }));
  return [db.prepare("INSERT INTO practice_collection_items (id, collection_id, practice_id, position) SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.practiceId'), json_extract(value, '$.position') FROM json_each(?)").bind(id, JSON.stringify(items))];
}

export async function listCollections(db: D1Database, owner: string): Promise<Collection[]> {
  const rows = await db.prepare('SELECT id FROM practice_collections WHERE owner_id = ? ORDER BY created_at, id').bind(owner).all<{ id: string }>();
  return Promise.all((rows.results ?? []).map(async (row) => await ownedContent(db, 'collections', row.id, owner) as Collection));
}

export async function createCollection(db: D1Database, owner: string, body: unknown): Promise<Collection> {
  const input = collectionInput.parse(body);
  const id = ulid();
  const now = new Date().toISOString();
  const items = await itemStatements(db, owner, id, input.practiceIds);
  await atomic(db, [db.prepare('INSERT INTO practice_collections (id, owner_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, owner, input.name, input.description, now, now), ...items]);
  return await ownedContent(db, 'collections', id, owner) as Collection;
}

export async function editContent(db: D1Database, kind: ContentKind, id: string, owner: string, body: unknown): Promise<Content> {
  const row = await ownedRow(db, kind, id, owner);
  const current = await ownedContent(db, kind, id, owner);
  const now = new Date().toISOString();
  if (kind === 'practices') {
    const patch = practiceInput.partial().parse(body);
    const input = practiceInput.parse({ ...current, ...patch });
    await db.prepare("UPDATE practices SET name = ?, description = ?, prompts = ?, target = ?, visibility = CASE WHEN approved_snapshot IS NOT NULL OR visibility = 'pending' THEN 'pending' ELSE visibility END, revision = revision + 1, updated_at = ? WHERE id = ? AND owner_id = ?")
      .bind(input.name, input.description, JSON.stringify(input.prompts), input.target, now, id, owner).run();
  } else {
    const patch = collectionInput.partial().parse(body);
    const statements = [db.prepare("UPDATE practice_collections SET name = ?, description = ?, visibility = CASE WHEN approved_snapshot IS NOT NULL OR visibility = 'pending' THEN 'pending' ELSE visibility END, revision = revision + 1, updated_at = ? WHERE id = ? AND owner_id = ?").bind(patch.name ?? row.name, patch.description ?? row.description, now, id, owner)];
    if (patch.practiceIds) {
      const items = await itemStatements(db, owner, id, patch.practiceIds);
      statements.push(db.prepare('DELETE FROM practice_collection_items WHERE collection_id = ?').bind(id), ...items);
    }
    await atomic(db, statements);
  }
  return ownedContent(db, kind, id, owner);
}

export function withdrawalStatements(db: D1Database, kind: ContentKind, id: string): D1PreparedStatement[] {
  const statements = [db.prepare(`UPDATE ${contentTable(kind)} SET visibility = 'private', approved_snapshot = NULL, published_at = NULL, review_id = NULL, revision = revision + 1, publication_epoch = publication_epoch + 1 WHERE id = ?`).bind(id)];
  if (kind === 'practices') statements.push(db.prepare("UPDATE practice_collections SET visibility = 'private', approved_snapshot = NULL, published_at = NULL, review_id = NULL, revision = revision + 1, publication_epoch = publication_epoch + 1 WHERE approved_snapshot IS NOT NULL AND id IN (SELECT collection_id FROM practice_public_dependencies WHERE practice_id = ?)").bind(id));
  return statements;
}

export async function withdrawContent(db: D1Database, kind: ContentKind, id: string, owner: string): Promise<Content> {
  await ownedRow(db, kind, id, owner);
  await atomic(db, withdrawalStatements(db, kind, id));
  return ownedContent(db, kind, id, owner);
}

export async function deleteContent(db: D1Database, kind: ContentKind, id: string, owner: string, images: R2BucketLike): Promise<void> {
  await ownedRow(db, kind, id, owner);
  if (kind === 'practices') {
    const reference = await db.prepare('SELECT id FROM practice_collection_items WHERE practice_id = ? LIMIT 1').bind(id).first();
    if (reference) throw new PracticeError('请先从发愿集中移除该发愿', 409);
  }
  const imageRows = kind === 'practices'
    ? (await db.prepare('SELECT r2_key FROM images WHERE counter_id = ?').bind(id).all<{ r2_key: string }>()).results ?? []
    : [];
  const statements = withdrawalStatements(db, kind, id);
  statements.push(
    db.prepare('DELETE FROM practice_reviews WHERE kind = ? AND content_id = ?').bind(kind, id),
    db.prepare('DELETE FROM practice_likes WHERE kind = ? AND content_id = ?').bind(kind, id),
    db.prepare('DELETE FROM practice_favorites WHERE kind = ? AND content_id = ?').bind(kind, id),
  );
  if (kind === 'practices') statements.push(
    db.prepare('UPDATE practice_sessions SET run_id = NULL, revision = revision + 1 WHERE run_id IN (SELECT run_id FROM practice_run_items WHERE practice_id = ?)').bind(id),
    db.prepare('DELETE FROM practice_events WHERE run_id IN (SELECT run_id FROM practice_run_items WHERE practice_id = ?)').bind(id),
    db.prepare('DELETE FROM practice_run_items WHERE run_id IN (SELECT run_id FROM practice_run_items WHERE practice_id = ?)').bind(id),
    db.prepare("DELETE FROM practice_runs WHERE EXISTS (SELECT 1 FROM json_each(practice_runs.snapshot, '$.items') WHERE json_extract(value, '$.id') = ?)").bind(id),
    db.prepare('DELETE FROM practice_public_dependencies WHERE practice_id = ?').bind(id),
  );
  if (kind === 'collections') statements.push(
    db.prepare('UPDATE practice_sessions SET run_id = NULL, revision = revision + 1 WHERE owner_id = ? AND run_id IN (SELECT id FROM practice_runs WHERE collection_id = ? AND owner_id = ?)').bind(owner, id, owner),
    db.prepare('DELETE FROM practice_events WHERE run_id IN (SELECT id FROM practice_runs WHERE collection_id = ? AND owner_id = ?)').bind(id, owner),
    db.prepare('DELETE FROM practice_run_items WHERE run_id IN (SELECT id FROM practice_runs WHERE collection_id = ? AND owner_id = ?)').bind(id, owner),
    db.prepare('DELETE FROM practice_runs WHERE collection_id = ? AND owner_id = ?').bind(id, owner),
    db.prepare('DELETE FROM practice_collection_items WHERE collection_id = ?').bind(id),
    db.prepare('DELETE FROM practice_public_dependencies WHERE collection_id = ?').bind(id),
  );
  statements.push(db.prepare(`DELETE FROM ${contentTable(kind)} WHERE id = ? AND owner_id = ?`).bind(id, owner));
  await atomic(db, statements);
  for (const image of imageRows) await images.delete(image.r2_key).catch(() => {});
}