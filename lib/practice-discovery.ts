import { z } from 'zod';
import type { D1Database } from './db';
import type { Content, ContentKind } from './practice-store';
import { PracticeError } from './practice-http';
import { publicContent } from './practice-moderation';
import { interactionState } from './practice-interactions';

export async function discoverContent(db: D1Database, id: string, owner: string | null): Promise<Content> {
  const content = await publicContent(db, id);
  return { ...content, ...await interactionState(db, 'practices', id, owner) };
}

const queryInput = z.object({
  sort: z.enum(['latest', 'likes']).default('latest'),
  q: z.string().max(200).default(''),
  page: z.coerce.number().int().positive().max(1000000).default(1),
});

export async function discoverList(db: D1Database, owner: string | null, url: URL) {
  const input = queryInput.parse(Object.fromEntries(url.searchParams));
  const pattern = `%${input.q.replace(/[\\%_]/g, '\\$&')}%`;
  const order = input.sort === 'likes' ? "(SELECT COUNT(*) FROM practice_likes l WHERE l.kind = 'practices' AND l.content_id = c.id) DESC, " : '';
  const rows = await db.prepare(`SELECT c.id FROM practices c WHERE c.approved_snapshot IS NOT NULL
    AND (json_extract(c.approved_snapshot, '$.name') LIKE ? ESCAPE '\\' OR json_extract(c.approved_snapshot, '$.description') LIKE ? ESCAPE '\\')
    ORDER BY ${order}c.published_at DESC, c.id ASC LIMIT 21 OFFSET ?`)
    .bind(pattern, pattern, (input.page - 1) * 20).all<{ id: string }>();
  const page = rows.results ?? [];
  const items = await Promise.all(page.slice(0, 20).map(async (row) => {
    try { return await discoverContent(db, row.id, owner); }
    catch (error) { if (error instanceof PracticeError && error.status === 404) return null; throw error; }
  }));
  return { items: items.filter((item): item is Content => item !== null), page: input.page, hasMore: page.length > 20 };
}

export async function changeInteraction(db: D1Database, id: string, owner: string, action: 'like' | 'favorite', enabled: boolean) {
  const table = action === 'like' ? 'practice_likes' : 'practice_favorites';
  if (enabled) {
    await publicContent(db, id);
    await db.prepare(`INSERT OR IGNORE INTO ${table}(owner_id, kind, content_id, created_at) SELECT ?, 'practices', ?, ? WHERE EXISTS (SELECT 1 FROM practices WHERE id = ? AND approved_snapshot IS NOT NULL)`)
      .bind(owner, id, new Date().toISOString(), id).run();
  } else {
    await db.prepare(`DELETE FROM ${table} WHERE owner_id = ? AND kind = 'practices' AND content_id = ?`).bind(owner, id).run();
  }
  try { return await discoverContent(db, id, owner); }
  catch (error) {
    if (!enabled && error instanceof PracticeError && error.status === 404) return { id, kind: 'practices', available: false, ...await interactionState(db, 'practices', id, owner) };
    throw error;
  }
}

export async function favoriteList(db: D1Database, owner: string, url: URL) {
  const rows = await db.prepare("SELECT kind, content_id FROM practice_favorites WHERE owner_id = ? AND kind = 'practices' ORDER BY created_at DESC, content_id")
    .bind(owner).all<{ kind: ContentKind; content_id: string }>();
  const items = await Promise.all((rows.results ?? []).map(async (row) => {
    let content: Content | null = null;
    try { content = await discoverContent(db, row.content_id, owner); }
    catch (error) { if (!(error instanceof PracticeError && error.status === 404)) throw error; }
    return { id: row.content_id, kind: row.kind, available: content !== null, content };
  }));
  return { items };
}