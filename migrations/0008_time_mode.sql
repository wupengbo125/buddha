-- 时长模式：一条发愿可以用「累计时长」作为目标，敲击只用于证明人在场。
ALTER TABLE practices ADD COLUMN target_kind TEXT NOT NULL DEFAULT 'count';
ALTER TABLE practices ADD COLUMN target_seconds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE practices ADD COLUMN idle_seconds INTEGER NOT NULL DEFAULT 10;
