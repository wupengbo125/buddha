DROP TRIGGER practice_event_guard;
DROP TRIGGER practice_event_apply;
DROP TRIGGER practice_recitation_insert;
DROP TRIGGER practice_recitation_update;
DROP TRIGGER counter_practice_insert;

ALTER TABLE practice_run_items DROP COLUMN count;
ALTER TABLE practice_runs DROP COLUMN item_index;
ALTER TABLE practice_runs DROP COLUMN completed;
ALTER TABLE practices DROP COLUMN recitation;
DROP TABLE practice_daily_counts;
DROP TABLE practice_personal_counts;

UPDATE counters SET name = (SELECT name FROM practices WHERE practices.id = counters.id)
  WHERE id IN (SELECT id FROM practices);

CREATE TRIGGER practice_recitation_insert AFTER INSERT ON practices
BEGIN
  INSERT OR IGNORE INTO counters(id, device_id, name, caption, created_at, updated_at)
  VALUES (NEW.id, NEW.owner_id, NEW.name, COALESCE(json_extract(NEW.prompts, '$[0]'), ''), NEW.created_at, NEW.updated_at);
END;

CREATE TRIGGER practice_recitation_update AFTER UPDATE OF name, prompts ON practices
BEGIN
  UPDATE counters SET name = NEW.name, caption = COALESCE(json_extract(NEW.prompts, '$[0]'), ''),
    updated_at = NEW.updated_at WHERE id = NEW.id;
END;

CREATE TRIGGER counter_practice_insert AFTER INSERT ON counters
WHEN NOT EXISTS (SELECT 1 FROM practices WHERE id = NEW.id)
BEGIN
  INSERT INTO practices(id, owner_id, name, prompts, target, created_at, updated_at)
  VALUES (NEW.id, NEW.device_id, NEW.name,
    CASE WHEN NEW.caption = '' THEN '[]' ELSE json_array(NEW.caption) END,
    108, NEW.created_at, NEW.updated_at);
END;

CREATE TRIGGER practice_event_guard BEFORE INSERT ON practice_events
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM practice_runs r
    JOIN practice_run_items i ON i.run_id = r.id AND i.item_index = NEW.item_index
    JOIN counters c ON c.id = i.practice_id AND c.device_id = NEW.owner_id
    WHERE r.id = NEW.run_id AND r.owner_id = NEW.owner_id AND r.is_current = 1
      AND NOT EXISTS (
        SELECT 1 FROM practice_run_items earlier JOIN counters other ON other.id = earlier.practice_id
        WHERE earlier.run_id = r.id AND earlier.item_index < i.item_index AND other.total < earlier.target
      )
  ) THEN RAISE(ABORT, 'invalid practice event') END;
END;

CREATE TRIGGER practice_event_apply AFTER INSERT ON practice_events
BEGIN
  INSERT INTO tap_events(id, counter_id, device_id, event_id, delta, date)
    SELECT 'practice:' || json_array(NEW.owner_id, NEW.event_id), practice_id, NEW.owner_id,
      'practice:' || NEW.event_id, 1, NEW.date FROM practice_run_items
    WHERE run_id = NEW.run_id AND item_index = NEW.item_index;
  UPDATE practice_sessions SET revision = revision + 1 WHERE owner_id = NEW.owner_id;
END;