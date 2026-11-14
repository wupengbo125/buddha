DROP TRIGGER IF EXISTS counter_tap_count;
CREATE TRIGGER counter_tap_count AFTER INSERT ON tap_events
BEGIN
  UPDATE counters SET total = total + NEW.delta,
    today = CASE WHEN today_date = NEW.date THEN today + NEW.delta WHEN today_date < NEW.date THEN NEW.delta ELSE today END,
    today_date = MAX(today_date, NEW.date), updated_at = NEW.created_at
    WHERE id = NEW.counter_id;
END;

DROP TRIGGER IF EXISTS practice_event_guard;
CREATE TRIGGER practice_event_guard BEFORE INSERT ON practice_events
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM practice_runs r
    JOIN practice_run_items i ON i.run_id = r.id AND i.item_index = NEW.item_index
    JOIN counters c ON c.id = i.practice_id AND c.device_id = NEW.owner_id
    WHERE r.id = NEW.run_id AND r.owner_id = NEW.owner_id AND i.item_index <= r.item_index
  ) THEN RAISE(ABORT, 'invalid practice event') END;
END;

DROP TRIGGER IF EXISTS practice_event_apply;
CREATE TRIGGER practice_event_apply AFTER INSERT ON practice_events
BEGIN
  UPDATE practice_run_items SET count = count + 1
    WHERE run_id = NEW.run_id AND item_index = NEW.item_index AND count < target
      AND EXISTS (SELECT 1 FROM practice_runs WHERE id = NEW.run_id AND item_index = NEW.item_index AND completed = 0);
  INSERT INTO practice_daily_counts(owner_id, date, count) VALUES (NEW.owner_id, NEW.date, 1)
    ON CONFLICT(owner_id, date) DO UPDATE SET count = count + 1;
  INSERT INTO practice_personal_counts(owner_id, practice_id, date, count)
    SELECT NEW.owner_id, practice_id, NEW.date, 1 FROM practice_run_items
    WHERE run_id = NEW.run_id AND item_index = NEW.item_index
    ON CONFLICT(owner_id, practice_id, date) DO UPDATE SET count = count + 1;
  INSERT INTO tap_events(id, counter_id, device_id, event_id, delta, date)
    SELECT 'practice:' || json_array(NEW.owner_id, NEW.event_id), practice_id, NEW.owner_id,
      'practice:' || NEW.event_id, 1, NEW.date FROM practice_run_items
    WHERE run_id = NEW.run_id AND item_index = NEW.item_index;
  UPDATE practice_runs SET
    item_index = CASE WHEN item_index = NEW.item_index AND EXISTS (
      SELECT 1 FROM practice_run_items WHERE run_id = NEW.run_id AND item_index = NEW.item_index AND count = target
    ) AND EXISTS (
      SELECT 1 FROM practice_run_items WHERE run_id = NEW.run_id AND item_index = NEW.item_index + 1
    ) THEN item_index + 1 ELSE item_index END,
    completed = NOT EXISTS (SELECT 1 FROM practice_run_items WHERE run_id = NEW.run_id AND count < target)
    WHERE id = NEW.run_id;
  UPDATE practice_sessions SET revision = revision + 1 WHERE owner_id = NEW.owner_id;
END;
