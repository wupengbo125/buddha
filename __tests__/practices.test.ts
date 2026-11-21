import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createRequire } from 'node:module';
import { readSchemaSql, sqliteD1 } from '@/lib/local';
import type { discoverList, favoriteList } from '@/lib/practice-discovery';
import type { Practice, PracticeReview } from '@/lib/practice-types';

type Reviewed<Content> = Content & { reviews: PracticeReview[] };
type DiscoveryPage = Awaited<ReturnType<typeof discoverList>>;
type FavoritesPage = Awaited<ReturnType<typeof favoriteList>>;

async function readJson<Result>(response: Response | Promise<Response>): Promise<Result> {
  return (await response).json() as Promise<Result>;
}

const state = vi.hoisted(() => ({ db: null as any, owner: 'owner', authenticated: true, deleteImage: vi.fn() }));
vi.mock('@/lib/session', () => ({ requireSession: async () => state.authenticated, currentOwner: async () => state.authenticated ? state.owner : null }));
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
  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  it('creates a practice with a backing counter and counts taps', async () => {
    const practices = await import('@/app/api/practices/route');
    const detail = await import('@/app/api/practices/[id]/route');
    const counters = await import('@/app/api/counters/route');
    const taps = await import('@/app/api/counters/[id]/taps/route');
    const practice = await readJson<Practice>(practices.POST(request('practices', 'POST', {
      name: 'wish', prompts: ['first', 'second'], target: 108,
    })));
    expect(await readJson(counters.GET(request('counters')))).toMatchObject({
      counters: [{ id: practice.id, name: 'wish', caption: 'first', total: 0 }],
    });
    const response = await taps.POST(request(`counters/${practice.id}/taps`, 'POST', {
      event_id: 'single-one', delta: 1, date: '2026-11-13',
    }), context(practice.id));
    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({ total: 1, applied: true });
    expect(await readJson(detail.GET(request(`practices/${practice.id}`), context(practice.id)))).toMatchObject({
      id: practice.id, name: 'wish', personal_total: 1,
    });
    expect(await readJson(practices.GET(request('practices')))).toMatchObject([{ id: practice.id, personal_total: 1 }]);
  });

  it('applies a batched tap delta once and keeps today counts', async () => {
    const practices = await import('@/app/api/practices/route');
    const taps = await import('@/app/api/counters/[id]/taps/route');
    const practice = await readJson<Practice>(practices.POST(request('practices', 'POST', { name: 'batch', prompts: [], target: 500 })));
    for (const [event, delta] of [['batch-100', 100], ['batch-1', 1]] as const) {
      await taps.POST(request(`counters/${practice.id}/taps`, 'POST', { event_id: event, delta, date: '2026-11-13' }), context(practice.id));
    }
    expect(await readJson(practices.GET(request('practices')))).toMatchObject([{ personal_total: 101 }]);
    const duplicate = await readJson<{ applied: boolean }>(taps.POST(request(`counters/${practice.id}/taps`, 'POST', { event_id: 'batch-100', delta: 100, date: '2026-11-13' }), context(practice.id)));
    expect(duplicate.applied).toBe(false);
    expect(await readJson(practices.GET(request('practices')))).toMatchObject([{ personal_total: 101 }]);
  });

  it('keeps practice fields coherent through the detail PATCH', async () => {
    const practices = await import('@/app/api/practices/route');
    const detail = await import('@/app/api/practices/[id]/route');
    const practice = await readJson<Practice>(practices.POST(request('practices', 'POST', {
      name: 'edit', prompts: ['one'], target: 108,
    })));
    const updated = await readJson<Practice>(detail.PATCH(request(`practices/${practice.id}`, 'PATCH', { name: 'edited', targetKind: 'time', minSeconds: 300 }), context(practice.id)));
    expect(updated).toMatchObject({ id: practice.id, name: 'edited', targetKind: 'time', minSeconds: 300, prompts: ['one'] });
  });

  it('audits publication and keeps the approved snapshot while edits go back to pending', async () => {
    const practices = await import('@/app/api/practices/route');
    const detail = await import('@/app/api/practices/[id]/route');
    const practice = await readJson<Practice>(practices.POST(request('practices', 'POST', { name: 'public one', prompts: [], target: 108 })));
    const published = await readJson<Reviewed<Practice>>(detail.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), context(practice.id)));
    expect(published).toMatchObject({ visibility: 'public', reviews: [{ status: 'approved' }] });
    sqlite.prepare('UPDATE practices SET approved_snapshot = ? WHERE id = ?').run(JSON.stringify({ name: 'snapshot' }), practice.id);
    const edited = await readJson<Reviewed<Practice>>(detail.PATCH(request(`practices/${practice.id}`, 'PATCH', { name: 'snapshot' }), context(practice.id)));
    expect(edited).toMatchObject({ visibility: 'public', reviews: [{ status: 'approved' }, { status: 'approved' }] });
    state.owner = 'owner';
    const withdrawn = await readJson<Practice>(detail.POST(request(`practices/${practice.id}`, 'POST', { action: 'unpublish' }), context(practice.id)));
    expect(withdrawn.visibility).toBe('private');
  });

  it('restart clears the finished round without touching totals', async () => {
    const practices = await import('@/app/api/practices/route');
    const detail = await import('@/app/api/practices/[id]/route');
    const taps = await import('@/app/api/counters/[id]/taps/route');
    const practice = await readJson<Practice>(practices.POST(request('practices', 'POST', { name: 'round', prompts: [], target: 2 })));
    await taps.POST(request(`counters/${practice.id}/taps`, 'POST', { event_id: 'round-2', delta: 2, date: '2026-11-13' }), context(practice.id));
    sqlite.prepare('UPDATE practices SET round_done = 1 WHERE id = ?').run(practice.id);
    await detail.POST(request(`practices/${practice.id}`, 'POST', { action: 'restart' }), context(practice.id));
    expect(await readJson(practices.GET(request('practices')))).toMatchObject([{ roundDone: false, personal_total: 2 }]);

    // 再念一次后需重新念满一轮（target=2）：total 从 2 到 3 仍未完成，到 4 才完成。
    await taps.POST(request(`counters/${practice.id}/taps`, 'POST', { event_id: 'round-3', delta: 1, date: '2026-11-13' }), context(practice.id));
    expect(await readJson(practices.GET(request('practices')))).toMatchObject([{ roundDone: false, personal_total: 3 }]);
    await taps.POST(request(`counters/${practice.id}/taps`, 'POST', { event_id: 'round-4', delta: 1, date: '2026-11-13' }), context(practice.id));
    expect(await readJson(practices.GET(request('practices')))).toMatchObject([{ roundDone: true, personal_total: 4 }]);
  });

  it('copies a public practice privately with provenance', async () => {
    const practices = await import('@/app/api/practices/route');
    const detail = await import('@/app/api/practices/[id]/route');
    const source = await readJson<Practice>(practices.POST(request('practices', 'POST', { name: 'shared', prompts: ['p'], target: 108 })));
    await detail.POST(request(`practices/${source.id}`, 'POST', { action: 'publish' }), context(source.id));
    state.owner = 'friend';
    const copied = await readJson<Practice>(detail.POST(request(`practices/${source.id}`, 'POST', { action: 'copy' }), context(source.id)));
    expect(copied).toMatchObject({ owner_id: 'friend', source_id: source.id, source_name: null, personal_total: 0, visibility: 'private' });
  });

  it('copies an own private practice without publishing it first', async () => {
    const practices = await import('@/app/api/practices/route');
    const detail = await import('@/app/api/practices/[id]/route');
    const mine = await readJson<Practice>(practices.POST(request('practices', 'POST', { name: '只给自己', prompts: ['p'], target: 108, targetKind: 'time', targetSeconds: 600, minSeconds: 300 })));
    const copied = await readJson<Practice>(detail.POST(request(`practices/${mine.id}`, 'POST', { action: 'copy' }), context(mine.id)));
    expect(copied).toMatchObject({ owner_id: 'owner', source_id: mine.id, name: '只给自己', targetKind: 'time', targetSeconds: 600, minSeconds: 300, personal_total: 0 });
  });

  it('discovers approved content with likes and favorites, and hides withdrawn content', async () => {
    const practices = await import('@/app/api/practices/route');
    const detail = await import('@/app/api/practices/[id]/route');
    const discover = await import('@/app/api/discover/route');
    const favorites = await import('@/app/api/discover/favorites/route');
    const practice = await readJson<Practice>(practices.POST(request('practices', 'POST', { name: 'shared', prompts: [], target: 108 })));
    await detail.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), context(practice.id));
    state.owner = 'friend';
    const list = await readJson<DiscoveryPage>(discover.GET(request('discover?q=shared')));
    expect(list.items).toMatchObject([{ id: practice.id, name: 'shared' }]);
    const liked = await readJson<Practice>(detail.POST(request(`practices/${practice.id}`, 'POST', { action: 'like', enabled: true }), context(practice.id)));
    expect(liked).toMatchObject({ liked: true, likes: 1 });
    await detail.POST(request(`practices/${practice.id}`, 'POST', { action: 'favorite', enabled: true }), context(practice.id));
    expect(await readJson<FavoritesPage>(favorites.GET(request('discover/favorites')))).toMatchObject({
      items: [{ id: practice.id, available: true, content: { id: practice.id } }],
    });
    state.owner = 'owner';
    const withdrawn = await readJson<Practice>(detail.POST(request(`practices/${practice.id}`, 'POST', { action: 'unpublish' }), context(practice.id)));
    expect(withdrawn.visibility).toBe('private');
    expect(await readJson<DiscoveryPage>(discover.GET(request('discover?q=shared')))).toMatchObject({ items: [] });
  });

  it('deletes a practice together with its counter and interactions', async () => {
    const practices = await import('@/app/api/practices/route');
    const detail = await import('@/app/api/practices/[id]/route');
    const counters = await import('@/app/api/counters/route');
    const practice = await readJson<Practice>(practices.POST(request('practices', 'POST', { name: 'gone', prompts: [], target: 108 })));
    await detail.POST(request(`practices/${practice.id}`, 'POST', { action: 'publish' }), context(practice.id));
    await detail.POST(request(`practices/${practice.id}`, 'POST', { action: 'like', enabled: true }), context(practice.id));
    expect((await detail.DELETE(request(`practices/${practice.id}`, 'DELETE'), context(practice.id))).status).toBe(200);
    expect(await readJson(practices.GET(request('practices')))).toMatchObject([]);
    expect(await readJson(counters.GET(request('counters')))).toMatchObject({ counters: [] });
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM practice_likes').get().count).toBe(0);
  });

  it('zeroes today and total and clears the finished round', async () => {
    const practices = await import('@/app/api/practices/route');
    const detail = await import('@/app/api/practices/[id]/route');
    const taps = await import('@/app/api/counters/[id]/taps/route');
    const practice = await readJson<Practice>(practices.POST(request('practices', 'POST', { name: 'zero me', prompts: [], target: 108 })));
    await taps.POST(request(`counters/${practice.id}/taps`, 'POST', { event_id: 'zero-5', delta: 5, date: '2026-11-13' }), context(practice.id));
    sqlite.prepare('UPDATE practices SET round_done = 1 WHERE id = ?').run(practice.id);
    await detail.POST(request(`practices/${practice.id}`, 'POST', { action: 'zero' }), context(practice.id));
    expect(await readJson(practices.GET(request('practices')))).toMatchObject([{ personal_total: 0, today_total: 0, roundDone: false }]);
  });

  it('groups practices into wishlists that can hold several practices', async () => {
    const practices = await import('@/app/api/practices/route');
    const wishlists = await import('@/app/api/wishlists/route');
    const wishlist = await import('@/app/api/wishlists/[id]/route');
    const first = await readJson<Practice>(practices.POST(request('practices', 'POST', { name: '早课', prompts: [], target: 108 })));
    const second = await readJson<Practice>(practices.POST(request('practices', 'POST', { name: '晚课', prompts: [], target: 108 })));
    const morning = await readJson<{ id: string }>(wishlists.POST(request('wishlists', 'POST', { name: '早晨' })));
    await wishlist.PATCH(request(`wishlists/${morning.id}`, 'PATCH', { practiceIds: [first.id, second.id] }), context(morning.id));
    const evening = await readJson<{ id: string }>(wishlists.POST(request('wishlists', 'POST', { name: '晚上' })));
    await wishlist.PATCH(request(`wishlists/${evening.id}`, 'PATCH', { practiceIds: [first.id] }), context(evening.id));
    const lists = await readJson<{ id: string; name: string; practiceIds: string[] }[]>(wishlists.GET(request('wishlists')));
    expect(lists.find((entry) => entry.id === morning.id)?.practiceIds).toEqual([first.id, second.id]);
    expect(lists.find((entry) => entry.id === evening.id)?.practiceIds).toEqual([first.id]);
    await wishlist.DELETE(request(`wishlists/${evening.id}`, 'DELETE'), context(evening.id));
    expect((await readJson<{ id: string }[]>(wishlists.GET(request('wishlists')))).length).toBe(1);
  });

  it('rejects invalid input and unauthenticated access', async () => {
    const practices = await import('@/app/api/practices/route');
    const invalid = await practices.POST(request('practices', 'POST', { name: 'bad', target: 0 }));
    expect(invalid.status).toBe(400);
    state.authenticated = false;
    expect((await practices.GET(request('practices'))).status).toBe(401);
  });
});
