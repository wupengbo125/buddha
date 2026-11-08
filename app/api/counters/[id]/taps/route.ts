import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ulid } from 'ulid';
import { getEnv } from '@/lib/runtime';
import { requireSession, jsonError, readJson } from '@/lib/http';
import { OWNER_ID } from '@/lib/auth';
import { accumulateTotals, type CounterTotals } from '@/lib/taps';

const TapBody = z.object({
  event_id: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  delta: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireSession(req))) return jsonError('未登录', 401);
  const parsed = TapBody.safeParse(await readJson(req));
  if (!parsed.success) return jsonError('输入无效', 400);
  try {
    const { DB } = getEnv();
    const current = await DB.prepare('SELECT total, today, today_date FROM counters WHERE id = ?')
      .bind(params.id)
      .first<CounterTotals>();
    if (!current) return jsonError('计数器不存在', 404);

    // 幂等：UNIQUE(counter_id, device_id, event_id) 保持不变，device_id 固定 OWNER_ID，
    // event_id 为客户端随机生成，冲突只可能是「同 id 重发」这一种情形。
    const inserted = await DB.prepare(
      'INSERT OR IGNORE INTO tap_events (id, counter_id, device_id, event_id, delta, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(ulid(), params.id, OWNER_ID, parsed.data.event_id, parsed.data.delta, parsed.data.date, new Date().toISOString())
      .run();

    if (!inserted.success) return jsonError('上报失败', 500);
    const applied = Number(inserted.meta?.changes ?? 0) > 0;
    if (!applied) {
      // INSERT OR IGNORE 被 UNIQUE 忽略 = 同 event_id 重发：明确返回，客户端据此清对应批次，
      // 不会无条件清 pending 吞计数。
      return NextResponse.json({ ...current, event_id: parsed.data.event_id, applied: false });
    }

    const next = accumulateTotals(current, parsed.data.delta, parsed.data.date);
    await DB.prepare('UPDATE counters SET total = ?, today = ?, today_date = ?, updated_at = ? WHERE id = ?')
      .bind(next.total, next.today, next.today_date, new Date().toISOString(), params.id)
      .run();
    return NextResponse.json({ ...next, event_id: parsed.data.event_id, applied: true });
  } catch {
    return jsonError('上报失败', 500);
  }
}
