import type { D1Database } from './db';
import { dateKey } from './time';

export interface JourneyStats {
  /** 历史总秒数。 */
  seconds: number;
  /** 本周（自然周，周一起）秒数。 */
  week: number;
  today: number;
  month: number;
}

type Row = { seconds: number; week_start: string; week_seconds: number; today_date: string; today_seconds: number; month: string; month_seconds: number };

// 西游总账一人一行：历史 + 本周 + 今日 + 本月，各自是一个日期标记和一个秒数，不按天存。
// 删除发愿、归零、切换模式都不影响它。
export async function journeyStats(db: D1Database, owner: string, timeZone = 'Asia/Shanghai'): Promise<JourneyStats> {
  const empty: JourneyStats = { seconds: 0, week: 0, today: 0, month: 0 };
  const row = await db.prepare('SELECT seconds, week_start, week_seconds, today_date, today_seconds, month, month_seconds FROM journey_totals WHERE owner_id = ?').bind(owner).first<Row>();
  if (!row) return empty;
  // 标记与当前日期（用户时区）不一致就显示 0：新的一天 / 周 / 月在第一次上报前是空的。
  // 按用户时区取今天，再倒推到周一（不能用「加 8 小时」近似：16 点后会跨到第二天）。
  const now = new Date();
  const day = dateKey(now, timeZone);
  const monday = new Date(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekStart = dateKey(monday, timeZone);
  return {
    seconds: Math.max(0, row.seconds),
    week: row.week_start === weekStart ? Math.max(0, row.week_seconds) : 0,
    today: row.today_date === day ? Math.max(0, row.today_seconds) : 0,
    month: row.month === day.slice(0, 7) ? Math.max(0, row.month_seconds) : 0,
  };
}
