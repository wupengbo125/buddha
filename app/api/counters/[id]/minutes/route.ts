import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ulid } from 'ulid';
import { getEnv } from '@/lib/runtime';
import { currentOwner, jsonError, readJson } from '@/lib/http';
import type { CounterTotals } from '@/lib/taps';

// 时长模式：前端本地攒满「最少坚持」后，每满一分钟上报一次整分钟。
const Body = z.object({
  event_id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  minutes: z.number().int().min(1).max(600),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const owner = await currentOwner(req);
  if (!owner) return jsonError('未登录', 401);
  const { id } = await params;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError('输入无效', 400);
  const { event_id, minutes, date } = parsed.data;
  try {
    const { DB } = getEnv();
    const practice = await DB.prepare('SELECT target_kind FROM practices WHERE id = ? AND owner_id = ?').bind(id, owner).first<{ target_kind: string }>();
    if (!practice || practice.target_kind !== 'time') return jsonError('不是时长模式', 400);
    // 累计由一个数承载；event_id 只留 7 天用于防重发。
    const seconds = minutes * 60;
    const inserted = await DB.prepare(
      'INSERT OR IGNORE INTO tap_marks (counter_id, owner_id, event_id, delta, seconds, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(id, owner, event_id, seconds, seconds, date, new Date().toISOString())
      .run();
    if (!inserted.success) return jsonError('上报失败', 500);
    await DB.prepare('DELETE FROM tap_marks WHERE owner_id = ? AND created_at < ?').bind(owner, new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()).run();
    const current = await DB.prepare('SELECT total, today, today_date FROM counters WHERE id = ?').bind(id).first<CounterTotals>();
    return NextResponse.json({ ...current, event_id, applied: Number(inserted.meta?.changes ?? 0) > 0 });
  } catch {
    return jsonError('上报失败', 500);
  }
}
