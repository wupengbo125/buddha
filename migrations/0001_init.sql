CREATE TABLE IF NOT EXISTS counters (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  total INTEGER NOT NULL DEFAULT 0,
  today INTEGER NOT NULL DEFAULT 0,
  today_date TEXT NOT NULL DEFAULT '',
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
