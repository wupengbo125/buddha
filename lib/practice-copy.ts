import { ulid } from 'ulid';
import type { D1Database, D1PreparedStatement } from './db';
import { PracticeError } from './practice-http';
import { publicContent } from './practice-moderation';
import { atomic, ownedContent } from './practice-store';
import type { Practice } from './practice-types';

export async function copyContent(db: D1Database, sourceId: string, owner: string): Promise<Practice> {
  // 自己的发愿（含未公开）直接复制；别人的只能复制已公开并审核过的版本。
  const mine = await db.prepare('SELECT id FROM practices WHERE id = ? AND owner_id = ?').bind(sourceId, owner).first<{ id: string }>();
  const source = mine ? await ownedContent(db, sourceId, owner) : await publicContent(db, sourceId);
  const sourceText = JSON.stringify(source);
  // 自己的发愿按 id+owner 守；别人的按公开快照守，防止复制中途被替换。
  const sourceGuard = mine
    ? 'EXISTS (SELECT 1 FROM practices WHERE id = ? AND owner_id = ?)'
    : 'EXISTS (SELECT 1 FROM practices WHERE id = ? AND approved_snapshot = ?)';
  const guardParams = mine ? [sourceId, owner] : [sourceId, sourceText];
  const now = new Date().toISOString();
  const id = ulid();
  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO practices(id, owner_id, name, description, prompts, target, target_kind, target_seconds, idle_seconds, min_seconds, source_id, source_name, source_owner_id, created_at, updated_at)
      SELECT ?, ?, json_extract(value, '$.name'), json_extract(value, '$.description'), json_extract(value, '$.prompts'), json_extract(value, '$.target'), COALESCE(json_extract(value, '$.targetKind'), 'count'), COALESCE(json_extract(value, '$.targetSeconds'), 0), COALESCE(json_extract(value, '$.idleSeconds'), 10), COALESCE(json_extract(value, '$.minSeconds'), 300), json_extract(value, '$.id'), json_extract(value, '$.name'), json_extract(value, '$.owner_id'), ?, ? FROM json_each(?) WHERE ${sourceGuard}`)
      .bind(id, owner, now, now, JSON.stringify([{ ...source, id: source.id }]), ...guardParams),
  ];
  await atomic(db, statements);
  const created = await db.prepare('SELECT id FROM practices WHERE id = ? AND owner_id = ?').bind(id, owner).first();
  if (!created) throw new PracticeError('来源已变化，请重新读取', 409);
  return ownedContent(db, id, owner);
}
