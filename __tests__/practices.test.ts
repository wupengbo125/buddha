import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { readSchemaSql, sqliteD1 } from '@/lib/local';
import type { discoverList, favoriteList } from '@/lib/practice-discovery';
import type { Collection, Practice, PracticeReview, PracticeSessionState, Run } from '@/lib/practice-types';

type ActiveSession = PracticeSessionState & { active: Run };
type Reviewed<Content> = Content & { reviews: PracticeReview[] };
type DiscoveryPage = Awaited<ReturnType<typeof discoverList>>;
type FavoritesPage = Awaited<ReturnType<typeof favoriteList>>;

async function readJson<Result>(response: Response | Promise<Response>): Promise<Result> {
  return (await response).json() as Promise<Result>;
}

const state = vi.hoisted(() => ({ db: null as any, owner: 'owner', authenticated: true, deleteImage: vi.fn() }));
vi.mock('@/lib/session', () => ({ requireSession: async () => state.authenticated }));
vi.mock('@/lib/auth', () => ({ get OWNER_ID() { return state.owner; } }));
vi.mock('@/lib/runtime', () => ({ getEnv: () => ({ DB: state.db, IMAGES: { delete: state.deleteImage } }) }));

describe('practice API', () => {
  let sqlite: any;
  beforeEach(() => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(readSchemaSql());
    state.db = sqliteD1(sqlite);
    state.owner = 'owner';
    state.authenticated = true;
    state.deleteImage.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => { sqlite.close(); vi.useRealTimers(); });

  const request = (path: string, method = 'GET', body?: unknown) => new NextRequest(`http://localhost/api/${path}`, {
    method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  async function seed(target = 2) {
    const practices = await import('@/app/api/practices/route');
    const collections = await import('@/app/api/practice-collections/route');
    const practice = await readJson<Practice>(practices.POST(request('practices', 'POST', { name: 'practice', recitation: 'recitation', prompts: ['a', 'b'], target })));
    const collection = await readJson<Collection>(collections.POST(request('practice-collections', 'POST', { name: 'collection', practiceIds: [practice.id, practice.id] })));
    return { practice, collection };
  }

  it('imports historical device counters into the fixed owner library without losing totals or goals', async () => {
    sqlite.close();
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    sqlite = new DatabaseSync(':memory:');
    for (const file of ['0001_init.sql', '0002_add_sound.sql', '0003_practices.sql']) {
      sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
    }
    sqlite.prepare('INSERT INTO counters(id, device_id, name, caption, total, today, today_date, sound_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('historical', 'old-device', 'recitation', 'prompt', 123, 7, '2026-11-13', 0);
    sqlite.exec(readFileSync('migrations/0004_unify_practices.sql', 'utf8'));
    state.db = sqliteD1(sqlite);
    const practices = await import('@/app/api/practices/route');
    const counters = await import('@/app/api/counters/route');
    expect(await readJson(practices.GET(request('practices')))).toMatchObject([{
      id: 'historical', owner_id: 'owner', name: 'recitation', recitation: 'recitation',
      prompts: ['prompt'], visibility: 'private', target: 108, personal_total: 123,
    }]);
    expect(await readJson(counters.GET(request('counters')))).toMatchObject({
      counters: [{ id: 'historical', total: 123, today: 7, today_date: '2026-11-13', sound_enabled: 0 }],
    });
    const session = await import('@/app/api/practice-session/route');
    expect(await readJson(session.GET(request('practice-session?date=2026-11-13')))).toMatchObject({
      stats: { total: 123, today: 7 },
    });
  });

  it('creates one backing counter and includes single taps in private practice totals', async () => {
    const practices = await import('@/app/api/practices/route');
    const detail = await import('@/app/api/practices/[id]/route');
    const counters = await import('@/app/api/counters/route');
    const taps = await import('@/app/api/counters/[id]/taps/route');
    const practice = await readJson<Practice>(practices.POST(request('practices', 'POST', {
      name: 'wish', recitation: 'recitation', prompts: ['first', 'second'], target: 108,
    })));
    const context = { params: Promise.resolve({ id: practice.id }) };
    expect(await readJson(counters.GET(request('counters')))).toMatchObject({
      counters: [{ id: practice.id, name: 'recitation', caption: 'first', total: 0 }],
    });
    const response = await taps.POST(request(`counters/${practice.id}/taps`, 'POST', {
      event_id: 'single-one', delta: 1, date: '2026-11-13',
    }), context);
    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({ total: 1, applied: true });
    expect(await readJson(detail.GET(request(`practices/${practice.id}`), context))).toMatchObject({
      id: practice.id, name: 'wish', personal_total: 1,
    });
    expect(await readJson(practices.GET(request('practices')))).toMatchObject([{ id: practice.id, personal_total: 1 }]);
  });

  it('keeps today counts when older taps arrive from either practice entry', async () => {
    const { practice, collection } = await seed(10);
    const counters = await import('@/app/api/counters/route');
    const singleTaps = await import('@/app/api/counters/[id]/taps/route');
    const session = await import('@/app/api/practice-session/route');
    const sessionTaps = await import('@/app/api/practice-session/taps/route');
    const context = { params: Promise.resolve({ id: practice.id }) };
    const active = await readJson<ActiveSession>(session.POST(request('practice-session?date=2026-11-14', 'POST', { action: 'start', collectionId: collection.id })));
    await singleTaps.POST(request(`counters/${practice.id}/taps`, 'POST', { event_id: 'today', delta: 1, date: '2026-11-14' }), context);
    await sessionTaps.POST(request('practice-session/taps?date=2026-11-14', 'POST', { eventId: 'old-session', runId: active.active.id, itemIndex: 0, date: '2026-11-13' }));
    await singleTaps.POST(request(`counters/${practice.id}/taps`, 'POST', { event_id: 'old-single', delta: 1, date: '2026-11-13' }), context);
    expect(await readJson(counters.GET(request('counters')))).toMatchObject({
      counters: [{ id: practice.id, total: 3, today: 1, today_date: '2026-11-14' }],
    });
    expect(await readJson(session.GET(request('practice-session?date=2026-11-14')))).toMatchObject({
      active: { count: 1, items: [{ today_total: 1, personal_total: 3 }, { today_total: 1, personal_total: 3 }] },
      stats: { today: 1, total: 3 },
    });
  });

  it('can count an unsent tap for its practice after its run was restarted', async () => {
    const { practice, collection } = await seed(10);
    const session = await import('@/app/api/practice-session/route');
    const sessionTaps = await import('@/app/api/practice-session/taps/route');
    const started = await readJson<ActiveSession>(session.POST(request('practice-session?date=2026-11-14', 'POST', { action: 'start', collectionId: collection.id })));
    await session.POST(request('practice-session?date=2026-11-14', 'POST', { action: 'restart', collectionId: collection.id }));
    const event = { eventId: 'stale-tap', runId: started.active.id, itemIndex: 0, date: '2026-11-14' };
    expect((await sessionTaps.POST(request('practice-session/taps?date=2026-11-14', 'POST', event))).status).toBe(200);
    expect((await sessionTaps.POST(request('practice-session/taps?date=2026-11-14', 'POST', event))).status).toBe(200);
    expect(await readJson(session.GET(request('practice-session?date=2026-11-14')))).toMatchObject({
      active: { count: 0, items: [{ id: practice.id, personal_total: 1 }, { id: practice.id, personal_total: 1 }] },
      stats: { today: 1, total: 1 },
    });
  });

  it('identifies pending events already included in the returned session state', async () => {
    const { collection } = await seed(10);
    const session = await import('@/app/api/practice-session/route');
    const taps = await import('@/app/api/practice-session/taps/route');
    const started = await readJson<ActiveSession>(session.POST(request('practice-session?date=2026-11-14', 'POST', { action: 'start', collectionId: collection.id })));
    const event = { runId: started.active.id, itemIndex: 0, date: '2026-11-14' };
    await taps.POST(request('practice-session/taps?date=2026-11-14', 'POST', { ...event, eventId: 'first' }));
    await taps.POST(request('practice-session/taps?date=2026-11-14', 'POST', { ...event, eventId: 'second' }));
    const result = await readJson<PracticeSessionState>(taps.POST(request('practice-session/taps?date=2026-11-14', 'POST', {
      ...event, eventId: 'first', pendingEventIds: ['first', 'second', 'pending'],
    })));
    expect(result).toMatchObject({ active: { count: 2 }, confirmedEventIds: ['first', 'second'] });
  });

  it('does not acknowledge a tap after its practice was deleted', async () => {
    const { practice, collection } = await seed();
    const session = await import('@/app/api/practice-session/route');
    const taps = await import('@/app/api/practice-session/taps/route');
    const collections = await import('@/app/api/practice-collections/[id]/route');
    const practices = await import('@/app/api/practices/[id]/route');
    const started = await readJson<ActiveSession>(session.POST(request('practice-session', 'POST', { action: 'start', collectionId: collection.id })));
    await collections.PATCH(request(`practice-collections/${collection.id}`, 'PATCH', { practiceIds: [] }), { params: Promise.resolve({ id: collection.id }) });
    expect((await practices.DELETE(request(`practices/${practice.id}`, 'DELETE'), { params: Promise.resolve({ id: practice.id }) })).status).toBe(200);
    const response = await taps.POST(request('practice-session/taps', 'POST', {
      eventId: 'deleted', runId: started.active.id, itemIndex: 0, date: '2026-11-14',
    }));
    expect(response.status).toBe(410);
    expect(await readJson(session.GET(request('practice-session?date=2026-11-14')))).toMatchObject({ active: { count: 0 }, stats: { total: 0 } });
  });

  it('identifies an unsent tap for a deleted collection as permanently unavailable', async () => {
    const { collection } = await seed();
    const session = await import('@/app/api/practice-session/route');
    const taps = await import('@/app/api/practice-session/taps/route');
    const collections = await import('@/app/api/practice-collections/[id]/route');
    const started = await readJson<ActiveSession>(session.POST(request('practice-session', 'POST', { action: 'start', collectionId: collection.id })));
    await collections.DELETE(request(`practice-collections/${collection.id}`, 'DELETE'), { params: Promise.resolve({ id: collection.id }) });
    expect((await taps.POST(request('practice-session/taps', 'POST', {
      eventId: 'deleted-run', runId: started.active.id, itemIndex: 0, date: '2026-11-14',
    }))).status).toBe(410);
  });

  it('keeps canonical content and its backing row coherent through both edit APIs', async () => {
    const { practice } = await seed(7);
    const detail = await import('@/app/api/practices/[id]/route');
    const counter = await import('@/app/api/counters/[id]/route');
    const counters = await import('@/app/api/counters/route');
    const taps = await import('@/app/api/counters/[id]/taps/route');
    const context = { params: Promise.resolve({ id: practice.id }) };
    await taps.POST(request(`counters/${practice.id}/taps`, 'POST', {
      event_id: 'before-edit', delta: 1, date: '2026-11-13',
    }), context);
    expect((await detail.PATCH(request(`practices/${practice.id}`, 'PATCH', {
      name: 'wish', recitation: 'changed', prompts: ['new first', 'second'],
    }), context)).status).toBe(200);
    expect(await readJson(counters.GET(request('counters')))).toMatchObject({
      counters: [{ id: practice.id, name: 'changed', caption: 'new first', total: 1 }],
    });
    expect((await counter.PATCH(request(`counters/${practice.id}`, 'PATCH', {
      name: 'legacy edit', caption: 'legacy first', sound_enabled: 0,
    }), context)).status).toBe(200);
    expect(await readJson(detail.GET(request(`practices/${practice.id}`), context))).toMatchObject({
      id: practice.id, name: 'wish', recitation: 'legacy edit', prompts: ['legacy first', 'second'],
      target: 7, personal_total: 1,
    });
    expect(await readJson(counters.GET(request('counters')))).toMatchObject({
      counters: [{ id: practice.id, name: 'legacy edit', caption: 'legacy first', total: 1, sound_enabled: 0 }],
    });
  });

  it('accepts practice text limits through the compatibility PATCH without losing later prompts', async () => {
    const { practice } = await seed();
    const counter = await import('@/app/api/counters/[id]/route');
    const detail = await import('@/app/api/practices/[id]/route');
    const context = { params: Promise.resolve({ id: practice.id }) };
    const name = 'r'.repeat(10000);
    const caption = 'p'.repeat(1000);
    const response = await counter.PATCH(request(`counters/${practice.id}`, 'PATCH', { name, caption }), context);
    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({ counter: { id: practice.id, name, caption } });
    expect(await readJson(detail.GET(request(`practices/${practice.id}`), context))).toMatchObject({
      visibility: 'private', recitation: name, prompts: [caption, 'b'], reviews: [],
    });
  });

  it.each([
    { visibility: 'public', patch: { name: 'reviewed recitation' }, recitation: 'reviewed recitation', prompts: ['a', 'b'] },
    { visibility: 'pending', patch: { caption: '' }, recitation: 'recitation', prompts: ['', 'b'] },
  ])('reviews compatibility PATCH text from $visibility content before publishing it', async ({ visibility, patch, recitation, prompts }) => {
    const { practice } = await seed();
    const detail = await import('@/app/api/practices/[id]/route');
    const counter = await import('@/app/api/counters/[id]/route');
    const discover = await import('@/app/api/discover/[kind]/[id]/route');
    const { setPracticeModerationAdapter } = await import('@/lib/practice-moderation');
    const context = { params: Promise.resolve({ id: practice.id }) };
    if (visibility === 'pending') {
      const restore = setPracticeModerationAdapter(async () => { throw new Error('offline'); });
      try {
        expect((await detail.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), context)).status).toBe(502);
      } finally { restore(); }
    } else {
      expect((await detail.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), context)).status).toBe(200);
    }
    const response = await counter.PATCH(request(`counters/${practice.id}`, 'PATCH', { ...patch, sound_enabled: 0 }), context);
    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({ counter: { name: recitation, caption: prompts[0], sound_enabled: 0 } });
    expect(await readJson(detail.GET(request(`practices/${practice.id}`), context))).toMatchObject({
      visibility: 'public', recitation, prompts,
    });
    state.authenticated = false;
    expect(await readJson(discover.GET(request(`discover/practices/${practice.id}`), {
      params: Promise.resolve({ kind: 'practices', id: practice.id }),
    }))).toMatchObject({ visibility: 'public', recitation, prompts });
  });

  it.each([
    { decision: 'rejected', status: 200, visibility: 'rejected' },
    { decision: 'error', status: 502, visibility: 'pending' },
  ])('keeps compatibility PATCH drafts out of public content when moderation returns $decision', async ({ decision, status, visibility }) => {
    const { practice } = await seed();
    const detail = await import('@/app/api/practices/[id]/route');
    const counter = await import('@/app/api/counters/[id]/route');
    const discover = await import('@/app/api/discover/[kind]/[id]/route');
    const { setPracticeModerationAdapter } = await import('@/lib/practice-moderation');
    const context = { params: Promise.resolve({ id: practice.id }) };
    expect((await detail.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), context)).status).toBe(200);
    const restore = setPracticeModerationAdapter(async () => {
      if (decision === 'error') throw new Error('offline');
      return { approved: false, reason: 'needs revision' };
    });
    try {
      const response = await counter.PATCH(request(`counters/${practice.id}`, 'PATCH', {
        name: 'unreviewed', caption: 'draft prompt', sound_enabled: 0,
      }), context);
      expect(response.status).toBe(status);
      if (decision === 'error') expect(await readJson(response)).toMatchObject({ error: expect.any(String) });
      const own = await readJson<Reviewed<Practice>>(detail.GET(request(`practices/${practice.id}`), context));
      expect(own).toMatchObject({ visibility, recitation: 'unreviewed', prompts: ['draft prompt', 'b'] });
      expect(own.reviews.map((review) => review.status)).toEqual(['approved', decision]);
      state.authenticated = false;
      expect(await readJson(discover.GET(request(`discover/practices/${practice.id}`), {
        params: Promise.resolve({ kind: 'practices', id: practice.id }),
      }))).toMatchObject({ recitation: 'recitation', prompts: ['a', 'b'] });
    } finally { restore(); }
  });

  it.each(['public', 'pending'] as const)('does not review sound-only compatibility PATCH on %s content', async (visibility) => {
    const { practice } = await seed();
    const detail = await import('@/app/api/practices/[id]/route');
    const counter = await import('@/app/api/counters/[id]/route');
    const { setPracticeModerationAdapter } = await import('@/lib/practice-moderation');
    const context = { params: Promise.resolve({ id: practice.id }) };
    const restoreInitial = setPracticeModerationAdapter(async () => {
      if (visibility === 'pending') throw new Error('offline');
      return { approved: true };
    });
    try {
      expect((await detail.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), context)).status).toBe(visibility === 'pending' ? 502 : 200);
    } finally { restoreInitial(); }
    const before = await readJson<Reviewed<Practice>>(detail.GET(request(`practices/${practice.id}`), context));
    const adapter = vi.fn(async () => ({ approved: true }));
    const restore = setPracticeModerationAdapter(adapter);
    try {
      const response = await counter.PATCH(request(`counters/${practice.id}`, 'PATCH', { sound_enabled: 0 }), context);
      expect(response.status).toBe(200);
      expect(await readJson(response)).toMatchObject({ counter: { sound_enabled: 0 } });
      expect(await readJson(detail.GET(request(`practices/${practice.id}`), context))).toEqual(before);
      expect(adapter).not.toHaveBeenCalled();
    } finally { restore(); }
  });

  it.each(['counter', 'practice'])('protects references and deletes canonical content with images through the %s API', async (kind) => {
    const { practice, collection } = await seed();
    const detail = await import('@/app/api/practices/[id]/route');
    const counter = await import('@/app/api/counters/[id]/route');
    const collections = await import('@/app/api/practice-collections/[id]/route');
    const counters = await import('@/app/api/counters/route');
    const route = kind === 'counter' ? counter : detail;
    const context = { params: Promise.resolve({ id: practice.id }) };
    sqlite.prepare('INSERT INTO images(id, counter_id, device_id, r2_key) VALUES (?, ?, ?, ?)')
      .run('image', practice.id, 'owner', 'wish/image');
    expect((await route.DELETE(request(`${kind}/${practice.id}`, 'DELETE'), context)).status).toBe(409);
    expect(state.deleteImage).not.toHaveBeenCalled();
    expect((await detail.GET(request(`practices/${practice.id}`), context)).status).toBe(200);
    await collections.DELETE(request(`practice-collections/${collection.id}`, 'DELETE'), {
      params: Promise.resolve({ id: collection.id }),
    });
    expect((await route.DELETE(request(`${kind}/${practice.id}`, 'DELETE'), context)).status).toBe(200);
    expect(state.deleteImage).toHaveBeenCalledTimes(1);
    expect(state.deleteImage).toHaveBeenCalledWith('wish/image');
    expect((await detail.GET(request(`practices/${practice.id}`), context)).status).toBe(404);
    expect(await readJson(counters.GET(request('counters')))).toEqual({ counters: [] });
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM images').get().count).toBe(0);
  });

  it('rolls back a single tap event with its counter and permits exactly one retry', async () => {
    const { practice } = await seed();
    const taps = await import('@/app/api/counters/[id]/taps/route');
    const detail = await import('@/app/api/practices/[id]/route');
    const context = { params: Promise.resolve({ id: practice.id }) };
    const tap = () => taps.POST(request(`counters/${practice.id}/taps`, 'POST', {
      event_id: 'retry-single', delta: 1, date: '2026-11-13',
    }), context);
    sqlite.exec("CREATE TRIGGER fail_single BEFORE UPDATE OF total ON counters BEGIN SELECT RAISE(ABORT, 'disk full'); END");
    expect((await tap()).status).toBe(500);
    sqlite.exec('DROP TRIGGER fail_single');
    expect(await readJson(tap())).toMatchObject({ total: 1, today: 1, today_date: '2026-11-13', applied: true });
    expect(await readJson(tap())).toMatchObject({ total: 1, today: 1, applied: false });
    expect(await readJson(detail.GET(request(`practices/${practice.id}`), context))).toMatchObject({ personal_total: 1 });
  });

  it('copies mixed totals into a separate zero-count backing row and isolates legacy APIs by owner', async () => {
    const { practice, collection } = await seed();
    const detail = await import('@/app/api/practices/[id]/route');
    const counter = await import('@/app/api/counters/[id]/route');
    const counters = await import('@/app/api/counters/route');
    const singleTaps = await import('@/app/api/counters/[id]/taps/route');
    const session = await import('@/app/api/practice-session/route');
    const taps = await import('@/app/api/practice-session/taps/route');
    const context = { params: Promise.resolve({ id: practice.id }) };
    const started = await readJson<ActiveSession>(session.POST(request('practice-session', 'POST', {
      action: 'start', collectionId: collection.id,
    })));
    await taps.POST(request('practice-session/taps', 'POST', {
      eventId: 'mixed-collection', runId: started.active.id, itemIndex: 0, date: '2026-11-13',
    }));
    await singleTaps.POST(request(`counters/${practice.id}/taps`, 'POST', {
      event_id: 'mixed-single', delta: 1, date: '2026-11-13',
    }), context);
    expect(await readJson(detail.GET(request(`practices/${practice.id}`), context))).toMatchObject({ personal_total: 2 });
    const collections = await import('@/app/api/practice-collections/[id]/route');
    expect(await readJson(collections.GET(request(`practice-collections/${collection.id}`), {
      params: Promise.resolve({ id: collection.id }),
    }))).toMatchObject({ items: [{ personal_total: 2 }, { personal_total: 2 }] });
    await detail.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), context);
    state.owner = 'reader';
    const copied = await readJson<Practice>(detail.POST(request(`practices/${practice.id}`, 'POST', { action: 'copy' }), context));
    expect(copied.id).not.toBe(practice.id);
    expect(copied).toMatchObject({ owner_id: 'reader', source_id: practice.id, target: 2, personal_total: 0 });
    expect(await readJson(counters.GET(request('counters')))).toMatchObject({
      counters: [{ id: copied.id, total: 0, today: 0, name: 'recitation' }],
    });
    expect((await counter.PATCH(request(`counters/${practice.id}`, 'PATCH', { name: 'stolen' }), context)).status).toBe(404);
    expect((await counter.DELETE(request(`counters/${practice.id}`, 'DELETE'), context)).status).toBe(404);
    expect((await singleTaps.POST(request(`counters/${practice.id}/taps`, 'POST', {
      event_id: 'stolen', delta: 1, date: '2026-11-13',
    }), context)).status).toBe(404);
    expect(await readJson(singleTaps.POST(request(`counters/${copied.id}/taps`, 'POST', {
      event_id: 'copied-single', delta: 1, date: '2026-11-13',
    }), { params: Promise.resolve({ id: copied.id }) }))).toMatchObject({ total: 1 });
    state.owner = 'owner';
    expect(await readJson(detail.GET(request(`practices/${practice.id}`), context))).toMatchObject({ personal_total: 2 });
  });

  it('counts an idempotent event once and advances repeated appearances without overflow or implicit restart', async () => {
    const { collection } = await seed();
    const session = await import('@/app/api/practice-session/route');
    const taps = await import('@/app/api/practice-session/taps/route');
    let response = await session.POST(request('practice-session', 'POST', { action: 'start', collectionId: collection.id }));
    expect(response.status).toBe(200);
    let current = await readJson<ActiveSession>(response);
    const runId = current.active.id;
    const date = '2026-11-13';
    const tap = (eventId: string, itemIndex: number) => taps.POST(request('practice-session/taps?date=2026-11-13', 'POST', { eventId, runId, itemIndex, date }));
    current = await readJson<ActiveSession>(tap('one', 0));
    expect(current.active.counts).toEqual([1, 0]);
    await tap('one', 0);
    current = await readJson<ActiveSession>(tap('two', 0));
    expect(current.active.index).toBe(1);
    expect(current.active.counts).toEqual([2, 0]);
    expect((await tap('late', 0)).status).toBe(200);
    expect((await tap('future', 2)).status).toBe(409);
    await Promise.all([tap('three', 1), tap('three', 1)]);
    current = await readJson<ActiveSession>(tap('four', 1));
    expect(current.active.completed).toBe(true);
    expect(current.active.total).toBe(4);
    expect(current.stats).toEqual({ today: 5, total: 5 });
    expect((await tap('five', 1)).status).toBe(200);
    current = await readJson<ActiveSession>(session.POST(request('practice-session?date=2026-11-13', 'POST', { action: 'start', collectionId: collection.id })));
    expect(current.active.id).toBe(runId);
    expect(current.active.completed).toBe(true);
    expect(current.active.total).toBe(4);
    expect(current.stats).toEqual({ today: 6, total: 6 });
    state.owner = 'other';
    expect((await tap('stolen', 0)).status).toBe(409);
    expect((await readJson<PracticeSessionState>(session.GET(request('practice-session')))).stats.total).toBe(0);
  });

  it.each([
    { counterDate: '2026-11-13', today: 5 },
    { counterDate: '2026-11-12', today: 2 },
  ])('reports personal overall stats with legacy counter date $counterDate', async ({ counterDate, today }) => {
    const date = '2026-11-13';
    const insertCounter = sqlite.prepare('INSERT INTO counters(id, device_id, name, today, total, today_date) VALUES (?, ?, ?, ?, ?, ?)');
    insertCounter.run('legacy-one', 'owner', 'first', 1, 3, counterDate);
    insertCounter.run('legacy-two', 'owner', 'second', 2, 4, counterDate);
    insertCounter.run('other-counter', 'other', 'other', 50, 100, date);
    const { collection } = await seed();
    const session = await import('@/app/api/practice-session/route');
    const taps = await import('@/app/api/practice-session/taps/route');
    const started = await readJson<ActiveSession>(session.POST(request(`practice-session?date=${date}`, 'POST', { action: 'start', collectionId: collection.id })));
    const tap = (eventId: string) => taps.POST(request(`practice-session/taps?date=${date}`, 'POST', { eventId, runId: started.active.id, itemIndex: 0, date }));
    expect((await tap('first')).status).toBe(200);
    expect((await tap('first')).status).toBe(200);
    const tapped = await tap('second');
    expect(tapped.status).toBe(200);
    expect((await readJson<PracticeSessionState>(tapped)).stats).toEqual({ today, total: 9 });
    const response = await session.GET(request(`practice-session?date=${date}`));
    expect(response.status).toBe(200);
    expect((await readJson<ActiveSession>(response))).toMatchObject({ active: { total: 2 }, stats: { today, total: 9 } });
    state.owner = 'other';
    const otherResponse = await session.GET(request(`practice-session?date=${date}`));
    expect(otherResponse.status).toBe(200);
    expect((await readJson<PracticeSessionState>(otherResponse))).toMatchObject({ active: null, stats: { today: 50, total: 100 } });
  });

  it('resumes runs across edits, switching and dates with live content and saved progress', async () => {
    const { practice, collection } = await seed(3);
    const other = await seed(1);
    const session = await import('@/app/api/practice-session/route');
    const taps = await import('@/app/api/practice-session/taps/route');
    const practiceRoute = await import('@/app/api/practices/[id]/route');
    const collectionRoute = await import('@/app/api/practice-collections/[id]/route');
    const action = async (action: string, collectionId?: string) => (await session.POST(request('practice-session?date=2026-11-14', 'POST', { action, collectionId })));
    const started = await readJson<ActiveSession>(action('start', collection.id));
    const runId = started.active.id;
    const body = { eventId: 'old-day', runId, itemIndex: 0, date: '2026-11-13' };
    await taps.POST(request('practice-session/taps?date=2026-11-14', 'POST', body));
    const paused = await readJson<PracticeSessionState>(action('pause'));
    expect(paused.active).toBeNull();
    expect(paused.stats).toEqual({ today: 0, total: 1 });
    const saved = await readJson<Collection>(collectionRoute.GET(request(`practice-collections/${collection.id}`), { params: Promise.resolve({ id: collection.id }) }));
    expect(saved.progress).toMatchObject({ id: runId, index: 0, completed: false, counts: [1, 0], total: 1 });
    expect((await readJson<PracticeSessionState>(taps.POST(request('practice-session/taps?date=2026-11-14', 'POST', body)))).active).toBeNull();
    await practiceRoute.PATCH(request(`practices/${practice.id}`, 'PATCH', { recitation: 'new', target: 7 }), { params: Promise.resolve({ id: practice.id }) });
    await collectionRoute.PATCH(request(`practice-collections/${collection.id}`, 'PATCH', { name: 'new name', practiceIds: [] }), { params: Promise.resolve({ id: collection.id }) });
    await action('start', other.collection.id);
    expect((await taps.POST(request('practice-session/taps', 'POST', { ...body, eventId: 'stale' }))).status).toBe(200);
    const resumedResponse = await action('start', collection.id);
    expect(resumedResponse.status).toBe(200);
    const resumed = await readJson<ActiveSession>(resumedResponse);
    expect(resumed.active.id).toBe(runId);
    expect(resumed.active.items[0].target).toBe(3);
    expect(resumed.active.items[0].recitation).toBe('new');
    expect(resumed.active.collection_name).toBe('collection');
    expect(resumed.active.counts).toEqual([2, 0]);
    expect((await action('restart', collection.id)).status).toBe(409);
    await collectionRoute.PATCH(request(`practice-collections/${collection.id}`, 'PATCH', { practiceIds: [practice.id] }), { params: Promise.resolve({ id: collection.id }) });
    const restarted = await readJson<ActiveSession>(action('restart', collection.id));
    expect(restarted.active.id).not.toBe(runId);
    expect(restarted.active.items[0].target).toBe(7);
    expect(restarted.active.counts).toEqual([0]);
    await taps.POST(request('practice-session/taps?date=2026-11-14', 'POST', { eventId: 'new-day', runId: restarted.active.id, itemIndex: 0, date: '2026-11-14' }));
    const latest = await readJson<PracticeSessionState>(session.GET(request('practice-session?date=2026-11-14')));
    expect(latest.stats).toEqual({ today: 1, total: 3 });
    await collectionRoute.DELETE(request(`practice-collections/${collection.id}`, 'DELETE'), { params: Promise.resolve({ id: collection.id }) });
    const removed = await readJson<PracticeSessionState>(session.GET(request('practice-session?date=2026-11-14')));
    expect(removed.active).toBeNull();
    expect(removed.stats).toEqual({ today: 1, total: 3 });
    expect(removed.revision).toBeGreaterThan(latest.revision);
  });

  it.each(['daily', 'session'])('rolls back ledger and progress on a database failure at %s so the same event can safely retry', async (stage) => {
    const { practice, collection } = await seed();
    const session = await import('@/app/api/practice-session/route');
    const taps = await import('@/app/api/practice-session/taps/route');
    const practiceRoute = await import('@/app/api/practices/[id]/route');
    const start = await readJson<ActiveSession>(session.POST(request('practice-session', 'POST', { action: 'start', collectionId: collection.id })));
    const body = { eventId: 'retry', runId: start.active.id, itemIndex: 0, date: '2026-11-13' };
    sqlite.exec(stage === 'daily'
      ? "CREATE TRIGGER fail_count BEFORE INSERT ON practice_daily_counts BEGIN SELECT RAISE(ABORT, 'disk failure'); END"
      : "CREATE TRIGGER fail_count BEFORE UPDATE ON practice_sessions BEGIN SELECT RAISE(ABORT, 'disk failure'); END");
    expect((await taps.POST(request('practice-session/taps', 'POST', body))).status).toBe(500);
    const failed = await readJson<ActiveSession>(session.GET(request('practice-session?date=2026-11-13')));
    expect(failed.active.counts).toEqual([0, 0]);
    expect(failed.stats).toEqual({ today: 0, total: 0 });
    sqlite.exec('DROP TRIGGER fail_count');
    expect((await taps.POST(request('practice-session/taps', 'POST', body))).status).toBe(200);
    await taps.POST(request('practice-session/taps', 'POST', body));
    const recovered = await readJson<ActiveSession>(session.GET(request('practice-session?date=2026-11-13')));
    expect(recovered.active.counts).toEqual([1, 0]);
    expect(recovered.stats).toEqual({ today: 1, total: 1 });
    expect((await readJson<Practice>(practiceRoute.GET(request(`practices/${practice.id}`), { params: Promise.resolve({ id: practice.id }) }))).personal_total).toBe(1);
  });

  it('audits publication and keeps the approved snapshot visible while edits are rejected or review fails', async () => {
    const { practice, collection } = await seed();
    const practiceRoute = await import('@/app/api/practices/[id]/route');
    const collectionRoute = await import('@/app/api/practice-collections/[id]/route');
    const discover = await import('@/app/api/discover/[kind]/[id]/route');
    const moderation = await import('@/lib/practice-moderation');
    const context = { params: Promise.resolve({ id: practice.id }) };
    const publicContext = { params: Promise.resolve({ kind: 'practices', id: practice.id }) };
    expect((await discover.GET(request(`discover/practices/${practice.id}`), publicContext)).status).toBe(404);
    expect((await collectionRoute.POST(request(`practice-collections/${collection.id}`, 'POST', { action: 'publish' }), { params: Promise.resolve({ id: collection.id }) })).status).toBe(409);
    const published = await practiceRoute.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), context);
    expect(published.status).toBe(200);
    expect((await readJson<Practice>(published)).visibility).toBe('public');
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const enteredReview = new Promise<void>((resolve) => { entered = resolve; });
    const restore = moderation.setPracticeModerationAdapter(async (submission) => {
      expect(submission.snapshot.name).toBe('draft');
      entered();
      await waiting;
      return { approved: false, reason: 'needs revision' };
    });
    try {
      const editing = practiceRoute.PATCH(request(`practices/${practice.id}`, 'PATCH', { name: 'draft', recitation: 'unreviewed' }), context);
      await enteredReview;
      state.authenticated = false;
      const publicVersion = await readJson<Practice>(discover.GET(request(`discover/practices/${practice.id}`), publicContext));
      expect(publicVersion.name).toBe('practice');
      expect(publicVersion.recitation).toBe('recitation');
      expect(publicVersion.personal_total).toBeUndefined();
      expect(publicVersion.reviews).toBeUndefined();
      state.authenticated = true;
      release();
      expect((await readJson<Practice>(editing)).visibility).toBe('rejected');
    } finally { release(); restore(); }
    const restoreFailure = moderation.setPracticeModerationAdapter(async () => { throw new Error('offline'); });
    try { expect((await practiceRoute.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), context)).status).toBe(502); }
    finally { restoreFailure(); }
    expect((await readJson<Practice>(discover.GET(request(`discover/practices/${practice.id}`), publicContext))).recitation).toBe('recitation');
    const own = await readJson<Reviewed<Practice>>(practiceRoute.GET(request(`practices/${practice.id}`), context));
    expect(own.reviews.map((review) => review.status)).toEqual(['approved', 'rejected', 'error']);
    await practiceRoute.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), context);
    expect((await readJson<Practice>(discover.GET(request(`discover/practices/${practice.id}`), publicContext))).recitation).toBe('unreviewed');
    expect((await collectionRoute.POST(request(`practice-collections/${collection.id}`, 'POST', { action: 'publish' }), { params: Promise.resolve({ id: collection.id }) })).status).toBe(200);
  });

  it('does not let stale moderation approve newer text or republish a withdrawn entity', async () => {
    const { practice } = await seed();
    const route = await import('@/app/api/practices/[id]/route');
    const discover = await import('@/app/api/discover/[kind]/[id]/route');
    const { setPracticeModerationAdapter } = await import('@/lib/practice-moderation');
    const context = { params: Promise.resolve({ id: practice.id }) };
    const publicContext = { params: Promise.resolve({ kind: 'practices', id: practice.id }) };
    await route.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), context);
    let release!: () => void;
    let entered!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const restore = setPracticeModerationAdapter(async (submission) => {
      if (submission.snapshot.name === 'older draft') { entered(); await wait; return { approved: true }; }
      return { approved: false };
    });
    try {
      const old = route.PATCH(request(`practices/${practice.id}`, 'PATCH', { name: 'older draft' }), context);
      await started;
      await route.PATCH(request(`practices/${practice.id}`, 'PATCH', { name: 'newer rejected draft' }), context);
      release();
      await old;
      expect((await readJson<Practice>(discover.GET(request(`discover/practices/${practice.id}`), publicContext))).name).toBe('practice');
      expect((await readJson<Reviewed<Practice>>(route.GET(request(`practices/${practice.id}`), context))).reviews.some((review) => review.status === 'stale')).toBe(true);
    } finally { release(); restore(); }
    const waitAgain = new Promise<void>((resolve) => { release = resolve; });
    const startedAgain = new Promise<void>((resolve) => { entered = resolve; });
    const restoreAgain = setPracticeModerationAdapter(async () => { entered(); await waitAgain; return { approved: true }; });
    try {
      const pending = route.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), context);
      await startedAgain;
      expect((await route.POST(request(`practices/${practice.id}`, 'POST', { action: 'unpublish' }), context)).status).toBe(200);
      release();
      await pending;
      expect((await discover.GET(request(`discover/practices/${practice.id}`), publicContext)).status).toBe(404);
      expect((await readJson<Practice>(route.GET(request(`practices/${practice.id}`), context))).visibility).toBe('private');
    } finally { release(); restoreAgain(); }
  });

  it('deep copies public collections privately with provenance and survives original withdrawal and deletion', async () => {
    const { practice, collection } = await seed();
    const practices = await import('@/app/api/practices/route');
    const practiceRoute = await import('@/app/api/practices/[id]/route');
    const collectionRoute = await import('@/app/api/practice-collections/[id]/route');
    const discover = await import('@/app/api/discover/[kind]/[id]/route');
    const session = await import('@/app/api/practice-session/route');
    await practiceRoute.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), { params: Promise.resolve({ id: practice.id }) });
    await collectionRoute.POST(request(`practice-collections/${collection.id}`, 'POST', { action: 'publish' }), { params: Promise.resolve({ id: collection.id }) });
    state.owner = 'reader';
    const singleResponse = await practiceRoute.POST(request(`practices/${practice.id}`, 'POST', { action: 'copy' }), { params: Promise.resolve({ id: practice.id }) });
    expect(singleResponse.status).toBe(200);
    const single = await readJson<Practice>(singleResponse);
    expect(single).toMatchObject({ owner_id: 'reader', source_id: practice.id, source_name: 'practice', source_owner_id: 'owner', visibility: 'private', likes: 0, favorited: false, liked: false, personal_total: 0 });
    const copiedResponse = await collectionRoute.POST(request(`practice-collections/${collection.id}`, 'POST', { action: 'copy' }), { params: Promise.resolve({ id: collection.id }) });
    expect(copiedResponse.status).toBe(200);
    const copy = await readJson<Collection>(copiedResponse);
    expect(copy).toMatchObject({ owner_id: 'reader', source_id: collection.id, source_name: 'collection', source_owner_id: 'owner', visibility: 'private', total_target: 4, likes: 0 });
    expect(copy.items).toHaveLength(2);
    expect(copy.items.every((item) => item.id !== practice.id && item.owner_id === 'reader' && item.visibility === 'private' && item.source_id === practice.id)).toBe(true);
    expect(new Set(copy.items.map((item) => item.item_id)).size).toBe(2);
    expect((await readJson<PracticeSessionState>(session.GET(request('practice-session')))).active).toBeNull();
    await practiceRoute.PATCH(request(`practices/${single.id}`, 'PATCH', { recitation: 'my text', target: 9 }), { params: Promise.resolve({ id: single.id }) });
    state.owner = 'owner';
    expect((await readJson<Practice>(discover.GET(request(`discover/practices/${practice.id}`), { params: Promise.resolve({ kind: 'practices', id: practice.id }) }))).recitation).toBe('recitation');
    await practiceRoute.POST(request(`practices/${practice.id}`, 'POST', { action: 'unpublish' }), { params: Promise.resolve({ id: practice.id }) });
    expect((await discover.GET(request(`discover/collections/${collection.id}`), { params: Promise.resolve({ kind: 'collections', id: collection.id }) })).status).toBe(404);
    await collectionRoute.DELETE(request(`practice-collections/${collection.id}`, 'DELETE'), { params: Promise.resolve({ id: collection.id }) });
    await practiceRoute.DELETE(request(`practices/${practice.id}`, 'DELETE'), { params: Promise.resolve({ id: practice.id }) });
    state.owner = 'reader';
    expect((await practiceRoute.POST(request(`practices/${practice.id}`, 'POST', { action: 'copy' }), { params: Promise.resolve({ id: practice.id }) })).status).toBe(404);
    const remaining = await readJson<Practice[]>(practices.GET(request('practices')));
    expect(remaining.find((item) => item.id === single.id)).toMatchObject({ recitation: 'my text', source_name: 'practice', source_owner_id: 'owner' });
    expect((await readJson<Collection>(collectionRoute.GET(request(`practice-collections/${copy.id}`), { params: Promise.resolve({ id: copy.id }) }))).items.map((item) => item.recitation)).toEqual(['recitation', 'recitation']);
  });

  it('discovers only approved searchable content with stable pages and idempotent likes and reference-only favorites', async () => {
    const practices = await import('@/app/api/practices/route');
    const route = await import('@/app/api/practices/[id]/route');
    const discover = await import('@/app/api/discover/route');
    const detail = await import('@/app/api/discover/[kind]/[id]/route');
    const favorites = await import('@/app/api/discover/favorites/route');
    const ids: string[] = [];
    for (let index = 0; index < 21; index++) {
      const created = await readJson<Practice>(practices.POST(request('practices', 'POST', { name: `public ${index}`, description: 'searchable', recitation: 'text', prompts: [], target: 1 })));
      ids.push(created.id);
      await route.POST(request(`practices/${created.id}`, 'POST', { action: 'publish' }), { params: Promise.resolve({ id: created.id }) });
    }
    await practices.POST(request('practices', 'POST', { name: 'private searchable', recitation: 'secret', prompts: [], target: 1 }));
    state.authenticated = false;
    const first = await readJson<DiscoveryPage>(discover.GET(request('discover?kind=practices&sort=latest&q=searchable&page=1')));
    const second = await readJson<DiscoveryPage>(discover.GET(request('discover?kind=practices&sort=latest&q=searchable&page=2')));
    expect(first.items).toHaveLength(20);
    expect(first.hasMore).toBe(true);
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(21);
    expect((await readJson<DiscoveryPage>(discover.GET(request('discover?kind=practices&q=private')))).items).toEqual([]);
    expect((await discover.GET(request('discover?kind=invalid'))).status).toBe(400);
    expect((await route.POST(request(`practices/${ids[0]}`, 'POST', { action: 'like', enabled: true }), { params: Promise.resolve({ id: ids[0] }) })).status).toBe(401);
    state.authenticated = true;
    state.owner = 'reader';
    const action = (action: string, enabled: boolean) => route.POST(request(`practices/${ids[0]}`, 'POST', { action, enabled }), { params: Promise.resolve({ id: ids[0] }) });
    await Promise.all([action('like', true), action('like', true)]);
    await Promise.all([action('favorite', true), action('favorite', true)]);
    const liked = await readJson<Practice>(detail.GET(request(`discover/practices/${ids[0]}`), { params: Promise.resolve({ kind: 'practices', id: ids[0] }) }));
    expect(liked).toMatchObject({ likes: 1, liked: true, favorited: true });
    expect((await readJson<DiscoveryPage>(discover.GET(request('discover?kind=practices&sort=likes')))).items[0].id).toBe(ids[0]);
    expect(await readJson<Practice[]>(practices.GET(request('practices')))).toEqual([]);
    const saved = await readJson<FavoritesPage>(favorites.GET(request('discover/favorites?kind=practices')));
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0]).toMatchObject({ id: ids[0], available: true, content: { id: ids[0] } });
    await action('like', false);
    expect((await readJson<Practice>(action('like', false))).likes).toBe(0);
    state.owner = 'owner';
    await route.POST(request(`practices/${ids[0]}`, 'POST', { action: 'unpublish' }), { params: Promise.resolve({ id: ids[0] }) });
    state.owner = 'reader';
    const withdrawn = await readJson<FavoritesPage>(favorites.GET(request('discover/favorites?kind=practices')));
    expect(withdrawn.items).toEqual([{ id: ids[0], kind: 'practices', available: false, content: null }]);
    expect((await action('favorite', true)).status).toBe(404);
    expect((await action('favorite', false)).status).toBe(200);
    expect((await readJson<FavoritesPage>(favorites.GET(request('discover/favorites?kind=practices')))).items).toEqual([]);
  });

  it('rejects concurrent reuse of an event identity for different payloads and never spills boundary clicks', async () => {
    const { collection } = await seed(1);
    const session = await import('@/app/api/practice-session/route');
    const taps = await import('@/app/api/practice-session/taps/route');
    const started = await readJson<ActiveSession>(session.POST(request('practice-session', 'POST', { action: 'start', collectionId: collection.id })));
    const body = { eventId: 'identity', runId: started.active.id, itemIndex: 0, date: '2026-11-13' };
    const conflicting = await Promise.all([
      taps.POST(request('practice-session/taps', 'POST', body)),
      taps.POST(request('practice-session/taps', 'POST', { ...body, date: '2026-11-14' })),
    ]);
    expect(conflicting.map((response) => response.status).sort()).toEqual([200, 409]);
    const restarted = await readJson<ActiveSession>(session.POST(request('practice-session', 'POST', { action: 'restart', collectionId: collection.id })));
    const boundary = await Promise.all(['first', 'second'].map((eventId) => taps.POST(request('practice-session/taps', 'POST', { ...body, eventId, runId: restarted.active.id }))));
    expect(boundary.map((response) => response.status).sort()).toEqual([200, 200]);
    const current = await readJson<ActiveSession>(session.GET(request('practice-session?date=2026-11-13')));
    expect(current.active.counts).toEqual([1, 0]);
    expect(current.stats).toEqual({ today: 3, total: 3 });
    expect((await taps.POST(request('practice-session/taps', 'POST', { ...body, eventId: 'bad-date', date: '2026-02-30' }))).status).toBe(400);
  });

  it('keeps invalid public collection edits pending and withdraws approved dependencies even after draft removal', async () => {
    const { practice, collection } = await seed();
    const privateContent = await seed(5);
    const practices = await import('@/app/api/practices/[id]/route');
    const collections = await import('@/app/api/practice-collections/[id]/route');
    const discover = await import('@/app/api/discover/[kind]/[id]/route');
    const context = { params: Promise.resolve({ id: collection.id }) };
    const publicContext = { params: Promise.resolve({ kind: 'collections', id: collection.id }) };
    await practices.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), { params: Promise.resolve({ id: practice.id }) });
    await collections.POST(request(`practice-collections/${collection.id}`, 'POST', { action: 'publish' }), context);
    const editing = await collections.PATCH(request(`practice-collections/${collection.id}`, 'PATCH', { name: 'secret new title', practiceIds: [privateContent.practice.id] }), context);
    expect(editing.status).toBe(409);
    const draft = await readJson<Collection>(collections.GET(request(`practice-collections/${collection.id}`), context));
    expect(draft.visibility).toBe('pending');
    expect(draft.items[0].id).toBe(privateContent.practice.id);
    const approved = await readJson<Collection>(discover.GET(request(`discover/collections/${collection.id}`), publicContext));
    expect(approved.name).toBe('collection');
    expect(approved.items.map((item) => item.id)).toEqual([practice.id, practice.id]);
    await practices.POST(request(`practices/${practice.id}`, 'POST', { action: 'unpublish' }), { params: Promise.resolve({ id: practice.id }) });
    expect((await discover.GET(request(`discover/collections/${collection.id}`), publicContext)).status).toBe(404);
    state.owner = 'reader';
    expect((await collections.POST(request(`practice-collections/${collection.id}`, 'POST', { action: 'copy' }), context)).status).toBe(404);
  });

  it('invalidates an in-flight collection review when a child is withdrawn even if it is published again', async () => {
    const { practice, collection } = await seed();
    const practices = await import('@/app/api/practices/[id]/route');
    const collections = await import('@/app/api/practice-collections/[id]/route');
    const discover = await import('@/app/api/discover/[kind]/[id]/route');
    const { setPracticeModerationAdapter } = await import('@/lib/practice-moderation');
    const childContext = { params: Promise.resolve({ id: practice.id }) };
    const context = { params: Promise.resolve({ id: collection.id }) };
    await practices.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), childContext);
    let release!: () => void;
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const restore = setPracticeModerationAdapter(async (submission) => {
      if (submission.kind === 'collections') { entered(); await waiting; }
      return { approved: true };
    });
    try {
      const publishing = collections.POST(request(`practice-collections/${collection.id}`, 'POST', { action: 'publish' }), context);
      await started;
      await practices.POST(request(`practices/${practice.id}`, 'POST', { action: 'unpublish' }), childContext);
      await practices.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), childContext);
      release();
      const result = await readJson<Reviewed<Collection>>(publishing);
      expect(result.reviews.map((review) => review.status)).toEqual(['stale']);
      expect((await discover.GET(request(`discover/collections/${collection.id}`), { params: Promise.resolve({ kind: 'collections', id: collection.id }) })).status).toBe(404);
    } finally { release(); restore(); }
    expect((await collections.POST(request(`practice-collections/${collection.id}`, 'POST', { action: 'publish' }), context)).status).toBe(200);
    expect((await discover.GET(request(`discover/collections/${collection.id}`), { params: Promise.resolve({ kind: 'collections', id: collection.id }) })).status).toBe(200);
  });

  it('uses the requested time zone for today without moving an event from its original date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T23:30:00Z'));
    const { collection } = await seed();
    const session = await import('@/app/api/practice-session/route');
    const taps = await import('@/app/api/practice-session/taps/route');
    const started = await readJson<ActiveSession>(session.POST(request('practice-session', 'POST', { action: 'start', collectionId: collection.id })));
    expect(started.date).toBe('2026-11-14');
    const body = { eventId: 'timezone', runId: started.active.id, itemIndex: 0, date: '2026-11-13' };
    const pacific = await readJson<PracticeSessionState>(taps.POST(request('practice-session/taps?timeZone=America/Los_Angeles', 'POST', body)));
    expect(pacific).toMatchObject({ date: '2026-11-13', stats: { today: 1, total: 1 } });
    const shanghai = await readJson<PracticeSessionState>(session.GET(request('practice-session?timeZone=Asia/Shanghai')));
    expect(shanghai).toMatchObject({ date: '2026-11-14', stats: { today: 0, total: 1 } });
    await taps.POST(request('practice-session/taps?timeZone=Asia/Shanghai', 'POST', body));
    expect((await readJson<PracticeSessionState>(session.GET(request('practice-session?timeZone=Asia/Shanghai')))).stats).toEqual({ today: 0, total: 1 });
  });

  it('publishes long ordered collections without personal data and rolls back every copied child if copying fails', async () => {
    const { practice } = await seed(1);
    const practices = await import('@/app/api/practices/route');
    const collections = await import('@/app/api/practice-collections/route');
    const practiceRoute = await import('@/app/api/practices/[id]/route');
    const collectionRoute = await import('@/app/api/practice-collections/[id]/route');
    const discover = await import('@/app/api/discover/[kind]/[id]/route');
    const session = await import('@/app/api/practice-session/route');
    const taps = await import('@/app/api/practice-session/taps/route');
    const collection = await readJson<Collection>(collections.POST(request('practice-collections', 'POST', { name: 'long', practiceIds: Array(60).fill(practice.id) })));
    const context = { params: Promise.resolve({ id: collection.id }) };
    const started = await readJson<ActiveSession>(session.POST(request('practice-session', 'POST', { action: 'start', collectionId: collection.id })));
    await taps.POST(request('practice-session/taps', 'POST', { eventId: 'private-progress', runId: started.active.id, itemIndex: 0, date: '2026-11-13' }));
    await practiceRoute.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), { params: Promise.resolve({ id: practice.id }) });
    expect((await collectionRoute.POST(request(`practice-collections/${collection.id}`, 'POST', { action: 'publish' }), context)).status).toBe(200);
    const approved = await readJson<Collection>(discover.GET(request(`discover/collections/${collection.id}`), { params: Promise.resolve({ kind: 'collections', id: collection.id }) }));
    expect(approved.items).toHaveLength(60);
    expect(approved.total_target).toBe(60);
    expect(approved.progress).toBeUndefined();
    expect(approved.items.every((item) => item.personal_total === undefined && item.reviews === undefined)).toBe(true);
    state.owner = 'reader';
    sqlite.exec("CREATE TRIGGER fail_copy BEFORE INSERT ON practice_collection_items BEGIN SELECT RAISE(ABORT, 'disk full'); END");
    expect((await collectionRoute.POST(request(`practice-collections/${collection.id}`, 'POST', { action: 'copy' }), context)).status).toBe(500);
    expect(await readJson<Practice[]>(practices.GET(request('practices')))).toEqual([]);
    expect(await readJson<Collection[]>(collections.GET(request('practice-collections')))).toEqual([]);
    sqlite.exec('DROP TRIGGER fail_copy');
    const copy = await readJson<Collection>(collectionRoute.POST(request(`practice-collections/${collection.id}`, 'POST', { action: 'copy' }), context));
    expect(copy.items).toHaveLength(60);
    expect(copy.progress).toBeNull();
    expect((await collectionRoute.POST(request(`practice-collections/${copy.id}`, 'POST', { action: 'publish' }), { params: Promise.resolve({ id: copy.id }) })).status).toBe(409);
  });

  it('arranges repeated practices independently and protects referenced content and ownership', async () => {
    const practices = await import('@/app/api/practices/route');
    const practice = await import('@/app/api/practices/[id]/route');
    const collections = await import('@/app/api/practice-collections/route');
    const collection = await import('@/app/api/practice-collections/[id]/route');
    const first = await readJson<Practice>(practices.POST(request('practices', 'POST', { name: 'first', recitation: 'one', prompts: [], target: 2 })));
    const second = await readJson<Practice>(practices.POST(request('practices', 'POST', { name: 'second', recitation: 'two', prompts: ['a', 'b'], target: 3 })));
    const created = await collections.POST(request('practice-collections', 'POST', { name: 'ordered', practiceIds: [first.id, second.id, first.id] }));
    expect(created.status).toBe(201);
    const group = await readJson<Collection>(created);
    expect(group.items.map((item) => item.id)).toEqual([first.id, second.id, first.id]);
    expect(new Set(group.items.map((item) => item.item_id)).size).toBe(3);
    expect(group.total_target).toBe(7);
    expect((await practice.DELETE(request(`practices/${first.id}`, 'DELETE'), { params: Promise.resolve({ id: first.id }) })).status).toBe(409);
    const edited = await collection.PATCH(request(`practice-collections/${group.id}`, 'PATCH', { practiceIds: [second.id, first.id] }), { params: Promise.resolve({ id: group.id }) });
    expect((await readJson<Collection>(edited)).items.map((item) => item.id)).toEqual([second.id, first.id]);
    await practice.PATCH(request(`practices/${first.id}`, 'PATCH', { recitation: 'changed', target: 4 }), { params: Promise.resolve({ id: first.id }) });
    expect((await readJson<Collection>(collection.GET(request(`practice-collections/${group.id}`), { params: Promise.resolve({ id: group.id }) }))).total_target).toBe(7);
    state.owner = 'other';
    expect(await readJson<Practice[]>(practices.GET(request('practices')))).toEqual([]);
    expect((await practice.PATCH(request(`practices/${first.id}`, 'PATCH', { name: 'stolen' }), { params: Promise.resolve({ id: first.id }) })).status).toBe(404);
    expect((await collections.POST(request('practice-collections', 'POST', { name: 'stolen', practiceIds: [first.id] }))).status).toBe(404);
    state.owner = 'owner';
    expect((await collection.DELETE(request(`practice-collections/${group.id}`, 'DELETE'), { params: Promise.resolve({ id: group.id }) })).status).toBe(200);
    expect((await practice.GET(request(`practices/${first.id}`), { params: Promise.resolve({ id: first.id }) })).status).toBe(200);
    expect((await practice.DELETE(request(`practices/${first.id}`, 'DELETE'), { params: Promise.resolve({ id: first.id }) })).status).toBe(200);
    expect((await practices.POST(request('practices', 'POST', { name: 'bad', recitation: 'x', prompts: [], target: 0 }))).status).toBe(400);
    state.authenticated = false;
    expect((await practices.GET(request('practices'))).status).toBe(401);
    expect((await collections.POST(request('practice-collections', 'POST', {}))).status).toBe(401);
  });

  it('creates a private practice with recitation and target', async () => {
    const { POST, GET } = await import('@/app/api/practices/route');
    const response = await POST(new NextRequest('http://localhost/api/practices', {
      method: 'POST',
      body: JSON.stringify({ name: '清心', recitation: '南无观世音菩萨', prompts: ['放下杂念'], target: 3 }),
    }));
    expect(response.status).toBe(201);
    const created = await readJson<Practice>(response);
    expect(created.recitation).toBe('南无观世音菩萨');
    expect(created.target).toBe(3);
    expect(created.visibility).toBe('private');
    const list = await GET(new NextRequest('http://localhost/api/practices'));
    expect((await readJson<Practice[]>(list)).some((item) => item.id === created.id)).toBe(true);
  });
});