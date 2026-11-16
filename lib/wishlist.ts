import { z } from 'zod';
import { ulid } from 'ulid';
import type { D1Database } from './db';
import { PracticeError } from './practice-http';
import { atomic } from './practice-store';

export const wishlistInput = z.object({ name: z.string().trim().min(1).max(40) });
export const wishlistPatch = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  practiceIds: z.array(z.string().min(1)).max(500).optional(),
});

export interface Wishlist {
  id: string;
  name: string;
  practiceIds: string[];
}

export async function listWishlists(db: D1Database, owner: string): Promise<Wishlist[]> {
  const rows = await db.prepare('SELECT id, name FROM wishlists WHERE owner_id = ? ORDER BY created_at, id').bind(owner).all<{ id: string; name: string }>();
  const items = await db.prepare('SELECT wishlist_id, practice_id FROM wishlist_items ORDER BY created_at').all<{ wishlist_id: string; practice_id: string }>();
  const byList = new Map<string, string[]>();
  for (const item of items.results ?? []) {
    const list = byList.get(item.wishlist_id) ?? [];
    list.push(item.practice_id);
    byList.set(item.wishlist_id, list);
  }
  return (rows.results ?? []).map((row) => ({ id: row.id, name: row.name, practiceIds: byList.get(row.id) ?? [] }));
}

async function owned(DB: D1Database, id: string, owner: string): Promise<Wishlist> {
  const row = await DB.prepare('SELECT id, name FROM wishlists WHERE id = ? AND owner_id = ?').bind(id, owner).first<{ id: string; name: string }>();
  if (!row) throw new PracticeError('愿单不存在', 404);
  const items = await DB.prepare('SELECT practice_id FROM wishlist_items WHERE wishlist_id = ? ORDER BY created_at').bind(id).all<{ practice_id: string }>();
  return { id: row.id, name: row.name, practiceIds: (items.results ?? []).map((item) => item.practice_id) };
}

export async function createWishlist(db: D1Database, owner: string, body: unknown): Promise<Wishlist> {
  const input = wishlistInput.parse(body);
  const id = ulid();
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO wishlists (id, owner_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, owner, input.name, now, now).run();
  return owned(db, id, owner);
}

export async function updateWishlist(db: D1Database, id: string, owner: string, body: unknown): Promise<Wishlist> {
  const patch = wishlistPatch.parse(body);
  const current = await owned(db, id, owner);
  const now = new Date().toISOString();
  const statements = [];
  if (patch.name) statements.push(db.prepare('UPDATE wishlists SET name = ?, updated_at = ? WHERE id = ? AND owner_id = ?').bind(patch.name, now, id, owner));
  if (patch.practiceIds) {
    const distinct = [...new Set(patch.practiceIds)];
    const found = await db.prepare('SELECT COUNT(*) AS count FROM practices WHERE owner_id = ? AND id IN (SELECT value FROM json_each(?))').bind(owner, JSON.stringify(distinct)).first<{ count: number }>();
    if (found!.count !== distinct.length) throw new PracticeError('内容不存在', 404);
    const items = distinct.map((practiceId) => ({ wishlistId: id, practiceId, createdAt: now }));
    statements.push(
      db.prepare('DELETE FROM wishlist_items WHERE wishlist_id = ?').bind(id),
      db.prepare("INSERT INTO wishlist_items (wishlist_id, practice_id, created_at) SELECT json_extract(value, '$.wishlistId'), json_extract(value, '$.practiceId'), json_extract(value, '$.createdAt') FROM json_each(?)").bind(JSON.stringify(items)),
    );
  }
  if (statements.length) await atomic(db, statements);
  return patch.name || patch.practiceIds ? owned(db, id, owner) : current;
}

export async function deleteWishlist(db: D1Database, id: string, owner: string): Promise<void> {
  await owned(db, id, owner);
  if (!db.batch) throw new Error('D1 batch is required');
  await atomic(db, [
    db.prepare('DELETE FROM wishlist_items WHERE wishlist_id = ?').bind(id),
    db.prepare('DELETE FROM wishlists WHERE id = ? AND owner_id = ?').bind(id, owner),
  ]);
}
