import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readSchemaSql, sqliteD1 } from '@/lib/local';
import { journeyRank } from '@/lib/journey-rank';
import { JOURNEY_HOURS, JOURNEY_LEVELS, JOURNEY_TARGETS, hm, journeyState, practiceSeconds } from '@/lib/journey';
import { journeyStats } from '@/lib/journey-stats';

describe('journey levels', () => {
  it('has 40 levels totalling 437 hours with monotonic targets', () => {
    expect(JOURNEY_LEVELS).toHaveLength(40);
    expect(JOURNEY_HOURS).toBe(437);
    expect(JOURNEY_TARGETS[39]).toBe(437 * 3600);
    for (let i = 1; i < JOURNEY_TARGETS.length; i += 1) expect(JOURNEY_TARGETS[i]).toBeGreaterThan(JOURNEY_TARGETS[i - 1]);
    expect(JOURNEY_LEVELS[0]).toMatchObject({ id: 1, name: '五行山收悟空', hours: 8, image: '/journey/01.jpg' });
    expect(JOURNEY_LEVELS[39]).toMatchObject({ id: 40, hours: 16, image: '/journey/40.jpg' });
  });

  it('clears a level exactly on target and starts zero progress', () => {
    expect(journeyState(0)).toMatchObject({ cleared: 0, currentDone: 0, currentTarget: 8 * 3600, nextAt: 8 * 3600, completed: false });
    expect(journeyState(8 * 3600 - 1).cleared).toBe(0);
    const exact = journeyState(8 * 3600);
    expect(exact.cleared).toBe(1);
    expect(exact.current?.id).toBe(2);
    expect(exact.currentDone).toBe(0);
    expect(exact.currentTarget).toBe(15 * 3600);
  });

  it('crosses several levels at once and caps at completion', () => {
    const jumped = journeyState(23 * 3600);
    expect(jumped.cleared).toBe(2);
    expect(jumped.currentDone).toBe(0);
    const done = journeyState(437 * 3600);
    expect(done).toMatchObject({ cleared: 40, completed: true, current: null, currentDone: 0 });
    expect(journeyState(500 * 3600).completed).toBe(true);
  });

  it('converts counts to seconds and formats durations', () => {
    expect(practiceSeconds('count', 30)).toBe(60);
    expect(practiceSeconds('count', 1800)).toBe(3600);
    expect(practiceSeconds('time', 3600)).toBe(3600);
    expect(hm(0)).toBe('0 分');
    expect(hm(59)).toBe('0 分');
    expect(hm(90)).toBe('1 分');
    expect(hm(3600)).toBe('1 小时');
    expect(hm(3600 * 8 + 60 * 30)).toBe('8 小时 30 分');
  });
});

describe('journey stats', () => {
  it('converts every practice into seconds and splits today/week/month by event date', async () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec(readSchemaSql());
    const db = sqliteD1(sqlite);
    const insertPractice = (id: string, kind: string, total: number) => {
      sqlite.prepare("INSERT INTO practices (id, owner_id, name, prompts, target, target_kind, target_seconds, idle_seconds, min_seconds, round_done, visibility, revision, publication_epoch, created_at, updated_at) VALUES (?, 'owner', 'p', '[]', 1, ?, 0, 10, 100, 0, 'private', 1, 0, '2026-01-01', '2026-01-01')").run(id, kind);
      sqlite.prepare("UPDATE counters SET total = ? WHERE id = ?").run(total, id);
    };
    insertPractice('count', 'count', 1800); // 1800 声 = 3600 秒
    insertPractice('timed', 'time', 600); // 600 秒
    const now = new Date(Date.now() + 8 * 3600 * 1000);
    const todayKey = now.toISOString().slice(0, 10);
    const weekKey = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
    sqlite.prepare("INSERT INTO tap_events (id, counter_id, device_id, event_id, delta, date, created_at) VALUES ('e1','count','owner','e1',30,?,'2026-11-16')").run(todayKey);
    sqlite.prepare("INSERT INTO tap_events (id, counter_id, device_id, event_id, delta, date, created_at) VALUES ('e2','timed','owner','e2',120,?,'2026-11-10')").run(weekKey);
    sqlite.prepare("INSERT INTO tap_events (id, counter_id, device_id, event_id, delta, date, created_at) VALUES ('e3','timed','owner','e3',300,'2026-10-30','2026-10-30')").run();
    const stats = await journeyStats(db, 'owner');
    expect(stats.seconds).toBe(480); // 30×2 + 120 + 300，历史只按打卡流水算，归零不倒退
    expect(stats.today).toBe(60);
    expect(stats.week).toBe(180);
    expect(stats.month).toBe(180);
    sqlite.close();
  });
});

describe('修行等级', () => {
  it('4 星=1 月，4 月=1 日，4 日=1 冠，一轮西游一颗星', () => {
    const run = JOURNEY_HOURS * 3600;
    expect(journeyRank(0)).toMatchObject({ crown: 0, sun: 0, moon: 0, star: 0 });
    expect(journeyRank(run)).toMatchObject({ crown: 0, sun: 0, moon: 0, star: 1 });
    expect(journeyRank(run * 4)).toMatchObject({ crown: 0, sun: 0, moon: 1, star: 0 });
    expect(journeyRank(run * 16)).toMatchObject({ crown: 0, sun: 1, moon: 0, star: 0 });
    expect(journeyRank(run * 64)).toMatchObject({ crown: 1, sun: 0, moon: 0, star: 0 });
    expect(journeyRank(run * 14)).toMatchObject({ crown: 0, sun: 0, moon: 3, star: 2 });
  });
});
