UPDATE counters SET device_id = 'owner' WHERE id NOT IN (SELECT id FROM practices);

INSERT INTO practices(id, owner_id, name, recitation, prompts, target, created_at, updated_at)
SELECT id, device_id, name, name,
  CASE WHEN caption = '' THEN '[]' ELSE json_array(caption) END,
  108, created_at, updated_at
FROM counters WHERE id NOT IN (SELECT id FROM practices);

INSERT INTO counters(id, device_id, name, caption, created_at, updated_at)
SELECT id, owner_id, recitation, COALESCE(json_extract(prompts, '$[0]'), ''), created_at, updated_at
FROM practices WHERE id NOT IN (SELECT id FROM counters);

CREATE TRIGGER practice_recitation_insert AFTER INSERT ON practices
BEGIN
  INSERT OR IGNORE INTO counters(id, device_id, name, caption, created_at, updated_at)
  VALUES (NEW.id, NEW.owner_id, NEW.recitation, COALESCE(json_extract(NEW.prompts, '$[0]'), ''), NEW.created_at, NEW.updated_at);
END;

CREATE TRIGGER counter_practice_insert AFTER INSERT ON counters
WHEN NOT EXISTS (SELECT 1 FROM practices WHERE id = NEW.id)
BEGIN
  INSERT INTO practices(id, owner_id, name, recitation, prompts, target, created_at, updated_at)
  VALUES (NEW.id, NEW.device_id, NEW.name, NEW.name,
    CASE WHEN NEW.caption = '' THEN '[]' ELSE json_array(NEW.caption) END,
    108, NEW.created_at, NEW.updated_at);
END;

CREATE TRIGGER practice_recitation_update AFTER UPDATE OF recitation, prompts ON practices
BEGIN
  UPDATE counters SET name = NEW.recitation, caption = COALESCE(json_extract(NEW.prompts, '$[0]'), ''),
    updated_at = NEW.updated_at WHERE id = NEW.id;
END;

CREATE TRIGGER practice_recitation_delete AFTER DELETE ON practices
BEGIN
  DELETE FROM images WHERE counter_id = OLD.id;
  DELETE FROM tap_events WHERE counter_id = OLD.id;
  DELETE FROM counters WHERE id = OLD.id;
END;

CREATE TRIGGER counter_tap_count AFTER INSERT ON tap_events
BEGIN
  UPDATE counters SET total = total + NEW.delta,
    today = CASE WHEN today_date = NEW.date THEN today + NEW.delta ELSE NEW.delta END,
    today_date = NEW.date, updated_at = NEW.created_at
    WHERE id = NEW.counter_id;
END;