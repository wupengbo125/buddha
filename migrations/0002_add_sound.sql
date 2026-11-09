-- v6：每个计数器独立音效开关。0001 已应用到远端，禁止改动，新增列一律走新迁移。
-- 默认 1（开）；lib/local.ts 的 readSchemaSql() 按文件名顺序拼接全部 migrations/*.sql。
ALTER TABLE counters ADD COLUMN sound_enabled INTEGER NOT NULL DEFAULT 1;
