import type { D1Database } from './db';

export interface JourneyStats {
  seconds: number;
  today: number;
  week: number;
  month: number;
}

// 四项全部取自 journey_daily（一人一天一行）：删除发愿、归零都不会让修行历史倒退。
// 次数 × 2 秒，时长按秒；本周按自然周（周一 00:00 起）。
export async function journeyStats(db: D1Database, owner: string): Promise<JourneyStats> {
  const day = "date('now', '+8 hours')";
  // strftime('%w')：0=周日；把周一挪到 0。
  const weekStart = "date('now', '+8 hours', '-' || ((CAST(strftime('%w','now','+8 hours') AS INTEGER) + 6) % 7) || ' days')";
  // 总账独立于发愿：删除发愿、归零都不影响历史修行时间。
  const rows = await db.prepare(`SELECT
      COALESCE(SUM(seconds), 0) AS seconds,
      COALESCE(SUM(CASE WHEN date = ${day} THEN seconds END), 0) AS today,
      COALESCE(SUM(CASE WHEN date >= ${weekStart} THEN seconds END), 0) AS week,
      COALESCE(SUM(CASE WHEN substr(date, 1, 7) = strftime('%Y-%m', 'now', '+8 hours') THEN seconds END), 0) AS month
    FROM journey_daily WHERE owner_id = ?`).bind(owner).first<{ seconds: number; today: number; week: number; month: number }>();
  return {
    seconds: Math.max(0, rows?.seconds ?? 0),
    today: Math.max(0, rows?.today ?? 0),
    week: Math.max(0, rows?.week ?? 0),
    month: Math.max(0, rows?.month ?? 0),
  };
}
