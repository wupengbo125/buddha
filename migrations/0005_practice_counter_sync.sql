-- 让发愿的敲击同时累加到 counters 行，念佛页与发愿集页共用同一份今日/累计。
UPDATE counters SET
  total = total + COALESCE((SELECT SUM(p.count) FROM practice_personal_counts p WHERE p.practice_id = counters.id), 0),
  today = CASE WHEN today_date = date('now', '+8 hours')
    THEN today + COALESCE((SELECT SUM(p.count) FROM practice_personal_counts p WHERE p.practice_id = counters.id AND p.date = date('now', '+8 hours')), 0)
    ELSE COALESCE((SELECT SUM(p.count) FROM practice_personal_counts p WHERE p.practice_id = counters.id AND p.date = date('now', '+8 hours')), 0)
  END,
  today_date = date('now', '+8 hours');

DROP TRIGGER IF EXISTS practice_event_apply;
CREATE TRIGGER practice_event_apply AFTER INSERT ON practice_events
BEGIN
  UPDATE practice_run_items SET count = count + 1 WHERE run_id = NEW.run_id AND item_index = NEW.item_index;
  INSERT INTO practice_daily_counts(owner_id, date, count) VALUES (NEW.owner_id, NEW.date, 1)
    ON CONFLICT(owner_id, date) DO UPDATE SET count = count + 1;
  INSERT INTO practice_personal_counts(owner_id, practice_id, date, count)
    SELECT NEW.owner_id, practice_id, NEW.date, 1 FROM practice_run_items
    WHERE run_id = NEW.run_id AND item_index = NEW.item_index
    ON CONFLICT(owner_id, practice_id, date) DO UPDATE SET count = count + 1;
  UPDATE counters SET
    total = total + 1,
    today = CASE WHEN today_date = NEW.date THEN today + 1 ELSE 1 END,
    today_date = NEW.date,
    updated_at = datetime('now')
    WHERE id = (SELECT practice_id FROM practice_run_items WHERE run_id = NEW.run_id AND item_index = NEW.item_index);
  UPDATE practice_runs SET
    item_index = CASE WHEN EXISTS (
      SELECT 1 FROM practice_run_items WHERE run_id = NEW.run_id AND item_index = NEW.item_index AND count = target
    ) AND EXISTS (
      SELECT 1 FROM practice_run_items WHERE run_id = NEW.run_id AND item_index = NEW.item_index + 1
    ) THEN item_index + 1 ELSE item_index END,
    completed = NOT EXISTS (SELECT 1 FROM practice_run_items WHERE run_id = NEW.run_id AND count < target)
    WHERE id = NEW.run_id;
  UPDATE practice_sessions SET revision = revision + 1 WHERE owner_id = NEW.owner_id;
END;
