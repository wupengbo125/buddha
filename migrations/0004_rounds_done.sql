-- 「再念一次」保留累计，但要能真正再念满一轮。
-- 根因：原来用累计 total >= target 判定本轮完成，restart 不清累计时，再敲一下就又达标。
-- 引入 rounds_done（已完成的轮数）作基准：本轮完成条件为 total >= (rounds_done + 1) * 目标。
-- restart 递增 rounds_done 并清 round_done；zero 把 rounds_done 也归零。
ALTER TABLE practices ADD COLUMN rounds_done INTEGER NOT NULL DEFAULT 0;

DROP TRIGGER IF EXISTS counter_tap_count;
CREATE TRIGGER counter_tap_count AFTER INSERT ON tap_events
BEGIN
  UPDATE counters SET total = MAX(0, total + NEW.delta),
    today = CASE WHEN today_date = NEW.date THEN MAX(0, today + NEW.delta) WHEN today_date < NEW.date THEN MAX(0, NEW.delta) ELSE today END,
    today_date = MAX(today_date, NEW.date), updated_at = NEW.created_at
    WHERE id = NEW.counter_id;
  UPDATE practices SET round_done = CASE
    WHEN target_kind = 'time' AND (SELECT total FROM counters WHERE id = NEW.counter_id) >= (rounds_done + 1) * target_seconds THEN 1
    WHEN target_kind = 'count' AND (SELECT total FROM counters WHERE id = NEW.counter_id) >= (rounds_done + 1) * target THEN 1
    ELSE round_done END
    WHERE id = NEW.counter_id;
END;
