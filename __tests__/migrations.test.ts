import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const migrationsDir = path.resolve(process.cwd(), 'migrations');
const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
const schemaSql = files.map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');

describe('迁移按序读取', () => {
  it('多个迁移按文件名排序，0002 在 0001 之后', () => {
    expect(files).toEqual(['0001_init.sql', '0002_add_sound.sql', '0003_practices.sql', '0004_unify_practices.sql', '0005_practice_counter_sync.sql', '0006_counter_dates.sql']);
  });

  it('0001 不含 sound_enabled（已应用的迁移禁止改动）', () => {
    expect(fs.readFileSync(path.join(migrationsDir, '0001_init.sql'), 'utf8')).not.toContain('sound_enabled');
  });

  it('0002 用 ALTER TABLE 新增 sound_enabled，默认 1', () => {
    const s = fs.readFileSync(path.join(migrationsDir, '0002_add_sound.sql'), 'utf8');
    expect(s).toContain('ALTER TABLE counters ADD COLUMN sound_enabled');
    expect(s).toContain('NOT NULL DEFAULT 1');
  });

  it('拼接顺序：CREATE TABLE 出现在 ALTER TABLE 之前', () => {
    expect(schemaSql.indexOf('CREATE TABLE IF NOT EXISTS counters')).toBeLessThan(
      schemaSql.indexOf('ALTER TABLE counters ADD COLUMN sound_enabled'),
    );
  });

  it('lib/local.ts 的 readSchemaSql 用 readdirSync + sort 读全部迁移', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'lib/local.ts'), 'utf8');
    expect(src).toContain('readdirSync');
    expect(src).toContain('.sort()');
    expect(src).toContain(".filter((f) => f.endsWith('.sql'))");
  });
});

describe('应用全部迁移后内存 D1 含 sound_enabled（映射 lib/local.ts 本地兜底）', () => {
  it('unifies existing recitations and practices while retaining counts, images and sound', () => {
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(files.filter((file) => file < '0004').map((file) => fs.readFileSync(path.join(migrationsDir, file), 'utf8')).join('\n'));
      db.prepare("INSERT INTO counters(id, device_id, name, caption, total, today, today_date, sound_enabled) VALUES ('old', 'owner', '阿弥陀佛', '心静', 123, 7, '2026-11-13', 0)").run();
      db.prepare("INSERT INTO images(id, counter_id, device_id, r2_key) VALUES ('image', 'old', 'owner', 'old/photo.png')").run();
      db.exec(fs.readFileSync(path.join(migrationsDir, '0004_unify_practices.sql'), 'utf8'));
      expect({ ...db.prepare("SELECT id, owner_id, name, recitation, prompts, visibility FROM practices WHERE id = 'old'").get() }).toEqual({
        id: 'old', owner_id: 'owner', name: '阿弥陀佛', recitation: '阿弥陀佛', prompts: '["心静"]', visibility: 'private',
      });
      expect({ ...db.prepare("SELECT total, today, sound_enabled FROM counters WHERE id = 'old'").get() }).toEqual({ total: 123, today: 7, sound_enabled: 0 });
      expect(db.prepare("SELECT counter_id FROM images WHERE id = 'image'").get().counter_id).toBe('old');
    } finally { db.close(); }
  });

  it('upgrades an existing database without changing legacy personal counts or publishing content', () => {
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: any };
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(files.slice(0, 2).map((file) => fs.readFileSync(path.join(migrationsDir, file), 'utf8')).join('\n'));
      db.prepare("INSERT INTO counters(id, device_id, name, caption, total, today, today_date, sound_enabled) VALUES ('old', 'owner', 'existing', 'caption', 123, 7, '2026-11-13', 0)").run();
      db.exec(fs.readFileSync(path.join(migrationsDir, '0003_practices.sql'), 'utf8'));
      expect({ ...db.prepare("SELECT device_id, name, caption, total, today, today_date, sound_enabled FROM counters WHERE id = 'old'").get() }).toEqual({
        device_id: 'owner', name: 'existing', caption: 'caption', total: 123, today: 7, today_date: '2026-11-13', sound_enabled: 0,
      });
      expect(db.prepare('SELECT COUNT(*) AS count FROM practices').get().count).toBe(0);
    } finally { db.close(); }
  });

  it('sqlite 执行拼接 SQL 后，counters 有 sound_enabled 且默认 1', () => {
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: any };
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(schemaSql); // 应用 0001 + 0002
      const cols = db.prepare("PRAGMA table_info('counters')").all() as { name: string }[];
      expect(cols.map((c) => c.name)).toContain('sound_enabled');

      // 新建不显式给 sound_enabled 时，默认值应为 1
      db.prepare("INSERT INTO counters (id, device_id, name) VALUES ('x', 'owner', 'n')").run();
      const row = db.prepare('SELECT sound_enabled FROM counters WHERE id = ?').get('x') as {
        sound_enabled: number;
      };
      expect(row.sound_enabled).toBe(1);
    } finally {
      db.close();
    }
  });
});
