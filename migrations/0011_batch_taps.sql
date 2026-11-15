-- 次数模式改成本地攒批上报：一次 practice_event 可以代表多声敲击。
-- practice_events 增加 count（默认 1，兼容旧事件），触发器按 count 写 tap_events 的 delta。
ALTER TABLE practice_events ADD COLUMN count INTEGER NOT NULL DEFAULT 1;

DROP TRIGGER IF EXISTS practice_event_apply;
CREATE TRIGGER practice_event_apply AFTER INSERT ON practice_events
BEGIN
  INSERT INTO tap_events(id, counter_id, device_id, event_id, delta, date)
    SELECT 'practice:' || json_array(NEW.owner_id, NEW.event_id), practice_id, NEW.owner_id,
      'practice:' || NEW.event_id, NEW.count, NEW.date FROM practice_run_items
    WHERE run_id = NEW.run_id AND item_index = NEW.item_index;
  UPDATE practice_sessions SET revision = revision + 1 WHERE owner_id = NEW.owner_id;
END;
