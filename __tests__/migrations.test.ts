import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const migrationsDir = path.resolve(process.cwd(), 'migrations');
const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
const schemaSql = files.map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8')).join('\n');

describe('迁移按序读取', () => {
  it('线上收敛为单一终态 0001，后续迁移按文件名追加', () => {
    expect(files).toEqual(['0001_init.sql', '0002_reordered_practice_runs.sql', '0003_wishlists.sql', '0004_rounds_done.sql', '0005_journey_ledger.sql', '0006_drop_source_name.sql']);
  });

  it('0001 是完整终态，直接含 sound_enabled 与 practices 体系', () => {
    const s = fs.readFileSync(path.join(migrationsDir, '0001_init.sql'), 'utf8');
    expect(s).toContain('sound_enabled INTEGER NOT NULL DEFAULT 1');
    expect(s).toContain('CREATE TABLE IF NOT EXISTS practices');
    expect(s).toContain('CREATE TABLE IF NOT EXISTS counters');
  });

  it('0004 建 rounds_done 基准并重建 counter_tap_count', () => {
    const s = fs.readFileSync(path.join(migrationsDir, '0004_rounds_done.sql'), 'utf8');
    expect(s).toContain('ALTER TABLE practices ADD COLUMN rounds_done');
    expect(s).toContain('DROP TRIGGER IF EXISTS counter_tap_count');
    expect(s).toContain('(rounds_done + 1)');
  });

  it('lib/local.ts 的 readSchemaSql 用 readdirSync + sort 读全部迁移', () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), 'lib/local.ts'), 'utf8');
    expect(src).toContain('readdirSync');
    expect(src).toContain('.sort()');
    expect(src).toContain(".filter((f) => f.endsWith('.sql'))");
  });
});

describe('应用全部迁移后的内存 D1', () => {
  it('sqlite 执行全部迁移后 counters 有 sound_enabled 默认 1、practices 有 rounds_done 默认 0', () => {
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: any };
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(schemaSql);
      const counterCols = db.prepare("PRAGMA table_info('counters')").all() as { name: string }[];
      expect(counterCols.map((c) => c.name)).toContain('sound_enabled');
      const practiceCols = db.prepare("PRAGMA table_info('practices')").all() as { name: string }[];
      expect(practiceCols.map((c) => c.name)).toContain('rounds_done');

      db.prepare("INSERT INTO counters (id, device_id, name) VALUES ('x', 'owner', 'n')").run();
      expect((db.prepare('SELECT sound_enabled FROM counters WHERE id = ?').get('x') as { sound_enabled: number }).sound_enabled).toBe(1);
      db.prepare("INSERT INTO practices (id, owner_id, name, prompts, target, created_at, updated_at) VALUES ('p', 'owner', 'n', '[]', 108, '2026-11-13', '2026-11-13')").run();
      expect((db.prepare('SELECT rounds_done FROM practices WHERE id = ?').get('p') as { rounds_done: number }).rounds_done).toBe(0);
    } finally {
      db.close();
    }
  });

  it('practices 新建自动创建对应 counter，计数触发器保留累计并更新 round_done', () => {
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: any };
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(schemaSql);
      db.prepare("INSERT INTO practices (id, owner_id, name, prompts, target, created_at, updated_at) VALUES ('p', 'owner', 'n', '[]', 2, '2026-11-13', '2026-11-13')").run();
      // practice_recitation_insert 触发器建出同 id 的 counter
      expect(db.prepare("SELECT id FROM counters WHERE id = 'p'").get()).toMatchObject({ id: 'p' });
      // 敲 2 声达标：total=2，round_done=1（rounds_done=0 → (0+1)*2=2）
      db.prepare("INSERT INTO tap_events (id, counter_id, device_id, event_id, delta, date) VALUES ('e1', 'p', 'owner', 'ev1', 2, '2026-11-13')").run();
      expect(db.prepare("SELECT total, today FROM counters WHERE id = 'p'").get()).toMatchObject({ total: 2, today: 2 });
      expect(db.prepare("SELECT round_done FROM practices WHERE id = 'p'").get()).toMatchObject({ round_done: 1 });
    } finally {
      db.close();
    }
  });

  it('wishlists 表随迁移建立，引用 practices', () => {
    const req = createRequire(import.meta.url);
    const sqlite = req('node:sqlite') as { DatabaseSync: any };
    const db = new sqlite.DatabaseSync(':memory:');
    try {
      db.exec(schemaSql);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
      expect(tables.map((t) => t.name)).toContain('wishlists');
      expect(tables.map((t) => t.name)).toContain('wishlist_items');
    } finally {
      db.close();
    }
  });
});
