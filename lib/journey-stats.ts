import type { D1Database } from './db';

export interface JourneyStats {
  /** 历史总秒数。 */
  seconds: number;
  /** 本周（自然周，周一起）秒数。 */
  week: number;
}

// 西游总账一人一行：历史总秒数 + 本周秒数。删除发愿、归零、切换模式都不影响它。
export async function journeyStats(db: D1Database, owner: string): Promise<JourneyStats> {
  const row = await db.prepare('SELECT seconds, week_seconds FROM journey_totals WHERE owner_id = ?').bind(owner).first<{ seconds: number; week_seconds: number }>();
  return { seconds: Math.max(0, row?.seconds ?? 0), week: Math.max(0, row?.week_seconds ?? 0) };
}
