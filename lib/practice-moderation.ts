import { ulid } from 'ulid';
import type { D1Database } from './db';
import type { Practice } from './practice-types';
import { PracticeError } from './practice-http';
import { atomic, ownedContent, ownedRow } from './practice-store';

export interface PracticeModerationSubmission {
  kind: 'practices';
  id: string;
  revision: number;
  snapshot: Practice;
}

export type PracticeModerationAdapter = (submission: PracticeModerationSubmission) => Promise<{ approved: boolean; reason?: string }>;

let adapter: PracticeModerationAdapter = async () => ({ approved: true });

export function setPracticeModerationAdapter(next: PracticeModerationAdapter): () => void {
  const previous = adapter;
  adapter = next;
  return () => { adapter = previous; };
}

export function contentSnapshot(content: Practice): Practice {
  const { personal_total, reviews, ...snapshot } = content;
  return { ...snapshot, visibility: 'public', likes: 0, liked: false, favorited: false };
}

export async function publicContent(db: D1Database, id: string): Promise<Practice> {
  const row = await db.prepare("SELECT approved_snapshot FROM practices WHERE id = ? AND approved_snapshot IS NOT NULL").bind(id).first<{ approved_snapshot: string }>();
  if (!row) throw new PracticeError('公开内容不可访问', 404);
  return JSON.parse(row.approved_snapshot) as Practice;
}

export async function reviewContent(db: D1Database, id: string, owner: string): Promise<Practice> {
  const row = await ownedRow(db, id, owner);
  const snapshot = contentSnapshot(await ownedContent(db, id, owner));
  const snapshotText = JSON.stringify(snapshot);
  const reviewId = ulid();
  const now = new Date().toISOString();
  await atomic(db, [
    db.prepare("UPDATE practices SET visibility = 'pending', review_id = ? WHERE id = ? AND owner_id = ? AND revision = ?").bind(reviewId, id, owner, row.revision),
    db.prepare("INSERT INTO practice_reviews(id, kind, content_id, owner_id, revision, snapshot, status, created_at) SELECT ?, 'practices', ?, ?, ?, ?, 'pending', ? WHERE EXISTS (SELECT 1 FROM practices WHERE id = ? AND review_id = ? AND revision = ?)").bind(reviewId, id, owner, row.revision, snapshotText, now, id, reviewId, row.revision),
  ]);
  const pending = await db.prepare('SELECT id FROM practice_reviews WHERE id = ?').bind(reviewId).first();
  if (!pending) throw new PracticeError('内容已修改，请重试送审', 409);
  let decision: { approved: boolean; reason?: string };
  try { decision = await adapter({ kind: 'practices', id, revision: row.revision, snapshot: JSON.parse(snapshotText) }); }
  catch {
    await db.prepare("UPDATE practice_reviews SET status = CASE WHEN EXISTS (SELECT 1 FROM practices WHERE id = ? AND revision = ? AND review_id = ?) THEN 'error' ELSE 'stale' END, reason = '审核服务不可用', reviewed_at = ? WHERE id = ?").bind(id, row.revision, reviewId, new Date().toISOString(), reviewId).run();
    throw new PracticeError('审核服务不可用，请重试', 502);
  }
  const status = decision.approved ? 'approved' : 'rejected';
  await atomic(db, [
    db.prepare("UPDATE practice_reviews SET status = CASE WHEN EXISTS (SELECT 1 FROM practices WHERE id = ? AND owner_id = ? AND revision = ? AND review_id = ?) THEN ? ELSE 'stale' END, reason = ?, reviewed_at = ? WHERE id = ?")
      .bind(id, owner, row.revision, reviewId, status, decision.reason ?? null, new Date().toISOString(), reviewId),
    db.prepare("UPDATE practices SET visibility = ?, approved_snapshot = CASE WHEN ? THEN ? ELSE approved_snapshot END, published_at = CASE WHEN ? THEN ? ELSE published_at END WHERE id = ? AND owner_id = ? AND revision = ? AND review_id = ? AND EXISTS (SELECT 1 FROM practice_reviews WHERE id = ? AND status = ?)")
      .bind(decision.approved ? 'public' : 'rejected', decision.approved ? 1 : 0, snapshotText, decision.approved ? 1 : 0, new Date().toISOString(), id, owner, row.revision, reviewId, reviewId, status),
  ]);
  return ownedContent(db, id, owner);
}
