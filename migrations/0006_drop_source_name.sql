-- 来源名称不再记录也不再展示：清掉存量值，复制时不再写入。
UPDATE practices SET source_name = NULL WHERE source_name IS NOT NULL;
UPDATE practice_collections SET source_name = NULL WHERE source_name IS NOT NULL;
