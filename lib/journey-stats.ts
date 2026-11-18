import type { D1Database } from './db';

export interface JourneyStats {
  seconds: number;
  today: number;
  week: number;
  month: number;
}

// 四项全部取自 tap_events：历史是全部打卡流水，归零只清当前轮进度，不会让修行历史倒退。
// 次数 × 2 秒，时长按秒；本周按自然周（周一 00:00 起）。
export async function journeyStats(db: D1Database, owner: string): Promise<JourneyStats> {
  const day = "date('now', '+8 hours')";
  // strftime('%w')：0=周日；把周一挪到 0。
  const weekStart = "date('now', '+8 hours', '-' || ((CAST(strftime('%w','now','+8 hours') AS INTEGER) + 6) % 7) || ' days')";
  const rows = await db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN p.target_kind = 'time' THEN t.delta ELSE t.delta * 2 END), 0) AS seconds,
      COALESCE(SUM(CASE WHEN t.date = ${day} THEN CASE WHEN p.target_kind = 'time' THEN t.delta ELSE t.delta * 2 END END), 0) AS today,
      COALESCE(SUM(CASE WHEN t.date >= ${weekStart} THEN CASE WHEN p.target_kind = 'time' THEN t.delta ELSE t.delta * 2 END END), 0) AS week,
      COALESCE(SUM(CASE WHEN substr(t.date, 1, 7) = strftime('%Y-%m', 'now', '+8 hours') THEN CASE WHEN p.target_kind = 'time' THEN t.delta ELSE t.delta * 2 END END), 0) AS month
    FROM tap_events t JOIN practices p ON p.id = t.counter_id WHERE p.owner_id = ?`).bind(owner).first<{ seconds: number; today: number; week: number; month: number }>();
  return {
    seconds: Math.max(0, rows?.seconds ?? 0),
    today: Math.max(0, rows?.today ?? 0),
    week: Math.max(0, rows?.week ?? 0),
    month: Math.max(0, rows?.month ?? 0),
  };
}
