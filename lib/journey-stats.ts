import type { D1Database } from './db';

export interface JourneyStats {
  seconds: number;
  today: number;
  week: number;
  month: number;
}

// 历史累计取 counters.total（次数 × 2 秒，时长按秒）；今日/本周/本月按 tap_events 的日期折算。
export async function journeyStats(db: D1Database, owner: string): Promise<JourneyStats> {
  const totals = await db.prepare(`SELECT COALESCE(SUM(CASE WHEN p.target_kind = 'time' THEN c.total ELSE c.total * 2 END), 0) AS seconds
    FROM practices p LEFT JOIN counters c ON c.id = p.id WHERE p.owner_id = ?`).bind(owner).first<{ seconds: number }>();
  const day = "date('now', '+8 hours')";
  const rows = await db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN t.date = ${day} THEN CASE WHEN p.target_kind = 'time' THEN t.delta ELSE t.delta * 2 END END), 0) AS today,
      COALESCE(SUM(CASE WHEN t.date >= date('now', '+8 hours', '-6 days') THEN CASE WHEN p.target_kind = 'time' THEN t.delta ELSE t.delta * 2 END END), 0) AS week,
      COALESCE(SUM(CASE WHEN substr(t.date, 1, 7) = strftime('%Y-%m', 'now', '+8 hours') THEN CASE WHEN p.target_kind = 'time' THEN t.delta ELSE t.delta * 2 END END), 0) AS month
    FROM tap_events t JOIN practices p ON p.id = t.counter_id WHERE p.owner_id = ?`).bind(owner).first<{ today: number; week: number; month: number }>();
  return {
    seconds: Math.max(0, totals?.seconds ?? 0),
    today: Math.max(0, rows?.today ?? 0),
    week: Math.max(0, rows?.week ?? 0),
    month: Math.max(0, rows?.month ?? 0),
  };
}
