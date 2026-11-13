CREATE TABLE practices (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  recitation TEXT NOT NULL,
  prompts TEXT NOT NULL,
  target INTEGER NOT NULL CHECK (target > 0),
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
CREATE INDEX practices_owner ON practices(owner_id, created_at, id);

CREATE TABLE practice_collections (
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
CREATE INDEX practice_collections_owner ON practice_collections(owner_id, created_at, id);

CREATE TABLE practice_collection_items (
  id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES practice_collections(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL REFERENCES practices(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL,
  UNIQUE(collection_id, position)
);
CREATE INDEX practice_items_practice ON practice_collection_items(practice_id);

CREATE TABLE practice_reviews (
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
CREATE INDEX practice_reviews_content ON practice_reviews(kind, content_id, created_at, id);

CREATE TABLE practice_public_dependencies (
  collection_id TEXT NOT NULL REFERENCES practice_collections(id) ON DELETE CASCADE,
  practice_id TEXT NOT NULL,
  PRIMARY KEY(collection_id, practice_id)
);

CREATE TABLE practice_likes (
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  content_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, kind, content_id)
);
CREATE INDEX practice_likes_content ON practice_likes(kind, content_id);

CREATE TABLE practice_favorites (
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  content_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(owner_id, kind, content_id)
);

CREATE TABLE practice_runs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  collection_id TEXT NOT NULL REFERENCES practice_collections(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  item_index INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX practice_current_run ON practice_runs(owner_id, collection_id) WHERE is_current = 1;

CREATE TABLE practice_run_items (
  run_id TEXT NOT NULL REFERENCES practice_runs(id) ON DELETE CASCADE,
  item_index INTEGER NOT NULL,
  practice_id TEXT NOT NULL,
  target INTEGER NOT NULL CHECK(target > 0),
  count INTEGER NOT NULL DEFAULT 0 CHECK(count >= 0 AND count <= target),
  PRIMARY KEY(run_id, item_index)
);

CREATE TABLE practice_sessions (
  owner_id TEXT PRIMARY KEY,
  run_id TEXT,
  revision INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE practice_events (
  owner_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  item_index INTEGER NOT NULL,
  date TEXT NOT NULL,
  PRIMARY KEY(owner_id, event_id)
);

CREATE TABLE practice_daily_counts (
  owner_id TEXT NOT NULL,
  date TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(owner_id, date)
);

CREATE TABLE practice_personal_counts (
  owner_id TEXT NOT NULL,
  practice_id TEXT NOT NULL,
  date TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(owner_id, practice_id, date)
);

CREATE TRIGGER practice_event_guard BEFORE INSERT ON practice_events
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM practice_runs r
    JOIN practice_sessions s ON s.owner_id = r.owner_id AND s.run_id = r.id
    JOIN practice_run_items i ON i.run_id = r.id AND i.item_index = r.item_index
    WHERE r.id = NEW.run_id AND r.owner_id = NEW.owner_id
      AND r.completed = 0 AND r.is_current = 1 AND r.item_index = NEW.item_index AND i.count < i.target
  ) THEN RAISE(ABORT, 'invalid practice event') END;
END;

CREATE TRIGGER practice_event_apply AFTER INSERT ON practice_events
BEGIN
  UPDATE practice_run_items SET count = count + 1 WHERE run_id = NEW.run_id AND item_index = NEW.item_index;
  INSERT INTO practice_daily_counts(owner_id, date, count) VALUES (NEW.owner_id, NEW.date, 1)
    ON CONFLICT(owner_id, date) DO UPDATE SET count = count + 1;
  INSERT INTO practice_personal_counts(owner_id, practice_id, date, count)
    SELECT NEW.owner_id, practice_id, NEW.date, 1 FROM practice_run_items
    WHERE run_id = NEW.run_id AND item_index = NEW.item_index
    ON CONFLICT(owner_id, practice_id, date) DO UPDATE SET count = count + 1;
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