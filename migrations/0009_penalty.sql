-- 时长模式坚持机制：practices 记「最少坚持」多久；penalty_seconds 列保留（早期扣时方案），代码已不再写入，仅作历史兼容。
-- counter_tap_count 触发器在此重建：允许负 delta 并把 total/today 夹在 0 以上（历史兼容），正常路径只写正数。
ALTER TABLE practices ADD COLUMN min_seconds INTEGER NOT NULL DEFAULT 300;
ALTER TABLE practices ADD COLUMN penalty_seconds INTEGER NOT NULL DEFAULT 120;

-- 允许负 delta（扣时），并把今日/累计夹在 0 以上。
DROP TRIGGER IF EXISTS counter_tap_count;
CREATE TRIGGER counter_tap_count AFTER INSERT ON tap_events
BEGIN
  UPDATE counters SET total = MAX(0, total + NEW.delta),
    today = CASE WHEN today_date = NEW.date THEN MAX(0, today + NEW.delta) WHEN today_date < NEW.date THEN MAX(0, NEW.delta) ELSE today END,
    today_date = MAX(today_date, NEW.date), updated_at = NEW.created_at
    WHERE id = NEW.counter_id;
END;
