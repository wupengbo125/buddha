-- 一个发愿同时记「声数」和「秒数」，模式只决定界面显示哪一个；切换模式不再清零。
-- total / today 继续存「当前模式显示的那个数」，由下面两列按模式得出。
ALTER TABLE counters ADD COLUMN taps_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE counters ADD COLUMN taps_today INTEGER NOT NULL DEFAULT 0;
ALTER TABLE counters ADD COLUMN seconds_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE counters ADD COLUMN seconds_today INTEGER NOT NULL DEFAULT 0;

UPDATE counters SET
  taps_total = CASE WHEN (SELECT target_kind FROM practices WHERE id = counters.id) = 'time' THEN 0 ELSE total END,
  taps_today = CASE WHEN (SELECT target_kind FROM practices WHERE id = counters.id) = 'time' THEN 0 ELSE today END,
  seconds_total = CASE WHEN (SELECT target_kind FROM practices WHERE id = counters.id) = 'time' THEN total ELSE 0 END,
  seconds_today = CASE WHEN (SELECT target_kind FROM practices WHERE id = counters.id) = 'time' THEN today ELSE 0 END;

-- 西游总账：一人一行（历史总秒数 + 本周起始周一 + 本周秒数），不按天存。
CREATE TABLE IF NOT EXISTS journey_totals (
  owner_id TEXT PRIMARY KEY,
  seconds INTEGER NOT NULL DEFAULT 0,
  week_start TEXT NOT NULL DEFAULT '',
  week_seconds INTEGER NOT NULL DEFAULT 0
);

INSERT INTO journey_totals (owner_id, seconds, week_start, week_seconds)
  SELECT owner_id,
    SUM(seconds),
    date('now', '+8 hours', '-' || ((CAST(strftime('%w', 'now', '+8 hours') AS INTEGER) + 6) % 7) || ' days'),
    SUM(CASE WHEN date >= date('now', '+8 hours', '-' || ((CAST(strftime('%w', 'now', '+8 hours') AS INTEGER) + 6) % 7) || ' days') THEN seconds ELSE 0 END)
  FROM journey_daily GROUP BY owner_id;
DROP TRIGGER IF EXISTS journey_ledger_add;
DROP TABLE IF EXISTS journey_daily;

DROP TRIGGER IF EXISTS tap_mark_apply;
CREATE TRIGGER tap_mark_apply AFTER INSERT ON tap_marks
BEGIN
  UPDATE counters SET
    taps_total = MAX(0, taps_total + NEW.delta),
    taps_today = CASE WHEN today_date = NEW.date THEN MAX(0, taps_today + NEW.delta) WHEN today_date < NEW.date THEN NEW.delta ELSE 0 END,
    seconds_total = MAX(0, seconds_total + NEW.seconds),
    seconds_today = CASE WHEN today_date = NEW.date THEN MAX(0, seconds_today + NEW.seconds) WHEN today_date < NEW.date THEN NEW.seconds ELSE 0 END,
    today_date = MAX(today_date, NEW.date), last_tap_at = NEW.created_at, updated_at = NEW.created_at
    WHERE id = NEW.counter_id;
  UPDATE counters SET
    total = CASE WHEN (SELECT target_kind FROM practices WHERE id = NEW.counter_id) = 'time' THEN seconds_total ELSE taps_total END,
    today = CASE WHEN (SELECT target_kind FROM practices WHERE id = NEW.counter_id) = 'time' THEN seconds_today ELSE taps_today END
    WHERE id = NEW.counter_id;
  UPDATE practices SET round_done = CASE
    WHEN target_kind = 'time' THEN CASE WHEN (SELECT seconds_total FROM counters WHERE id = NEW.counter_id) >= (rounds_done + 1) * target_seconds THEN 1 ELSE round_done END
    ELSE CASE WHEN (SELECT taps_total FROM counters WHERE id = NEW.counter_id) >= (rounds_done + 1) * target THEN 1 ELSE round_done END
    END
    WHERE id = NEW.counter_id;
  -- 上报日期（用户时区）所在的周一；上周补报的只进历史，不进本周。
  INSERT INTO journey_totals (owner_id, seconds, week_start, week_seconds)
    VALUES (NEW.owner_id, NEW.seconds,
      date(NEW.date, '-' || ((CAST(strftime('%w', NEW.date) AS INTEGER) + 6) % 7) || ' days'), NEW.seconds)
    ON CONFLICT(owner_id) DO UPDATE SET
      seconds = seconds + excluded.seconds,
      week_seconds = CASE WHEN journey_totals.week_start = excluded.week_start THEN week_seconds + excluded.week_seconds
                          WHEN journey_totals.week_start < excluded.week_start THEN excluded.week_seconds
                          ELSE week_seconds END,
      week_start = MAX(journey_totals.week_start, excluded.week_start);
END;
