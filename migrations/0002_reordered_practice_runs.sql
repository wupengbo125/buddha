DROP TRIGGER practice_event_guard;

CREATE TRIGGER practice_event_guard BEFORE INSERT ON practice_events
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM practice_runs r
    JOIN practice_run_items i ON i.run_id = r.id AND i.item_index = NEW.item_index
    JOIN counters c ON c.id = i.practice_id AND c.device_id = NEW.owner_id
    WHERE r.id = NEW.run_id AND r.owner_id = NEW.owner_id AND r.is_current IN (1, 2)
      AND NOT EXISTS (
        SELECT 1 FROM practice_run_items earlier JOIN counters other ON other.id = earlier.practice_id
        WHERE earlier.run_id = r.id AND earlier.item_index < i.item_index AND other.total < earlier.target
      )
  ) THEN RAISE(ABORT, 'invalid practice event') END;
END;