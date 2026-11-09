import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ulid } from 'ulid';
import { getEnv } from '@/lib/runtime';
import { requireSession, jsonError, readJson } from '@/lib/http';
import { OWNER_ID } from '@/lib/auth';
import type { CounterTotals } from '@/lib/taps';

// delta 固定按 1 处理：前端每次点击只发 1，别让请求能任意放大计数。
const TapBody = z.object({
  event_id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  delta: z.literal(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireSession(req))) return jsonError('未登录', 401);
  const parsed = TapBody.safeParse(await readJson(req));
  if (!parsed.success) return jsonError('输入无效', 400);
  const { event_id, date } = parsed.data;
  try {
    const { DB } = getEnv();
    const exists = await DB.prepare('SELECT id FROM counters WHERE id = ?').bind(params.id).first();
    if (!exists) return jsonError('计数器不存在', 404);

    // 幂等：UNIQUE(counter_id, device_id, event_id) 保持不变，device_id 固定 OWNER_ID。
    // 每次点击各生成一个新 event_id；同 id 重发（失败重试）被 INSERT OR IGNORE 忽略。
    const inserted = await DB.prepare(
      'INSERT OR IGNORE INTO tap_events (id, counter_id, device_id, event_id, delta, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(ulid(), params.id, OWNER_ID, event_id, 1, date, new Date().toISOString())
      .run();
    if (!inserted.success) return jsonError('上报失败', 500);

    const applied = Number(inserted.meta?.changes ?? 0) > 0;
    if (!applied) {
      // 同 event_id 重发：明确返回当前值 applied=false，客户端据此安全确认、不重复累加。
      const current = await DB.prepare('SELECT total, today, today_date FROM counters WHERE id = ?')
        .bind(params.id)
        .first<CounterTotals>();
      return NextResponse.json({ ...current, event_id, applied: false });
    }

    // 原子累加：单条 UPDATE 内完成读-改-写，并发快速点击不丢数。
    // date 由请求带；today_date 与本次 date 不同则当日归零（today=1），总数始终累加。
    await DB.prepare(
      `UPDATE counters SET
         total = total + 1,
         today = CASE WHEN today_date = ? THEN today + 1 ELSE 1 END,
         today_date = ?,
         updated_at = ?
       WHERE id = ?`,
    )
      .bind(date, date, new Date().toISOString(), params.id)
      .run();

    const next = await DB.prepare('SELECT total, today, today_date FROM counters WHERE id = ?')
      .bind(params.id)
      .first<CounterTotals>();
    return NextResponse.json({ ...next, event_id, applied: true });
  } catch {
    return jsonError('上报失败', 500);
  }
}
