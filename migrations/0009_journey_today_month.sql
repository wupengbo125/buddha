-- 西游一行里补回「今日」「本月」：各是一个日期（月份）标记 + 一个秒数，不按天存。
ALTER TABLE journey_totals ADD COLUMN today_date TEXT NOT NULL DEFAULT '';
ALTER TABLE journey_totals ADD COLUMN today_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE journey_totals ADD COLUMN month TEXT NOT NULL DEFAULT '';
ALTER TABLE journey_totals ADD COLUMN month_seconds INTEGER NOT NULL DEFAULT 0;

-- 已有的本周秒数落在哪个季度无从得知，本月先按本周所在月份记上；今日无法还原，从 0 起。
UPDATE journey_totals SET month = substr(week_start, 1, 7), month_seconds = week_seconds;

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
  INSERT INTO journey_totals (owner_id, seconds, week_start, week_seconds, today_date, today_seconds, month, month_seconds)
    VALUES (NEW.owner_id, NEW.seconds,
      date(NEW.date, '-' || ((CAST(strftime('%w', NEW.date) AS INTEGER) + 6) % 7) || ' days'), NEW.seconds,
      NEW.date, NEW.seconds, substr(NEW.date, 1, 7), NEW.seconds)
    ON CONFLICT(owner_id) DO UPDATE SET
      seconds = seconds + excluded.seconds,
      -- 今日 / 本月：日期（月份）变了就从本批重新开始，迟到的旧上报不占今天。
      today_seconds = CASE WHEN journey_totals.today_date = excluded.today_date THEN today_seconds + excluded.today_seconds
                          WHEN journey_totals.today_date < excluded.today_date THEN excluded.today_seconds
                          ELSE today_seconds END,
      today_date = MAX(journey_totals.today_date, excluded.today_date),
      month_seconds = CASE WHEN journey_totals.month = excluded.month THEN month_seconds + excluded.month_seconds
                          WHEN journey_totals.month < excluded.month THEN excluded.month_seconds
                          ELSE month_seconds END,
      month = MAX(journey_totals.month, excluded.month),
      week_seconds = CASE WHEN journey_totals.week_start = excluded.week_start THEN week_seconds + excluded.week_seconds
                          WHEN journey_totals.week_start < excluded.week_start THEN excluded.week_seconds
                          ELSE week_seconds END,
      week_start = MAX(journey_totals.week_start, excluded.week_start);
END;
