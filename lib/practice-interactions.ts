import type { D1Database } from './db';
import type { ContentKind } from './practice-store';

export async function interactionState(db: D1Database, kind: ContentKind, id: string, owner: string | null) {
  const result = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM practice_likes WHERE kind = ? AND content_id = ?) AS likes,
    EXISTS(SELECT 1 FROM practice_likes WHERE kind = ? AND content_id = ? AND owner_id = ?) AS liked,
    EXISTS(SELECT 1 FROM practice_favorites WHERE kind = ? AND content_id = ? AND owner_id = ?) AS favorited`)
    .bind(kind, id, kind, id, owner, kind, id, owner).first<{ likes: number; liked: number; favorited: number }>();
  return { likes: result!.likes, liked: Boolean(result!.liked), favorited: Boolean(result!.favorited) };
}