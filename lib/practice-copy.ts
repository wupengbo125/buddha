import { ulid } from 'ulid';
import type { D1Database, D1PreparedStatement } from './db';
import type { Collection, Practice } from './practice-types';
import { PracticeError } from './practice-http';
import { publicContent } from './practice-moderation';
import { atomic, contentTable, ownedContent, type Content, type ContentKind } from './practice-store';

export async function copyContent(db: D1Database, kind: ContentKind, sourceId: string, owner: string): Promise<Content> {
  const source = await publicContent(db, kind, sourceId);
  const sourceText = JSON.stringify(source);
  const sourceGuard = `EXISTS (SELECT 1 FROM ${contentTable(kind)} WHERE id = ? AND approved_snapshot = ?)`;
  const guardParams = [sourceId, sourceText];
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  const practiceCopies: { id: string; source: Practice }[] = [];
  const addPractice = (practice: Practice, id: string) => {
    practiceCopies.push({ id, source: practice });
  };
  const id = ulid();
  if (kind === 'practices') addPractice(source as Practice, id);
  else {
    const collection = source as Collection;
    const copies = new Map<string, string>();
    for (const practice of collection.items) {
      if (!copies.has(practice.id)) {
        const practiceId = ulid();
        copies.set(practice.id, practiceId);
        addPractice(practice, practiceId);
      }
    }
    statements.push(db.prepare(`INSERT INTO practice_collections(id, owner_id, name, description, source_id, source_name, source_owner_id, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${sourceGuard}`)
      .bind(id, owner, collection.name, collection.description, collection.id, collection.name, collection.owner_id, now, now, ...guardParams));
    const items = collection.items.map((practice, position) => ({ id: ulid(), practiceId: copies.get(practice.id), position }));
    statements.push(db.prepare(`INSERT INTO practice_collection_items(id, collection_id, practice_id, position) SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.practiceId'), json_extract(value, '$.position') FROM json_each(?) WHERE ${sourceGuard}`)
      .bind(id, JSON.stringify(items), ...guardParams));
  }
  statements.unshift(db.prepare(`INSERT INTO practices(id, owner_id, name, description, prompts, target, source_id, source_name, source_owner_id, created_at, updated_at)
    SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.source.name'), json_extract(value, '$.source.description'), json_extract(value, '$.source.prompts'), json_extract(value, '$.source.target'), json_extract(value, '$.source.id'), json_extract(value, '$.source.name'), json_extract(value, '$.source.owner_id'), ?, ? FROM json_each(?) WHERE ${sourceGuard}`)
    .bind(owner, now, now, JSON.stringify(practiceCopies), ...guardParams));
  await atomic(db, statements);
  const created = await db.prepare(`SELECT id FROM ${contentTable(kind)} WHERE id = ? AND owner_id = ?`).bind(id, owner).first();
  if (!created) throw new PracticeError('来源已变化，请重新读取', 409);
  return ownedContent(db, kind, id, owner);
}