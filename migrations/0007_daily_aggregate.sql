-- 把「一条打卡一行」改成按天汇总：累计仍是 counters 里的一个数，修行统计一人一天一行。
ALTER TABLE counters ADD COLUMN last_tap_at TEXT;

CREATE TABLE IF NOT EXISTS tap_marks (
  counter_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  seconds INTEGER NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (counter_id, owner_id, event_id)
);
CREATE INDEX IF NOT EXISTS tap_marks_created ON tap_marks(created_at);

CREATE TABLE IF NOT EXISTS journey_daily (
  owner_id TEXT NOT NULL,
  date TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_id, date)
);

-- 把已有的逐条总账压成按天。
INSERT OR IGNORE INTO journey_daily(owner_id, date, seconds)
  SELECT owner_id, date, SUM(seconds) FROM journey_ledger GROUP BY owner_id, date;
DROP TRIGGER IF EXISTS journey_ledger_add;
DROP TABLE IF EXISTS journey_ledger;

-- 明细已经汇总进 counters.total 与 journey_daily，清掉逐条流水，库不再随敲击无限变大。
DELETE FROM tap_events;

CREATE TRIGGER tap_mark_apply AFTER INSERT ON tap_marks
BEGIN
  UPDATE counters SET total = MAX(0, total + NEW.delta),
    today = CASE WHEN today_date = NEW.date THEN MAX(0, today + NEW.delta) WHEN today_date < NEW.date THEN NEW.delta ELSE today END,
    today_date = MAX(today_date, NEW.date), last_tap_at = NEW.created_at, updated_at = NEW.created_at
    WHERE id = NEW.counter_id;
  UPDATE practices SET round_done = CASE
    WHEN (SELECT total FROM counters WHERE id = NEW.counter_id) >= (rounds_done + 1) * target THEN 1
    ELSE round_done END
    WHERE id = NEW.counter_id;
  INSERT INTO journey_daily(owner_id, date, seconds) VALUES (NEW.owner_id, NEW.date, NEW.seconds)
    ON CONFLICT(owner_id, date) DO UPDATE SET seconds = seconds + excluded.seconds;
END;
