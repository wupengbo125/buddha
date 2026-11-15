import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ulid } from 'ulid';
import { getEnv } from '@/lib/runtime';
import { requireSession, jsonError, readJson } from '@/lib/http';
import { OWNER_ID } from '@/lib/auth';
import type { CounterTotals } from '@/lib/taps';

// 时长模式离开页面时调用：本次连续没到「最少坚持」，就从今日/累计里扣掉设定的时长。
const LeaveBody = z.object({
  event_id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  started_at: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSession(req))) return jsonError('未登录', 401);
  const { id } = await params;
  const parsed = LeaveBody.safeParse(await readJson(req));
  if (!parsed.success) return jsonError('输入无效', 400);
  const { event_id, started_at, date } = parsed.data;
  try {
    const { DB } = getEnv();
    const practice = await DB.prepare('SELECT target_kind, min_seconds, penalty_seconds, idle_seconds FROM practices WHERE id = ? AND owner_id = ?')
      .bind(id, OWNER_ID)
      .first<{ target_kind: string; min_seconds: number; penalty_seconds: number; idle_seconds: number }>();
    if (!practice || practice.target_kind !== 'time') return jsonError('不需要惩罚', 400);
    const started = Date.parse(started_at);
    if (!Number.isFinite(started) || Date.now() - started > 12 * 3600 * 1000) return jsonError('时间无效', 400);
    const stayed = Math.max(0, (Date.now() - started) / 1000);
    const penalty = Math.max(0, Math.round(practice.penalty_seconds ?? 0));
    if (stayed >= Math.max(1, practice.min_seconds ?? 300) || penalty === 0) return NextResponse.json({ applied: false, event_id });
    const inserted = await DB.prepare(
      'INSERT OR IGNORE INTO tap_events (id, counter_id, device_id, event_id, delta, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(ulid(), id, OWNER_ID, event_id, -penalty, date, new Date().toISOString())
      .run();
    const current = await DB.prepare('SELECT total, today, today_date FROM counters WHERE id = ?').bind(id).first<CounterTotals>();
    const applied = Number(inserted.meta?.changes ?? 0) > 0;
    return NextResponse.json({ ...current, event_id, applied, penalty });
  } catch {
    return jsonError('扣时失败', 500);
  }
}
