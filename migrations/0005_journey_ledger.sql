-- 西游修行总账：打卡流水随发愿删除会被清掉，总账独立记账，删发愿不掉历史。
CREATE TABLE IF NOT EXISTS journey_ledger (
  event_key TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  date TEXT NOT NULL,
  seconds INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_journey_ledger_owner ON journey_ledger(owner_id, date);

-- 回填现有流水（次数 × 2 秒，时长按秒）。
INSERT OR IGNORE INTO journey_ledger(event_key, owner_id, date, seconds)
  SELECT t.counter_id || ':' || t.device_id || ':' || t.event_id, p.owner_id, t.date,
    CASE WHEN p.target_kind = 'time' THEN t.delta ELSE t.delta * 2 END
  FROM tap_events t JOIN practices p ON p.id = t.counter_id;

CREATE TRIGGER journey_ledger_add AFTER INSERT ON tap_events
BEGIN
  INSERT OR IGNORE INTO journey_ledger(event_key, owner_id, date, seconds)
    SELECT NEW.counter_id || ':' || NEW.device_id || ':' || NEW.event_id, p.owner_id, NEW.date,
      CASE WHEN p.target_kind = 'time' THEN NEW.delta ELSE NEW.delta * 2 END
    FROM practices p WHERE p.id = NEW.counter_id;
END;
