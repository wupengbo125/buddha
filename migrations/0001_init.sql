CREATE TABLE IF NOT EXISTS counters (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL DEFAULT 0,
  today INTEGER NOT NULL DEFAULT 0,
  today_date TEXT NOT NULL DEFAULT '',
  sound_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_counters_device ON counters(device_id);

CREATE TABLE IF NOT EXISTS tap_events (
  id TEXT PRIMARY KEY,
  counter_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(counter_id, device_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_tap_events_counter ON tap_events(counter_id);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  counter_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  content_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_images_counter ON images(counter_id);

CREATE TABLE IF NOT EXISTS practices (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  prompts TEXT NOT NULL,
  target INTEGER NOT NULL CHECK (target > 0),
  target_kind TEXT NOT NULL DEFAULT 'count',
  target_seconds INTEGER NOT NULL DEFAULT 0,
  idle_seconds INTEGER NOT NULL DEFAULT 10,
  min_seconds INTEGER NOT NULL DEFAULT 300,
  round_done INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'private',
  source_id TEXT,
  source_name TEXT,
  source_owner_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  review_id TEXT,
  publication_epoch INTEGER NOT NULL DEFAULT 0,
  approved_snapshot TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS practices_owner ON practices(owner_id, created_at, id);

CREATE TABLE IF NOT EXISTS practice_collections (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private',
  source_id TEXT,
  source_name TEXT,
  source_owner_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  review_id TEXT,
  publication_epoch INTEGER NOT NULL DEFAULT 0,
  approved_snapshot TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS practice_collections_owner ON practice_collections(owner_id, created_at, id);

CREATE TABLE IF NOT EXISTS practice_collection_items (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES practice_collections(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL,
  UNIQUE(collection_id, position)
);
CREATE INDEX IF NOT EXISTS practice_items_practice ON practice_collection_items(practice_id);

CREATE TABLE IF NOT EXISTS practice_reviews (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  content_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS practice_reviews_content ON practice_reviews(kind, content_id, created_at, id);

CREATE TABLE IF NOT EXISTS practice_public_dependencies (
  collection_id TEXT NOT NULL REFERENCES practice_collections(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL,
  PRIMARY KEY(collection_id, practice_id)
);

CREATE TABLE IF NOT EXISTS practice_likes (
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  content_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, kind, content_id)
);
CREATE INDEX IF NOT EXISTS practice_likes_content ON practice_likes(kind, content_id);

CREATE TABLE IF NOT EXISTS practice_favorites (
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  content_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, kind, content_id)
);

CREATE TABLE IF NOT EXISTS practice_runs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  collection_id TEXT NOT NULL REFERENCES practice_collections(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS practice_current_run ON practice_runs(owner_id, collection_id) WHERE is_current = 1;

CREATE TABLE IF NOT EXISTS practice_run_items (
  run_id TEXT NOT NULL REFERENCES practice_runs(id) ON DELETE CASCADE,
  item_index INTEGER NOT NULL,
  practice_id TEXT NOT NULL,
  target INTEGER NOT NULL CHECK(target > 0),
  PRIMARY KEY(run_id, item_index)
);

CREATE TABLE IF NOT EXISTS practice_sessions (
  owner_id TEXT PRIMARY KEY,
  run_id TEXT,
  revision INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS practice_events (
  owner_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  item_index INTEGER NOT NULL,
  date TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(owner_id, event_id)
);

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

CREATE TRIGGER practice_recitation_delete AFTER DELETE ON practices
BEGIN
  DELETE FROM images WHERE counter_id = OLD.id;
  DELETE FROM tap_events WHERE counter_id = OLD.id;
  DELETE FROM counters WHERE id = OLD.id;
END;

CREATE TRIGGER counter_tap_count AFTER INSERT ON tap_events
BEGIN
  UPDATE counters SET total = MAX(0, total + NEW.delta),
    today = CASE WHEN today_date = NEW.date THEN MAX(0, today + NEW.delta) WHEN today_date < NEW.date THEN MAX(0, NEW.delta) ELSE today END,
    today_date = MAX(today_date, NEW.date), updated_at = NEW.created_at
    WHERE id = NEW.counter_id;
  UPDATE practices SET round_done = CASE
    WHEN (SELECT total FROM counters WHERE id = NEW.counter_id) >= target THEN 1
    ELSE round_done END
    WHERE id = NEW.counter_id;
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
      'practice:' || NEW.event_id, NEW.count, NEW.date FROM practice_run_items
    WHERE run_id = NEW.run_id AND item_index = NEW.item_index;
  UPDATE practice_sessions SET revision = revision + 1 WHERE owner_id = NEW.owner_id;
END;
