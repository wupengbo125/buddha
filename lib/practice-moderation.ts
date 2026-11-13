import { ulid } from 'ulid';
import type { D1Database } from './db';
import type { Collection, Practice } from './practice-types';
import { PracticeError } from './practice-http';
import { atomic, contentTable, ownedContent, ownedRow, type Content, type ContentKind, type ContentRow } from './practice-store';

export interface PracticeModerationSubmission {
  kind: ContentKind;
  id: string;
  revision: number;
  snapshot: Content;
}

export type PracticeModerationAdapter = (submission: PracticeModerationSubmission) => Promise<{ approved: boolean; reason?: string }>;

let adapter: PracticeModerationAdapter = async () => ({ approved: true });

export function setPracticeModerationAdapter(next: PracticeModerationAdapter): () => void {
  const previous = adapter;
  adapter = next;
  return () => { adapter = previous; };
}

function cleanPractice(content: Practice): Practice {
  const { personal_total, reviews, ...snapshot } = content;
  return { ...snapshot, visibility: 'public', likes: 0, liked: false, favorited: false };
}

export function contentSnapshot(content: Content): Content {
  if ('recitation' in content) return cleanPractice(content);
  const { reviews, progress, ...snapshot } = content;
  return { ...snapshot, visibility: 'public', likes: 0, liked: false, favorited: false, items: content.items.map(cleanPractice) };
}

export async function publicContent(db: D1Database, kind: ContentKind, id: string): Promise<Content> {
  const dependencies = kind === 'collections' ? ' AND NOT EXISTS (SELECT 1 FROM practice_public_dependencies d LEFT JOIN practices p ON p.id = d.practice_id WHERE d.collection_id = practice_collections.id AND p.approved_snapshot IS NULL)' : '';
  const row = await db.prepare(`SELECT approved_snapshot FROM ${contentTable(kind)} WHERE id = ? AND approved_snapshot IS NOT NULL${dependencies}`).bind(id).first<{ approved_snapshot: string }>();
  if (!row) throw new PracticeError('公开内容不可访问', 404);
  return JSON.parse(row.approved_snapshot) as Content;
}

export async function reviewContent(db: D1Database, kind: ContentKind, id: string, owner: string): Promise<Content> {
  const row = await ownedRow(db, kind, id, owner);
  let snapshot = contentSnapshot(await ownedContent(db, kind, id, owner));
  const dependencies: { id: string; epoch: number }[] = [];
  if (kind === 'collections') {
    const collection = snapshot as Collection;
    if (!collection.items.length) throw new PracticeError('空发愿集不能公开', 409);
    const children = await db.prepare('SELECT id, approved_snapshot, publication_epoch FROM practices WHERE owner_id = ? AND id IN (SELECT value FROM json_each(?))')
      .bind(owner, JSON.stringify(collection.items.map((item) => item.id))).all<ContentRow>();
    const childById = new Map((children.results ?? []).map((child) => [child.id, child]));
    const items: Practice[] = [];
    for (const item of collection.items) {
      const child = childById.get(item.id);
      if (!child?.approved_snapshot) throw new PracticeError('请先公开并审核通过所有发愿', 409);
      dependencies.push({ id: item.id, epoch: child.publication_epoch });
      items.push({ ...JSON.parse(child.approved_snapshot), item_id: item.item_id });
    }
    snapshot = { ...collection, items, total_target: items.reduce((total, item) => total + item.target, 0) };
  }
  const snapshotText = JSON.stringify(snapshot);
  const reviewId = ulid();
  const now = new Date().toISOString();
  const table = contentTable(kind);
  await atomic(db, [
    db.prepare(`UPDATE ${table} SET visibility = 'pending', review_id = ? WHERE id = ? AND owner_id = ? AND revision = ?`).bind(reviewId, id, owner, row.revision),
    db.prepare(`INSERT INTO practice_reviews(id, kind, content_id, owner_id, revision, snapshot, status, created_at) SELECT ?, ?, ?, ?, ?, ?, 'pending', ? WHERE EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND review_id = ? AND revision = ?)`).bind(reviewId, kind, id, owner, row.revision, snapshotText, now, id, reviewId, row.revision),
  ]);
  const pending = await db.prepare('SELECT id FROM practice_reviews WHERE id = ?').bind(reviewId).first();
  if (!pending) throw new PracticeError('内容已修改，请重试送审', 409);
  let decision: { approved: boolean; reason?: string };
  try { decision = await adapter({ kind, id, revision: row.revision, snapshot: JSON.parse(snapshotText) }); }
  catch {
    await db.prepare(`UPDATE practice_reviews SET status = CASE WHEN EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND revision = ? AND review_id = ?) THEN 'error' ELSE 'stale' END, reason = '审核服务不可用', reviewed_at = ? WHERE id = ?`).bind(id, row.revision, reviewId, new Date().toISOString(), reviewId).run();
    throw new PracticeError('审核服务不可用，请重试', 502);
  }
  const guard = kind === 'collections' ? "NOT EXISTS (SELECT 1 FROM json_each(?) dependency LEFT JOIN practices child ON child.id = json_extract(dependency.value, '$.id') WHERE child.approved_snapshot IS NULL OR child.publication_epoch != json_extract(dependency.value, '$.epoch'))" : '';
  const dependencyParams = guard ? [JSON.stringify(dependencies)] : [];
  const status = decision.approved ? 'approved' : 'rejected';
  const statements = [
    db.prepare(`UPDATE practice_reviews SET status = CASE WHEN EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND owner_id = ? AND revision = ? AND review_id = ?)${guard ? ` AND ${guard}` : ''} THEN ? ELSE 'stale' END, reason = ?, reviewed_at = ? WHERE id = ?`)
      .bind(id, owner, row.revision, reviewId, ...dependencyParams, status, decision.reason ?? null, new Date().toISOString(), reviewId),
    db.prepare(`UPDATE ${table} SET visibility = ?, approved_snapshot = CASE WHEN ? THEN ? ELSE approved_snapshot END, published_at = CASE WHEN ? THEN ? ELSE published_at END WHERE id = ? AND owner_id = ? AND revision = ? AND review_id = ? AND EXISTS (SELECT 1 FROM practice_reviews WHERE id = ? AND status = ?)`)
      .bind(decision.approved ? 'public' : 'rejected', decision.approved ? 1 : 0, snapshotText, decision.approved ? 1 : 0, new Date().toISOString(), id, owner, row.revision, reviewId, reviewId, status),
  ];
  if (kind === 'collections' && decision.approved) {
    const applied = 'EXISTS (SELECT 1 FROM practice_collections WHERE id = ? AND review_id = ? AND revision = ?) AND EXISTS (SELECT 1 FROM practice_reviews WHERE id = ? AND status = \'approved\')';
    statements.push(db.prepare(`DELETE FROM practice_public_dependencies WHERE collection_id = ? AND ${applied}`).bind(id, id, reviewId, row.revision, reviewId));
    const distinct = [...new Map(dependencies.map((entry) => [entry.id, entry])).values()];
    statements.push(db.prepare(`INSERT INTO practice_public_dependencies(collection_id, practice_id) SELECT ?, json_extract(value, '$.id') FROM json_each(?) WHERE ${applied}`).bind(id, JSON.stringify(distinct), id, reviewId, row.revision, reviewId));
  }
  await atomic(db, statements);
  return ownedContent(db, kind, id, owner);
}