-- 已完成改为「本轮完成」状态：再念一次（restart）只是把状态清掉，累计不动。
ALTER TABLE practices ADD COLUMN round_done INTEGER NOT NULL DEFAULT 0;

-- 存量数据回填：已达标的发愿标记为完成。
UPDATE practices SET round_done = 1
  WHERE (target_kind = 'count' AND (SELECT total FROM counters WHERE counters.id = practices.id) >= practices.target)
     OR (target_kind = 'time' AND (SELECT total FROM counters WHERE counters.id = practices.id) >= practices.target_seconds);

-- 敲击累加后，若达到目标（次数或时长），把本轮标记为完成。
DROP TRIGGER IF EXISTS counter_tap_count;
CREATE TRIGGER counter_tap_count AFTER INSERT ON tap_events
BEGIN
  UPDATE counters SET total = MAX(0, total + NEW.delta),
    today = CASE WHEN today_date = NEW.date THEN MAX(0, today + NEW.delta) WHEN today_date < NEW.date THEN MAX(0, NEW.delta) ELSE today END,
    today_date = MAX(today_date, NEW.date), updated_at = NEW.created_at
    WHERE id = NEW.counter_id;
  UPDATE practices SET round_done = CASE
    WHEN target_kind = 'time' AND (SELECT total FROM counters WHERE id = NEW.counter_id) >= target_seconds THEN 1
    WHEN target_kind = 'count' AND (SELECT total FROM counters WHERE id = NEW.counter_id) >= target THEN 1
    ELSE round_done END
    WHERE id = NEW.counter_id;
END;
